// Month-end balances of a set of accounts, the stock counterpart of overviewMonthlyRepository.
// A past balance is the derived balance minus later legs (`amount` is signed), not the stored
// account_balance_after_tr, which can drift; every statement is bounded by the reporting window.

import { toAmount } from '../../budget_services/core/money.js';
import {
 ACCOUNT_OPENING_MOVEMENT_TYPE_ID,
 derivedAccountBalanceSql,
} from '../../../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import { accountReportingWindowSql } from '../../../../utils/fintrackUtils/accountDataRetrieval/accountReportingWindow.js';

// NUMERIC, not FLOAT: this figure is the anchor a summed NUMERIC amount is
// subtracted from, and a float anchor makes every month of the series inexact.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'NUMERIC');

// The instant the next month begins in the owner's zone: the single cut every figure here uses, so the
// legs keep adding up to the total. AT TIME ZONE turns the local month boundary into an instant to
// meet the TIMESTAMPTZ column.
const nextMonthStart = (monthSql, timeZonePlaceholder) =>
 `((${monthSql} + INTERVAL '1 month') AT TIME ZONE ${timeZonePlaceholder})`;

// Balance at the END of each month: generate_series is on the LEFT so idle months carry the balance and
// the last row (reference month) subtracts nothing. The anchor is per month and account inside the LATERAL,
// so a departed account is not subtracted from a total it left; LEFT JOIN ON TRUE keeps empty months at 0.
const MONTHLY_BALANCE_QUERY = `
  SELECT
    m.month::date::text AS month,
    COALESCE(SUM(a.balance), 0) AS total_amount
  FROM generate_series($2::date, $3::date, INTERVAL '1 month') AS m(month)
  LEFT JOIN LATERAL (
    SELECT
      ${DERIVED_BALANCE} - COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.account_id = ua.account_id
          AND t.transaction_actual_date >= ${nextMonthStart('m.month', '$4')}
      ), 0) AS balance
    FROM user_accounts ua
    WHERE ua.account_id = ANY($1::int[])
      AND ${accountReportingWindowSql('ua', 'm.month', '$4')}
  ) a ON TRUE
  GROUP BY m.month
  ORDER BY m.month
`;

/**
 * Balance at the end of each month from `from` to `to` inclusive, no gaps, in the flow repository's shape.
 * An empty accountIds returns zeros (a real balance of 0), not an empty array that leaves the card loading.
 *
 * @param {string} from - first month of the window, as 'YYYY-MM-01'
 * @param {string} to - last month, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<Array<{month: string, totalAmount: number}>>}
 */
export async function getMonthlyBalance(pool, accountIds, from, to, timeZone = 'UTC') {
 const { rows } = await pool.query(MONTHLY_BALANCE_QUERY, [
  accountIds ?? [],
  from,
  to,
  timeZone,
 ]);

 return rows.map((row) => ({
  month: row.month,
  totalAmount: toAmount(row.total_amount ?? 0),
 }));
}

// One row per account per month-end balance: the aggregate query above without SUM, so a month's rows add up
// to it. One statement feeds the counterparty ranking and the per-sign legs so they cannot disagree.
// Sign is left to the caller (positive = owed to the user); splitting here would duplicate the convention.
const MONTHLY_BALANCE_BY_ACCOUNT_QUERY = `
  SELECT
    m.month::date::text AS month,
    ua.account_id,
    ua.account_name,
    ${DERIVED_BALANCE} - COALESCE((
      SELECT SUM(t.amount)
      FROM transactions t
      WHERE t.account_id = ua.account_id
        AND t.transaction_actual_date >= ${nextMonthStart('m.month', '$4')}
    ), 0) AS balance
  FROM generate_series($2::date, $3::date, INTERVAL '1 month') AS m(month)
  CROSS JOIN user_accounts ua
  WHERE ua.account_id = ANY($1::int[])
    -- The window's ceiling matters most in this ranking: without it a closed
    -- counterparty would appear after its closure as a row at 0, reading as a live
    -- counterparty who owes nothing rather than one who is gone.
    AND ${accountReportingWindowSql('ua', 'm.month', '$4')}
  ORDER BY m.month, ua.account_id
`;

// Debt card fields at the close of the reference month, a sign split of the position so totalAmount =
// receivable - payable holds; both legs are positive magnitudes. FILTER, not CASE: balance is never NULL,
// else both legs would drop the same row. has_movement skips only the OPENING row (null-safe).
const DEBT_DOMAIN_FIELDS_QUERY = `
  WITH closing AS (
    SELECT
      ${DERIVED_BALANCE} - COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.account_id = ua.account_id
          AND t.transaction_actual_date >= ${nextMonthStart('$2::date', '$3')}
      ), 0) AS balance,
      EXISTS (
        SELECT 1
        FROM transactions t
        WHERE t.account_id = ua.account_id
          AND t.transaction_actual_date < ${nextMonthStart('$2::date', '$3')}
          AND NOT (
            t.movement_type_id = ${ACCOUNT_OPENING_MOVEMENT_TYPE_ID}
            AND t.account_id IS NOT DISTINCT FROM t.opening_for_account_id
          )
      ) AS has_movement
    FROM user_accounts ua
    WHERE ua.account_id = ANY($1::int[])
      -- The window changes the three counts, not the two sums: a closed debtor sits at
      -- exactly 0 with movements of its own, so without the window it would count as
      -- settled in every month after its closure. A balance of 0 is in neither leg.
      AND ${accountReportingWindowSql('ua', '$2::date', '$3')}
  )
  SELECT
    COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0) AS receivable,
    COALESCE(SUM(-balance) FILTER (WHERE balance < 0), 0) AS payable,
    COUNT(*) FILTER (WHERE balance > 0) AS receivable_count,
    COUNT(*) FILTER (WHERE balance < 0) AS payable_count,
    COUNT(*) FILTER (WHERE balance = 0 AND has_movement) AS settled_count
  FROM closing
`;

/**
 * The debt card's own fields: the two legs, the counterparty count per leg, and the settled-debtor count.
 * Counts share the sums' FILTER boundary; an account at 0 with no movement of its own is in no count.
 * An empty accountIds returns zeros, a real answer, not an empty result that leaves the card loading.
 *
 * @param {number[]} accountIds - the same set totalAmount is computed over
 * @param {string} month - the reference month, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<{receivable: number, payable: number, receivableCount: number, payableCount: number, settledCount: number}>}
 */
export async function getDebtDomainFields(
 pool,
 accountIds,
 month,
 timeZone = 'UTC',
) {
 const { rows } = await pool.query(DEBT_DOMAIN_FIELDS_QUERY, [
  accountIds ?? [],
  month,
  timeZone,
 ]);

 const row = rows[0] ?? {};

 return {
  payable: toAmount(row.payable ?? 0),
  receivable: toAmount(row.receivable ?? 0),
  // Counts, not amounts: Number, never toAmount.
  receivableCount: Number(row.receivable_count ?? 0),
  payableCount: Number(row.payable_count ?? 0),
  settledCount: Number(row.settled_count ?? 0),
 };
}

/**
 * Balance of each account at the close of every month; a month's rows sum to getMonthlyBalance's figure.
 * An empty accountIds returns an empty array, not zeros: zero months would state counterparties all at zero.
 *
 * @param {number[]} accountIds - the same set the position is computed over
 * @param {string} from - first month of the window, as 'YYYY-MM-01'
 * @param {string} to - last month, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<Array<{month: string, accountId: number, accountName: string, balance: number}>>}
 */
export async function getMonthlyBalanceByAccount(
 pool,
 accountIds,
 from,
 to,
 timeZone = 'UTC',
) {
 const { rows } = await pool.query(MONTHLY_BALANCE_BY_ACCOUNT_QUERY, [
  accountIds ?? [],
  from,
  to,
  timeZone,
 ]);

 return rows.map((row) => ({
  month: row.month,
  accountId: row.account_id,
  accountName: row.account_name,
  balance: toAmount(row.balance ?? 0),
 }));
}
