// Paged rows behind an Overview domain card, in the row shape of getTransactionsForAccountById. Each count
// statement repeats its monthly WHERE so totals agree; transaction_id breaks ORDER BY ties across pages.
// The ::timestamp cast on the lower bound is load-bearing: a bare date makes AT TIME ZONE convert backwards.

import {
 DEBT_MOVEMENT_TYPE_ID,
 EXPENSE_MOVEMENT_TYPE_ID,
 INCOME_MOVEMENT_TYPE_ID,
 PNL_MOVEMENT_TYPE_ID,
 TRANSFER_MOVEMENT_TYPE_ID,
} from './movementTypes.js';
import { incomeReversalLeg } from './incomeReversalSql.js';
import { extractNoteFromDescription } from '../../../../utils/fintrackUtils/transactionManagement/extractNoteFromDescription.js';
import { RTA_ANNULMENT_TARGET_PREFIX } from '../../../../utils/fintrackUtils/accountDeletionUtils/annulmentRowIdentity.js';
import { transactionRowColumns, TRANSACTION_ROW_SOURCE } from '../../../../utils/fintrackUtils/transactionManagement/transactionRowShape.js';

const EXPENSE_PAGE_QUERY = `
  SELECT${transactionRowColumns('$3')}${TRANSACTION_ROW_SOURCE}
  WHERE tr.account_id = ANY($1::int[])
    AND tr.movement_type_id IN (${EXPENSE_MOVEMENT_TYPE_ID}, ${TRANSFER_MOVEMENT_TYPE_ID})
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
  ORDER BY tr.transaction_actual_date DESC, tr.transaction_id DESC
  LIMIT $4 OFFSET $5
`;

// A separate statement, not COUNT(*) OVER (): a window function returns nothing for an empty page, so an
// over-paged request could not be told from "no data". Its WHERE must match the page statement's.
const EXPENSE_COUNT_QUERY = `
  SELECT COUNT(*) AS total_rows
  FROM transactions tr
  WHERE tr.account_id = ANY($1::int[])
    AND tr.movement_type_id IN (${EXPENSE_MOVEMENT_TYPE_ID}, ${TRANSFER_MOVEMENT_TYPE_ID})
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
`;

// Income rows and their reversals, the same rows MONTHLY_INCOME_QUERY sums.
const INCOME_PAGE_QUERY = `
  SELECT${transactionRowColumns('$3')}${TRANSACTION_ROW_SOURCE}
  WHERE tr.account_id = ANY($1::int[])
    AND (tr.movement_type_id = ${INCOME_MOVEMENT_TYPE_ID} OR ${incomeReversalLeg('tr')})
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
  ORDER BY tr.transaction_actual_date DESC, tr.transaction_id DESC
  LIMIT $4 OFFSET $5
`;

const INCOME_COUNT_QUERY = `
  SELECT COUNT(*) AS total_rows
  FROM transactions tr
  WHERE tr.account_id = ANY($1::int[])
    AND (tr.movement_type_id = ${INCOME_MOVEMENT_TYPE_ID} OR ${incomeReversalLeg('tr')})
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
`;

// Excludes annulment-target rows, with the same NULL guard as the monthly statement:
// `NULL NOT LIKE ...` is NULL, so without the guard a P/L row with no description
// would drop out of the list while the card still counted it.
const PNL_PAGE_QUERY = `
  SELECT${transactionRowColumns('$3')}${TRANSACTION_ROW_SOURCE}
  WHERE tr.account_id = ANY($1::int[])
    AND tr.movement_type_id = ${PNL_MOVEMENT_TYPE_ID}
    AND (tr.description IS NULL OR tr.description NOT LIKE '${RTA_ANNULMENT_TARGET_PREFIX}%')
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
  ORDER BY tr.transaction_actual_date DESC, tr.transaction_id DESC
  LIMIT $4 OFFSET $5
`;

const PNL_COUNT_QUERY = `
  SELECT COUNT(*) AS total_rows
  FROM transactions tr
  WHERE tr.account_id = ANY($1::int[])
    AND tr.movement_type_id = ${PNL_MOVEMENT_TYPE_ID}
    AND (tr.description IS NULL OR tr.description NOT LIKE '${RTA_ANNULMENT_TARGET_PREFIX}%')
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
`;

const DEBT_PAGE_QUERY = `
  SELECT${transactionRowColumns('$3')}${TRANSACTION_ROW_SOURCE}
  WHERE tr.account_id = ANY($1::int[])
    AND tr.movement_type_id = ${DEBT_MOVEMENT_TYPE_ID}
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
  ORDER BY tr.transaction_actual_date DESC, tr.transaction_id DESC
  LIMIT $4 OFFSET $5
`;

const DEBT_COUNT_QUERY = `
  SELECT COUNT(*) AS total_rows
  FROM transactions tr
  WHERE tr.account_id = ANY($1::int[])
    AND tr.movement_type_id = ${DEBT_MOVEMENT_TYPE_ID}
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
`;

// Pocket has no list here: since migration 020, committing money writes an
// allocation and moves nothing, so there is no transaction to list
// (see overviewPocketRepository.js).

// Every movement that touched an investment account, unfiltered by type: the list must match the account
// statement the user can open elsewhere, so a transfer between two investment accounts is not hidden.
const INVESTMENT_PAGE_QUERY = `
  SELECT${transactionRowColumns('$3')}${TRANSACTION_ROW_SOURCE}
  WHERE tr.account_id = ANY($1::int[])
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
  ORDER BY tr.transaction_actual_date DESC, tr.transaction_id DESC
  LIMIT $4 OFFSET $5
`;

const INVESTMENT_COUNT_QUERY = `
  SELECT COUNT(*) AS total_rows
  FROM transactions tr
  WHERE tr.account_id = ANY($1::int[])
    AND tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND tr.transaction_actual_date <  (($2::date + INTERVAL '1 month') AT TIME ZONE $3)
`;

/**
 * Runs one domain's page and count statements and maps the rows. The statements
 * carry the filters; this holds the OFFSET arithmetic so an off-by-one lives in one place.
 *
 * @param {{page: string, count: string}} statements - one domain's pair
 * @param {string} month - the month to list, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 * @param {object} paging - { page, pageSize, includeRows }; page and pageSize are
 *   already validated positive integers, includeRows defaults to true
 */
const readTransactionsPage = async (pool, statements, accountIds, month, timeZone, { page, pageSize, includeRows = true }) => {
 const ids = accountIds ?? [];
 const offset = (page - 1) * pageSize;

 // GET /overview needs the count but must not load rows (none travel outside
 // recentActivity), so the page statement is skipped rather than fetched and dropped.
 if (!includeRows) {
  const total = await pool.query(statements.count, [ids, month, timeZone]);
  return { rows: [], totalRows: Number(total.rows[0]?.total_rows ?? 0) };
 }

 const [rows, total] = await Promise.all([
  pool.query(statements.page, [ids, month, timeZone, pageSize, offset]),
  pool.query(statements.count, [ids, month, timeZone]),
 ]);

 return {
  // description stays untouched beside note: the detail modal shows the full
  // sentence, the rows show only the note.
  rows: rows.rows.map((row) => ({
   ...row,
   note: extractNoteFromDescription(row.description),
  })),
  totalRows: Number(total.rows[0]?.total_rows ?? 0),
 };
};

/**
 * One page of the expense transactions of a month, plus the size of the whole set.
 *
 * @param {number[]} accountIds - category_budget accounts, closed and soft-deleted included
 */
export async function getExpenseTransactionsPage(pool, accountIds, month, timeZone, paging) {
 return readTransactionsPage(
  pool,
  { page: EXPENSE_PAGE_QUERY, count: EXPENSE_COUNT_QUERY },
  accountIds,
  month,
  timeZone,
  paging,
 );
}

/**
 * One page of the income transactions of a month, plus the size of the whole set.
 *
 * @param {number[]} accountIds - the user's real money accounts, slack excluded
 */
export async function getIncomeTransactionsPage(pool, accountIds, month, timeZone, paging) {
 return readTransactionsPage(
  pool,
  { page: INCOME_PAGE_QUERY, count: INCOME_COUNT_QUERY },
  accountIds,
  month,
  timeZone,
  paging,
 );
}

/**
 * One page of the realized P/L transactions of a month, plus the whole set's size.
 *
 * @param {number[]} accountIds - every account of the user except slack
 */
export async function getPnlTransactionsPage(pool, accountIds, month, timeZone, paging) {
 return readTransactionsPage(
  pool,
  { page: PNL_PAGE_QUERY, count: PNL_COUNT_QUERY },
  accountIds,
  month,
  timeZone,
  paging,
 );
}

/**
 * One page of the debt movements of a month, plus the size of the whole set.
 *
 * @param {number[]} accountIds - the user's debtor accounts
 */
export async function getDebtTransactionsPage(pool, accountIds, month, timeZone, paging) {
 return readTransactionsPage(
  pool,
  { page: DEBT_PAGE_QUERY, count: DEBT_COUNT_QUERY },
  accountIds,
  month,
  timeZone,
  paging,
 );
}

/**
 * One page of everything that touched an investment account in a month.
 *
 * @param {number[]} accountIds - the user's investment accounts
 */
export async function getInvestmentTransactionsPage(pool, accountIds, month, timeZone, paging) {
 return readTransactionsPage(
  pool,
  { page: INVESTMENT_PAGE_QUERY, count: INVESTMENT_COUNT_QUERY },
  accountIds,
  month,
  timeZone,
  paging,
 );
}
