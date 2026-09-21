// Investment card figures, read in one query so they reconcile over one snapshot.

import {
 ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID,
 ACCOUNT_OPENING_MOVEMENT_TYPE_ID,
 BALANCE_REVERSAL_MOVEMENT_TYPE_ID,
 PNL_MOVEMENT_TYPE_ID,
 TRANSFER_MOVEMENT_TYPE_ID,
} from './movementTypes.js';
import { toAmount } from '../../budget_services/core/money.js';
import { derivedAccountBalanceSql } from '../../../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import { accountReportingWindowSql } from '../../../../utils/fintrackUtils/accountDataRetrieval/accountReportingWindow.js';
import { RTA_ANNULMENT_TARGET_PREFIX } from '../../../../utils/fintrackUtils/accountDeletionUtils/annulmentRowIdentity.js';

// NUMERIC, not FLOAT: the card publishes capitalContributed + realizedPnl +
// closureAdjustment = ledgerBalance, and a float balance would break it by a cent.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'NUMERIC');

// One statement over one account set and one cut, so capitalContributed + realizedPnl + closureAdjustment
// = ledgerBalance holds. Capital sums types 6 and 8 (type 3 has no writer); days-since-last ignores type 8.
// closure_adjustment is defined as the rows realized_pnl drops, so no row is lost or double-counted.
const INVESTMENT_FIGURES_QUERY = `
  WITH bounds AS (
    SELECT
      (($3::date + INTERVAL '1 month') AT TIME ZONE $2) AS next_month_start,
      LEAST(
        (now() AT TIME ZONE $2)::date,
        ($3::date + INTERVAL '1 month' - INTERVAL '1 day')::date
      ) AS reference_date
  ),
  accounts AS (
    SELECT
      ua.account_id,
      ${DERIVED_BALANCE} - COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.account_id = ua.account_id
          AND t.transaction_actual_date >= (SELECT next_month_start FROM bounds)
      ), 0) AS derived_balance
    FROM user_accounts ua
    WHERE ua.account_id = ANY($1::int[])
      -- The window leaves the balance identity intact: an account outside it adds 0 to
      -- the balance (nothing before its opening; an investment account closes only at
      -- zero), and the transaction sums are cut at the same reference month.
      AND ${accountReportingWindowSql('ua', '$3::date', '$2')}
  ),
  contributions AS (
    SELECT COALESCE(SUM(t.amount), 0) AS capital_contributed
    FROM transactions t
    WHERE t.account_id = ANY($1::int[])
      AND t.movement_type_id IN (${TRANSFER_MOVEMENT_TYPE_ID}, ${ACCOUNT_OPENING_MOVEMENT_TYPE_ID})
      AND t.transaction_actual_date < (SELECT next_month_start FROM bounds)
  ),
  last_funding AS (
    SELECT MAX(t.transaction_actual_date) AS last_contribution
    FROM transactions t
    WHERE t.account_id = ANY($1::int[])
      AND t.movement_type_id = ${TRANSFER_MOVEMENT_TYPE_ID}
      AND t.amount > 0
      AND t.transaction_actual_date < (SELECT next_month_start FROM bounds)
  ),
  -- closure_adjustment sums three kinds of row, none substitutable for another: an
  -- annulment row (profit-and-loss type with the annulment description prefix), a
  -- closure-settlement row (closure type, no prefix) and a balance-reversal row (the
  -- neutralisation the owner authorised so the account could close).
  --
  -- The closure type has no writer today (CLOSE moves no money) but stays: rows written
  -- earlier may exist in other databases, and dropping it would silently change a
  -- published figure.
  --
  -- The reversal belongs in this term because the account-id set outlives the account
  -- (it reads through account_identity, which keeps a closed account's id) while the
  -- accounts CTE drops a closed account for every month after its closure. Its whole
  -- history stays in contributions and realized against a zero balance, so the identity
  -- holds only if the terms sum to zero over it. The reversal is the negative of
  -- everything the account accumulated; without it the card reports that history as
  -- unexplained.
  --
  -- The FILTER picks which rows enter each sum and the outer WHERE picks which rows
  -- reach the FILTER, so a movement type must be added to both.
  --
  -- The arms cannot double-count an account: the caller runs either the close path or
  -- the standard delete path, never both, and only the standard path writes annulment rows.
  realized AS (
    SELECT
      COALESCE(SUM(t.amount) FILTER (
        WHERE t.movement_type_id = ${PNL_MOVEMENT_TYPE_ID}
          AND (t.description IS NULL
               OR t.description NOT LIKE '${RTA_ANNULMENT_TARGET_PREFIX}%')
      ), 0) AS realized_pnl,
      COALESCE(SUM(t.amount) FILTER (
        WHERE t.movement_type_id IN (
                ${ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID},
                ${BALANCE_REVERSAL_MOVEMENT_TYPE_ID}
              )
           OR t.description LIKE '${RTA_ANNULMENT_TARGET_PREFIX}%'
      ), 0) AS closure_adjustment
    FROM transactions t
    WHERE t.account_id = ANY($1::int[])
      AND t.movement_type_id IN (
            ${PNL_MOVEMENT_TYPE_ID},
            ${ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID},
            ${BALANCE_REVERSAL_MOVEMENT_TYPE_ID}
          )
      AND t.transaction_actual_date < (SELECT next_month_start FROM bounds)
  )
  SELECT
    (SELECT COUNT(*) FROM accounts) AS account_count,
    (SELECT COALESCE(SUM(derived_balance), 0) FROM accounts) AS ledger_balance,
    (SELECT MAX(derived_balance) FROM accounts) AS largest_balance,
    c.capital_contributed,
    r.realized_pnl,
    r.closure_adjustment,
    (b.reference_date - (f.last_contribution AT TIME ZONE $2)::date)
      AS days_since_last_contribution
  FROM contributions c
  CROSS JOIN realized r
  CROSS JOIN last_funding f
  CROSS JOIN bounds b
`;

// Same expression and bound as the `accounts` CTE plus the name, kept separate so the shares sum to the
// published ledger balance. A zero-balance account is a row (opened and emptied differs from never held),
// except outside the reporting window.
const INVESTMENT_BALANCE_BY_ACCOUNT_QUERY = `
  WITH bounds AS (
    SELECT (($3::date + INTERVAL '1 month') AT TIME ZONE $2) AS next_month_start
  )
  SELECT
    ua.account_id,
    ua.account_name,
    ${DERIVED_BALANCE} - COALESCE((
      SELECT SUM(t.amount)
      FROM transactions t
      WHERE t.account_id = ua.account_id
        AND t.transaction_actual_date >= (SELECT next_month_start FROM bounds)
    ), 0) AS balance
  FROM user_accounts ua
  WHERE ua.account_id = ANY($1::int[])
    AND ${accountReportingWindowSql('ua', '$3::date', '$2')}
  ORDER BY ua.account_id
`;

// Same predicate as days-since-last-contribution (transfer, amount > 0, before the cut), so an empty history
// and the card's "no contribution recorded" notice are one condition. Newest first, capped by the caller's
// limit; CONTRIBUTION_HISTORY_COUNT_QUERY reports what was left out.
const CONTRIBUTION_HISTORY_QUERY = `
  SELECT
    t.transaction_id,
    t.account_id,
    ua.account_name,
    t.amount AS amount,
    (t.transaction_actual_date AT TIME ZONE $2)::date::text AS contribution_date
  FROM transactions t
  -- LEFT: the join only supplies a label, and an inner one would drop the row of an
  -- account with no user_accounts row while CONTRIBUTION_HISTORY_COUNT_QUERY (transactions
  -- only) still counted it.
  LEFT JOIN user_accounts ua ON ua.account_id = t.account_id
  WHERE t.account_id = ANY($1::int[])
    AND t.movement_type_id = ${TRANSFER_MOVEMENT_TYPE_ID}
    AND t.amount > 0
    AND t.transaction_actual_date < (($3::date + INTERVAL '1 month') AT TIME ZONE $2)
  ORDER BY t.transaction_actual_date DESC, t.transaction_id DESC
  LIMIT $4
`;

// Total events behind the limited page above: a second statement over the same filter,
// as every list in this module does, so the count covers the whole set and not the page.
const CONTRIBUTION_HISTORY_COUNT_QUERY = `
  SELECT COUNT(*) AS total_rows
  FROM transactions t
  WHERE t.account_id = ANY($1::int[])
    AND t.movement_type_id = ${TRANSFER_MOVEMENT_TYPE_ID}
    AND t.amount > 0
    AND t.transaction_actual_date < (($3::date + INTERVAL '1 month') AT TIME ZONE $2)
`;

/**
 * The raw figures behind the Investment card, read at the reference month.
 * largestBalance and daysSinceLastContribution are null with no investment account or no funding transfer;
 * the caller reports a notice, since 0 would read as "perfectly diversified".
 *
 * @param {string} timeZone - IANA zone of the account owner
 * @param {string} referenceMonth - 'YYYY-MM-01', the month every figure is read at
 */
export async function getInvestmentFigures(pool, accountIds, timeZone = 'UTC', referenceMonth) {
 const { rows } = await pool.query(INVESTMENT_FIGURES_QUERY, [
  accountIds ?? [],
  timeZone,
  referenceMonth,
 ]);
 const row = rows[0] ?? {};

 return {
  accountCount: Number(row.account_count ?? 0),
  ledgerBalance: toAmount(row.ledger_balance ?? 0),
  largestBalance: row.largest_balance === null || row.largest_balance === undefined
   ? null
   : toAmount(row.largest_balance),
  capitalContributed: toAmount(row.capital_contributed ?? 0),
  realizedPnl: toAmount(row.realized_pnl ?? 0),
  closureAdjustment: toAmount(row.closure_adjustment ?? 0),
  daysSinceLastContribution: row.days_since_last_contribution === null
   || row.days_since_last_contribution === undefined
   ? null
   : Number(row.days_since_last_contribution),
 };
}

/**
 * The balance of each investment account at the close of the reference month, summing to the ledger balance.
 * An empty accountIds returns [], which the caller reports as an absent portfolio, not a distribution.
 *
 * @param {string} timeZone - IANA zone of the account owner
 * @param {string} referenceMonth - 'YYYY-MM-01', the month the balances are read at
 */
export async function getInvestmentBalanceByAccount(
 pool,
 accountIds,
 timeZone = 'UTC',
 referenceMonth,
) {
 const { rows } = await pool.query(INVESTMENT_BALANCE_BY_ACCOUNT_QUERY, [
  accountIds ?? [],
  timeZone,
  referenceMonth,
 ]);

 return rows.map((row) => ({
  accountId: row.account_id,
  accountName: row.account_name,
  balance: toAmount(row.balance ?? 0),
 }));
}

/**
 * The funding events on the investment accounts, newest first, and how many exist.
 *
 * totalRows is the whole history and rows the newest `limit` of it, so a caller can
 * tell a page from the history.
 *
 * @param {string} timeZone - IANA zone of the account owner
 * @param {string} referenceMonth - 'YYYY-MM-01', the cut every figure of this card shares
 * @param {number} limit - the most events this response will carry
 */
export async function getContributionHistory(
 pool,
 accountIds,
 timeZone = 'UTC',
 referenceMonth,
 limit,
) {
 const parameters = [accountIds ?? [], timeZone, referenceMonth];

 // The count and the page are independent, so both run at once.
 const [events, total] = await Promise.all([
  pool.query(CONTRIBUTION_HISTORY_QUERY, [...parameters, limit]),
  pool.query(CONTRIBUTION_HISTORY_COUNT_QUERY, parameters),
 ]);

 return {
  rows: events.rows.map((row) => ({
   transactionId: row.transaction_id,
   accountId: row.account_id,
   accountName: row.account_name,
   amount: toAmount(row.amount ?? 0),
   contributionDate: row.contribution_date,
  })),
  totalRows: Number(total.rows[0]?.total_rows ?? 0),
 };
}
