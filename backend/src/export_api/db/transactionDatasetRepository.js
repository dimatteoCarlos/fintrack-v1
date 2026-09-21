// The `transactions` dataset for GET /api/export/movements: one row per record, on the Overview activity
// row shape and predicate. Transfer counterparty names and FX audit columns are added here, not in
// transactionRowShape.js, which stays the shape every activity-list statement shares.

import { extractNoteFromDescription } from '../../utils/fintrackUtils/transactionManagement/extractNoteFromDescription.js';
import { transactionRowColumns, TRANSACTION_ROW_SOURCE } from '../../utils/fintrackUtils/transactionManagement/transactionRowShape.js';
import {
 ACTIVITY_FILTER,
 ACTIVITY_READER_FILTER,
 ACTIVITY_ORDER,
} from '../../utils/fintrackUtils/transactionManagement/activityFilters.js';

// Above this a request answers 422 asking the caller to narrow the period. Not streamed:
// Vercel keeps no cursor-backed connection, and this many rows sit far under the memory limit.
export const EXPORT_ROW_LIMIT = 10000;

// ACTIVITY_FILTER's WHERE reused verbatim over account_registry: the owned-account set must
// equal what activity allows, or a caller could export via an accountId activity never returns.
const OWNED_ACCOUNT_IDS_QUERY = `
  SELECT ar.account_id
  FROM account_registry ar
  LEFT JOIN user_accounts ua ON ua.account_id = ar.account_id
  ${ACTIVITY_FILTER}`;

/** Every account id the user owns, open or closed, slack excluded: the set ACTIVITY_FILTER scopes to. */
export async function getOwnedAccountIds(pool, userId) {
 const { rows } = await pool.query(OWNED_ACCOUNT_IDS_QUERY, [userId]);
 return rows.map((row) => row.account_id);
}

// Open category_budget accounts only. No month bounds this lookup (the period applies to the transactions
// downstream). Known limit: a category-filtered export omits rows of a category since closed, even from
// periods when it was open.
const CATEGORY_ACCOUNT_IDS_QUERY = `
  SELECT ua.account_id
  FROM user_accounts ua
  JOIN account_types act ON act.account_type_id = ua.account_type_id
  JOIN category_budget_accounts cba ON cba.account_id = ua.account_id
  WHERE ua.user_id = $1
    AND act.account_type_name = 'category_budget'
    AND ua.deleted_at IS NULL
    AND ua.closed_at IS NULL
    AND lower(cba.category_name) = lower($2)`;

/**
 * The account ids one expense category holds, for the caller's own accounts.
 *
 * @returns {Promise<number[]>} empty when the category does not exist or has no open
 *  accounts; the caller decides whether that is a 404
 */
export async function getCategoryAccountIds(pool, userId, categoryName) {
 const { rows } = await pool.query(CATEGORY_ACCOUNT_IDS_QUERY, [userId, categoryName]);
 return rows.map((row) => row.account_id);
}

// $1 userId, $2 from, $3 to, $4 timeZone, $5 search, $6 movementType, $7 accountIds
// (int[] or null), $8 limit. ACTIVITY_FILTER and ACTIVITY_READER_FILTER hardcode $1, $5
// and $6, so the shared slots must match ACTIVITY_PAGE_QUERY's (overviewPageRepository.js).
const TRANSACTIONS_DATASET_QUERY = `
  SELECT${transactionRowColumns('$4')}
    -- account_registry.account_name is stamped only at closure, so a live account has it
    -- null there and its name on user_accounts: the same two-step resolution
    -- transactionRowColumns applies to tr.account_id.
    , COALESCE(uasrc.account_name, arsrc.account_name, '') AS source_account_name
    , COALESCE(uadst.account_name, ardst.account_name, '') AS destination_account_name
    , tr.original_amount
    , ocr.currency_code AS original_currency_code
    , tr.exchange_rate
    , tr.exchange_rate_source
    , tr.exchange_rate_timestamp
  ${TRANSACTION_ROW_SOURCE}
  -- Scoped to $1 on each join: another user's account id resolves to an empty cell,
  -- never their name.
  LEFT JOIN user_accounts uasrc ON uasrc.account_id = tr.source_account_id AND uasrc.user_id = $1
  LEFT JOIN account_registry arsrc ON arsrc.account_id = tr.source_account_id AND arsrc.user_id = $1
  LEFT JOIN user_accounts uadst ON uadst.account_id = tr.destination_account_id AND uadst.user_id = $1
  LEFT JOIN account_registry ardst ON ardst.account_id = tr.destination_account_id AND ardst.user_id = $1
  LEFT JOIN currencies ocr ON ocr.currency_id = tr.original_currency_id
  ${ACTIVITY_FILTER}
    AND ($2::date IS NULL OR tr.transaction_actual_date >= ($2::timestamp AT TIME ZONE $4))
    AND ($3::date IS NULL OR tr.transaction_actual_date < (($3::date + INTERVAL '1 month') AT TIME ZONE $4))
    AND ($7::int[] IS NULL OR tr.account_id = ANY($7::int[]))
  ${ACTIVITY_READER_FILTER}
  ${ACTIVITY_ORDER}
  LIMIT $8
`;

/**
 * The `transactions` dataset for one export request, at most `limit` rows. Capped, not
 * paginated (no OFFSET, no count): the caller passes EXPORT_ROW_LIMIT + 1 and treats a
 * row at that position as "narrow the period", never delivering it.
 *
 * @param {{from: (string|null), to: (string|null), search: (string|null),
 *  movementType: (string|null), accountIds: (number[]|null)}} filters
 * @param {string} timeZone - IANA zone of the account owner
 */
export async function getTransactionsDataset(
 pool,
 userId,
 { from, to, search, movementType, accountIds },
 timeZone = 'UTC',
 limit,
) {
 const { rows } = await pool.query(TRANSACTIONS_DATASET_QUERY, [
  userId,
  from ?? null,
  to ?? null,
  timeZone,
  search ?? null,
  movementType ?? null,
  accountIds ?? null,
  limit,
 ]);

 return rows.map((row) => ({
  ...row,
  note: extractNoteFromDescription(row.description),
 }));
}
