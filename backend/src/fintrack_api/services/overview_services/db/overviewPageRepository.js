// GET /overview reads no domain calculator makes: bank balance, free cash, goals, activity.

import { toAmount } from '../../budget_services/core/money.js';
import { extractNoteFromDescription } from '../../../../utils/fintrackUtils/transactionManagement/extractNoteFromDescription.js';
import { derivedAccountBalanceSql } from '../../../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import { accountReportingWindowSql } from '../../../../utils/fintrackUtils/accountDataRetrieval/accountReportingWindow.js';
import { transactionRowColumns, TRANSACTION_ROW_SOURCE } from '../../../../utils/fintrackUtils/transactionManagement/transactionRowShape.js';
import { ACTIVITY_FILTER, ACTIVITY_READER_FILTER, ACTIVITY_ORDER } from '../../../../utils/fintrackUtils/transactionManagement/activityFilters.js';

// No total transaction count is read here: counting rows across every account would
// double every two-legged movement (an expense writes a withdraw on the bank and a deposit
// on the category, both non-slack rows), so the overview adds the five per-domain counts.

// NUMERIC, not FLOAT: netWorth and cashPosition add this figure to the domain cards and
// must agree with them to the cent.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'NUMERIC');

// Bank balance at the close of the reference month, slack excluded; cash counts as bank here. Derived from
// account_starting_amount, never account_balance; later movements are subtracted forward. An account
// opened after the month nets to 0 only because creators keep starting amount, balance and opening equal.

// Slack is excluded by TYPE, not name (a name test would drop an owner's account so named). Before
// migration 031 a bank account named 'slack' passes IN ('bank', 'cash'); figures hold as its legs cancel.
// No closed_at predicate: a month-close read needs the reporting window (open then), not the state today.
const BANK_BALANCE_QUERY = `
  WITH bounds AS (
    SELECT (($2::date + INTERVAL '1 month') AT TIME ZONE $3) AS next_month_start
  )
  SELECT COALESCE(SUM(
    ${DERIVED_BALANCE} - COALESCE((
      SELECT SUM(t.amount)
      FROM transactions t
      WHERE t.account_id = ua.account_id
        AND t.transaction_actual_date >= (SELECT next_month_start FROM bounds)
    ), 0)
  ), 0) AS bank_balance
  FROM user_accounts ua
  JOIN account_types act ON act.account_type_id = ua.account_type_id
  WHERE ua.user_id = $1
    AND act.account_type_name IN ('bank', 'cash')
    AND ${accountReportingWindowSql('ua', '$2::date', '$3')}
`;

// Cash not promised to a pocket; same accounts, month binding and window as the bank balance.
// The floor is per account, before the sum, so one account's surplus cannot absorb another's shortfall.
// Committed is the pocket_allocations ledger (releases are negative rows) cut at month close.
const FREE_CASH_QUERY = `
  WITH bounds AS (
    SELECT (($2::date + INTERVAL '1 month') AT TIME ZONE $3) AS next_month_start
  ),
  per_account AS (
    SELECT
      ${DERIVED_BALANCE} - COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.account_id = ua.account_id
          AND t.transaction_actual_date >= (SELECT next_month_start FROM bounds)
      ), 0) AS balance,
      COALESCE((
        SELECT SUM(pa.amount)
        FROM pocket_allocations pa
        WHERE pa.source_account_id = ua.account_id
          AND pa.allocation_actual_date < (SELECT next_month_start FROM bounds)
      ), 0) AS allocated
    FROM user_accounts ua
    JOIN account_types act ON act.account_type_id = ua.account_type_id
    WHERE ua.user_id = $1
      AND act.account_type_name IN ('bank', 'cash')
      AND ${accountReportingWindowSql('ua', '$2::date', '$3')}
  )
  SELECT COALESCE(SUM(GREATEST(balance - allocated, 0)), 0) AS free_cash
  FROM per_account
`;

// One row per pocket, not a total: a zero target must not enter a denominator; the caller decides.
// target_amount is NOT NULL CHECK (> 0), yet the caller keeps its null branch. One shared currency.
// Balance is what accounts have COMMITTED at month close; a pocket planned after it is not yet a goal.
const SAVING_GOALS_QUERY = `
  SELECT
    COALESCE(SUM(pa.amount) FILTER (
      WHERE pa.allocation_actual_date < (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
    ), 0) AS balance,
    p.target_amount AS target,
    p.name AS name,
    p.pocket_id AS pocket_id
  FROM pockets p
  LEFT JOIN pocket_allocations pa ON pa.pocket_id = p.pocket_id
  WHERE p.user_id = $1
    AND p.created_at < (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)
  GROUP BY p.pocket_id
  ORDER BY p.pocket_id
`;

// ACTIVITY_FILTER, ACTIVITY_READER_FILTER and ACTIVITY_ORDER live in activityFilters.js so
// the Data Export module shares the predicate without importing overview_services.

// The five most recent movements of any domain, in the shared row shape. Not bounded by the requested
// month: reading August in November would otherwise show an old teaser that looks like recording stopped.
const RECENT_ACTIVITY_QUERY = `
  SELECT${transactionRowColumns('$2')}${TRANSACTION_ROW_SOURCE}${ACTIVITY_FILTER}${ACTIVITY_ORDER}
  LIMIT 5
`;

// Same movements over a reader-chosen period, paginated. A null bound drops out; the upper bound covers
// its whole month. Bounds convert on the OWNER calendar: a bare TIMESTAMPTZ comparison uses the session
// zone and would push an 8pm month-end movement into the next month.
const ACTIVITY_PAGE_QUERY = `
  SELECT${transactionRowColumns('$4')}${TRANSACTION_ROW_SOURCE}${ACTIVITY_FILTER}
    AND ($2::date IS NULL OR tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $4))
    AND ($3::date IS NULL OR tr.transaction_actual_date < (($3::date + INTERVAL '1 month') AT TIME ZONE $4))${ACTIVITY_READER_FILTER}${ACTIVITY_ORDER}
  LIMIT $7 OFFSET $8
`;

// How many rows the page was cut out of: a second statement over the same filter rather
// than a window function on the page query, as the domain lists do, so the count covers the
// whole set and not the page.
const ACTIVITY_COUNT_QUERY = `
  SELECT COUNT(*) AS total_rows${TRANSACTION_ROW_SOURCE}${ACTIVITY_FILTER}
    AND ($2::date IS NULL OR tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $4))
    AND ($3::date IS NULL OR tr.transaction_actual_date < (($3::date + INTERVAL '1 month') AT TIME ZONE $4))${ACTIVITY_READER_FILTER}
`;

/**
 * The balance held in the user's bank and cash accounts at the close of one
 * month, slack excluded.
 *
 * @param {string} userId - UUID from the token, never from the client body
 * @param {string} referenceMonth - 'YYYY-MM-01', the month the balance is read at
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<number>} never null: 0 is a real balance
 */
export async function getBankBalance(pool, userId, referenceMonth, timeZone = 'UTC') {
 const { rows } = await pool.query(BANK_BALANCE_QUERY, [
  userId,
  referenceMonth,
  timeZone,
 ]);
 return toAmount(rows[0]?.bank_balance ?? 0);
}

/**
 * Bank and cash balance not committed to a pocket, at the close of one month.
 * Never null or negative: the floor is per account inside the statement.
 *
 * @param {string} userId - UUID from the token, never from the client body
 * @param {string} referenceMonth - 'YYYY-MM-01', the month the figure is read at
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<number>} never null: 0 is a real answer
 */
export async function getFreeCash(pool, userId, referenceMonth, timeZone = 'UTC') {
 const { rows } = await pool.query(FREE_CASH_QUERY, [
  userId,
  referenceMonth,
  timeZone,
 ]);
 return toAmount(rows[0]?.free_cash ?? 0);
}

/** One row per pocket: balance is the committed total at month close, not money held; target is never null today.
 * @returns {Promise<Array<{balance: number, target: number|null, name: string, pocketId: number}>>}
 */
export async function getSavingGoals(pool, userId, month, timeZone = 'UTC') {
 const { rows } = await pool.query(SAVING_GOALS_QUERY, [userId, month, timeZone]);

 return rows.map((row) => ({
  balance: toAmount(row.balance ?? 0),
  target: row.target === null || row.target === undefined ? null : toAmount(row.target),
  name: row.name,
  pocketId: row.pocket_id,
 }));
}

/**
 * The five most recent movements across every account the user owns.
 *
 * @param {string} userId - UUID from the token
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<object[]>} at most five rows, newest first
 */
export async function getRecentActivity(pool, userId, timeZone = 'UTC') {
 const { rows } = await pool.query(RECENT_ACTIVITY_QUERY, [userId, timeZone]);

 return rows.map((row) => ({
  ...row,
  note: extractNoteFromDescription(row.description),
 }));
}

/**
 * One page of the movements of a period the reader chose, plus the size of the
 * whole set.
 *
 * Both bounds may be null and that is the ordinary case, not a degenerate one.
 *
 * @param {string} userId - UUID from the token
 * @param {{from: (string|null), to: (string|null), search: (string|null), movementType: (string|null)}} range
 *   - the months, both inclusive, and the reader's own two narrowings
 * @param {string} timeZone - IANA zone of the account owner
 * @param {{page: number, pageSize: number}} paging - already validated as positive integers
 */
export async function getActivityPage(
 pool,
 userId,
 { from, to, search, movementType },
 timeZone = 'UTC',
 { page, pageSize },
) {
 const offset = (page - 1) * pageSize;

 // The six binds the count shares; the page appends limit and offset after them.
 const bounds = [
  userId,
  from ?? null,
  to ?? null,
  timeZone,
  search ?? null,
  movementType ?? null,
 ];

 // The count and the page are independent, so both run at once.
 const [rows, total] = await Promise.all([
  pool.query(ACTIVITY_PAGE_QUERY, [...bounds, pageSize, offset]),
  pool.query(ACTIVITY_COUNT_QUERY, bounds),
 ]);

 return {
  rows: rows.rows.map((row) => ({
   ...row,
   note: extractNoteFromDescription(row.description),
  })),
  totalRows: Number(total.rows[0]?.total_rows ?? 0),
 };
}
