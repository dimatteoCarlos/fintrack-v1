// Monthly figures behind a flow domain's card, one statement per domain.

import {
 EXPENSE_MOVEMENT_TYPE_ID,
 INCOME_MOVEMENT_TYPE_ID,
 PNL_MOVEMENT_TYPE_ID,
 TRANSFER_MOVEMENT_TYPE_ID,
} from './movementTypes.js';
import { incomeReversalLeg } from './incomeReversalSql.js';
import { toAmount } from '../../budget_services/core/money.js';
import { RTA_ANNULMENT_TARGET_PREFIX } from '../../../../utils/fintrackUtils/accountDeletionUtils/annulmentRowIdentity.js';

// One whole statement per domain (they differ by more than a WHERE); each must keep the same rows for card
// and chart, generate_series on the LEFT of the join (empty month = 0), a count over the total's rows, and
// AT TIME ZONE on the bounds with month labels as text (a pg DATE turned JS Date can shift a day).

// Nets movement types 1 and 6 like SPENT_QUERY: type 6 is the reversal transfer back to a bank, signed per
// leg (negative on withdraw). Type 1 alone would show a refunded expense as still spent.
const MONTHLY_EXPENSE_QUERY = `
  SELECT
    m.month::date::text AS month,
    COALESCE(SUM(
      CASE
        WHEN t.movement_type_id = ${EXPENSE_MOVEMENT_TYPE_ID} THEN t.amount
        WHEN t.movement_type_id = ${TRANSFER_MOVEMENT_TYPE_ID} THEN t.amount
        ELSE 0
      END
    ), 0) AS total_amount,
    COUNT(t.transaction_id) AS transaction_count
  FROM generate_series($2::date, $3::date, INTERVAL '1 month') AS m(month)
  LEFT JOIN transactions t
    ON t.account_id = ANY($1::int[])
   AND t.movement_type_id IN (${EXPENSE_MOVEMENT_TYPE_ID}, ${TRANSFER_MOVEMENT_TYPE_ID})
   AND t.transaction_actual_date >= (m.month AT TIME ZONE $4)
   AND t.transaction_actual_date <  ((m.month + INTERVAL '1 month') AT TIME ZONE $4)
  GROUP BY m.month
  ORDER BY m.month
`;

// Income: type 2 netted by its reversal, a transfer into an income_source account (incomeReversalSql.js).
// The leg is chosen by the caller's account set, so a reversal's withdraw subtracts without a CASE.
const MONTHLY_INCOME_QUERY = `
  SELECT
    m.month::date::text AS month,
    COALESCE(SUM(t.amount), 0) AS total_amount,
    COUNT(t.transaction_id) AS transaction_count
  FROM generate_series($2::date, $3::date, INTERVAL '1 month') AS m(month)
  LEFT JOIN transactions t
    ON t.account_id = ANY($1::int[])
   AND (t.movement_type_id = ${INCOME_MOVEMENT_TYPE_ID} OR ${incomeReversalLeg('t')})
   AND t.transaction_actual_date >= (m.month AT TIME ZONE $4)
   AND t.transaction_actual_date <  ((m.month + INTERVAL '1 month') AT TIME ZONE $4)
  GROUP BY m.month
  ORDER BY m.month
`;

// P/L: type 9 minus the compensating rows an account deletion writes (told apart by description prefix);
// the IS NULL branch is load-bearing: NULL NOT LIKE is NULL and would drop a real row with no description.
// investment_amount is a FILTER by account id ($5, getInvestmentAccountIds) over the total's own rows.
const MONTHLY_PNL_QUERY = `
  SELECT
    m.month::date::text AS month,
    COALESCE(SUM(t.amount), 0) AS total_amount,
    COUNT(t.transaction_id) AS transaction_count,
    COALESCE(SUM(t.amount) FILTER (
      WHERE t.account_id = ANY($5::int[])
    ), 0) AS investment_amount,
    -- Filtered on its own account set ($6), not total minus investment: $1 covers every
    -- type but boundary, so the remainder is not just banks. If another type carries a
    -- P/L row the legs stop summing to the total, instead of hiding under the wrong label.
    COALESCE(SUM(t.amount) FILTER (
      WHERE t.account_id = ANY($6::int[])
    ), 0) AS bank_amount
  FROM generate_series($2::date, $3::date, INTERVAL '1 month') AS m(month)
  LEFT JOIN transactions t
    ON t.account_id = ANY($1::int[])
   AND t.movement_type_id = ${PNL_MOVEMENT_TYPE_ID}
   AND (t.description IS NULL OR t.description NOT LIKE '${RTA_ANNULMENT_TARGET_PREFIX}%')
   AND t.transaction_actual_date >= (m.month AT TIME ZONE $4)
   AND t.transaction_actual_date <  ((m.month + INTERVAL '1 month') AT TIME ZONE $4)
  GROUP BY m.month
  ORDER BY m.month
`;

// Income by source for ONE month: the rows MONTHLY_INCOME_QUERY sums, grouped, so the parts add to the card.
// The source is source_account_id (income) or destination_account_id (reversal); the LEFT join keeps a NULL
// source as its own part. A closed source keeps its name from account_registry; closed_at is in GROUP BY.
const INCOME_BY_SOURCE_QUERY = `
  WITH legs AS (
    SELECT
      CASE WHEN t.movement_type_id = ${INCOME_MOVEMENT_TYPE_ID}
           THEN t.source_account_id ELSE t.destination_account_id END AS source_id,
      t.amount,
      t.transaction_id
    FROM transactions t
    WHERE t.account_id = ANY($1::int[])
      AND (t.movement_type_id = ${INCOME_MOVEMENT_TYPE_ID} OR ${incomeReversalLeg('t')})
      AND t.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
      AND t.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
  )
  SELECT
    legs.source_id AS account_id,
    COALESCE(src.account_name, src_ar.account_name) AS account_name,
    (legs.source_id IS NOT NULL
      AND (src.account_id IS NULL OR src_ar.closed_at IS NOT NULL)) AS account_is_closed,
    COALESCE(SUM(legs.amount), 0) AS total_amount,
    COUNT(legs.transaction_id) AS transaction_count
  FROM legs
  LEFT JOIN user_accounts src ON src.account_id = legs.source_id
  LEFT JOIN account_registry src_ar ON src_ar.account_id = legs.source_id
  GROUP BY legs.source_id, src.account_id, src.account_name, src_ar.account_name,
           src_ar.closed_at
`;

// No pocket statement: since migration 020 pocket movements are allocation rows (overviewPocketRepository).
// The P/L account set is built by exclusion, so a legacy pocket account written again would be admitted
// although no hero figure counts its balance; accepted as is.

/**
 * Runs one monthly statement and maps its rows. An empty accountIds still returns the full month list at
 * zero: a real total of 0, where an empty series would leave the card on a skeleton.
 *
 * @param {number[]} accountIds - the set that selects the leg
 * @param {string} from - first month of the window, as 'YYYY-MM-01'
 * @param {string} to - last month, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 */
const readMonthlyRows = async (pool, sql, accountIds, from, to, timeZone, extraParams = []) => {
 // extraParams continues the numbering from $5; only the P/L statement uses it
 // (investment accounts on $5, bank accounts on $6). Appended rather than given its own
 // reader so the leading binds and the row mapping have a single copy.
 const { rows } = await pool.query(sql, [accountIds ?? [], from, to, timeZone, ...extraParams]);

 return rows.map((row) => ({
  month: row.month,
  totalAmount: toAmount(row.total_amount ?? 0),
  // COUNT arrives as a string (bigint); Number is exact for a month's count.
  transactionCount: Number(row.transaction_count ?? 0),
  // Only the P/L statement selects these columns. Left absent elsewhere rather than 0,
  // since a 0 investment share on income would assert a split that means nothing there.
  ...(row.investment_amount === undefined
   ? {}
   : { investmentAmount: toAmount(row.investment_amount ?? 0) }),
  ...(row.bank_amount === undefined
   ? {}
   : { bankAmount: toAmount(row.bank_amount ?? 0) }),
 }));
};

/**
 * The expense of a set of accounts, month by month, over a closed range.
 *
 * Returns one entry per calendar month between `from` and `to` inclusive, with
 * no gaps: a month with no transactions reports 0 and 0.
 *
 * @param {number[]} accountIds - category_budget accounts, closed and soft-deleted included
 * @param {string} from - first month of the window, as 'YYYY-MM-01'
 * @param {string} to - last month, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 */
export async function getMonthlyExpense(pool, accountIds, from, to, timeZone = 'UTC') {
 return readMonthlyRows(pool, MONTHLY_EXPENSE_QUERY, accountIds, from, to, timeZone);
}

/**
 * The income of a set of accounts, month by month, over a closed range.
 *
 * @param {number[]} accountIds - the user's real money accounts, slack excluded
 * @param {string} from - first month of the window, as 'YYYY-MM-01'
 * @param {string} to - last month, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 */
export async function getMonthlyIncome(pool, accountIds, from, to, timeZone = 'UTC') {
 return readMonthlyRows(pool, MONTHLY_INCOME_QUERY, accountIds, from, to, timeZone);
}

/**
 * The realized P/L of a set of accounts, month by month, over a closed range.
 *
 * @param {number[]} accountIds - every account of the user except slack
 * @param {string} from - first month of the window, as 'YYYY-MM-01'
 * @param {string} to - last month, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 * @param {number[]} investmentAccountIds - the set investmentAmount is cut by, the same
 *   one getInvestmentAccountIds returns. Empty reports a share of 0, the true answer
 *   for an owner with no investment account.
 */
export async function getMonthlyPnl(
 pool,
 accountIds,
 from,
 to,
 timeZone = 'UTC',
 investmentAccountIds = [],
 bankAccountIds = [],
) {
 return readMonthlyRows(pool, MONTHLY_PNL_QUERY, accountIds, from, to, timeZone, [
  investmentAccountIds ?? [],
  bankAccountIds ?? [],
 ]);
}

/**
 * The income of one month by source, unordered (the caller ranks them); empty means nothing received.
 * accountId and accountName are both null on the one part that has no source account.
 *
 * @param {number[]} accountIds - the same set the month's total is summed over
 * @param {string} month - the month to break down, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 */
export async function getIncomeBySource(pool, accountIds, month, timeZone = 'UTC') {
 const { rows } = await pool.query(INCOME_BY_SOURCE_QUERY, [
  accountIds ?? [],
  month,
  timeZone,
 ]);

 return rows.map((row) => ({
  accountId: row.account_id ?? null,
  accountName: row.account_name ?? null,
  accountIsClosed: row.account_is_closed === true,
  amount: toAmount(row.total_amount ?? 0),
  transactionCount: Number(row.transaction_count ?? 0),
 }));
}
