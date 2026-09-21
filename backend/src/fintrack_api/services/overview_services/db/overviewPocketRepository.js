// Overview reads over the pocket plan model that the pocket board service does not answer.

import { toAmount } from '../../budget_services/core/money.js';

// Append-only pocket_allocations reads (no balances or transactions), over ranges the board is not asked.
// Bounds copy pocketRepository.js: ledger on allocation_actual_date (not created_at), pockets on created_at.
// A local month boundary is cast ::timestamp, never ::date, which picks the instant overload and shifts it.

// Committed total at the close of each month (a position), cumulative: the last point equals the board's
// totalAllocated under the same bounds. An empty month reports 0: the series comes from the calendar.
const MONTHLY_ALLOCATED_QUERY = `
  SELECT
    m.month::date::text AS month,
    COALESCE(SUM(pa.amount), 0) AS total_amount
  FROM generate_series($2::date, $3::date, INTERVAL '1 month') AS m(month)
  LEFT JOIN pockets p
    ON p.user_id = $1
   AND p.created_at < ((m.month + INTERVAL '1 month') AT TIME ZONE $4)
  LEFT JOIN pocket_allocations pa
    ON pa.pocket_id = p.pocket_id
   AND pa.allocation_actual_date < ((m.month + INTERVAL '1 month') AT TIME ZONE $4)
  GROUP BY m.month
  ORDER BY m.month
`;

// Committed inside each month (a flow), a separate statement rather than a diff of the one above: a mean of
// movements cannot be subtracted from a stock. Matches the board's totalMovedInMonth. The net stays signed
// (a release is negative); the count tells a cancelling commit and release apart from no activity.
const MONTHLY_ALLOCATED_NET_QUERY = `
  SELECT
    m.month::date::text AS month,
    COALESCE(SUM(pa.amount), 0) AS total_amount,
    COUNT(pa.allocation_id) AS transaction_count
  FROM generate_series($2::date, $3::date, INTERVAL '1 month') AS m(month)
  LEFT JOIN pockets p
    ON p.user_id = $1
   AND p.created_at < ((m.month + INTERVAL '1 month') AT TIME ZONE $4)
  LEFT JOIN pocket_allocations pa
    ON pa.pocket_id = p.pocket_id
   AND pa.allocation_actual_date >= (m.month AT TIME ZONE $4)
   AND pa.allocation_actual_date <  ((m.month + INTERVAL '1 month') AT TIME ZONE $4)
  GROUP BY m.month
  ORDER BY m.month
`;

// The month's decisions, newest first, each naming its pocket and source account. currency comes from the
// pocket, not the allocation, whose origin columns are the audit trail of what the owner typed. One filter
// feeds page and count so they cannot disagree; placeholders in both: owner, month, zone.
const ALLOCATIONS_FILTER = `
  WHERE pa.user_id = $1
    AND pa.allocation_actual_date >= ($2::timestamp AT TIME ZONE $3)
    AND pa.allocation_actual_date <  (($2::timestamp + INTERVAL '1 month') AT TIME ZONE $3)`;

const ALLOCATIONS_PAGE_QUERY = `
  SELECT
    pa.allocation_id::text  AS "allocationId",
    pa.pocket_id            AS "pocketId",
    p.name                  AS "pocketName",
    pa.amount::text         AS amount,
    to_char(pa.allocation_actual_date AT TIME ZONE $3, 'YYYY-MM-DD') AS "allocationDate",
    pa.source_account_id    AS "sourceAccountId",
    -- A closed account's name survives on account_registry, stamped at closure.
    COALESCE(ua.account_name, ar.account_name) AS "sourceAccountName",
    -- True only when the row is absent; CLOSE keeps it, so a closed source is not flagged.
    (ua.account_id IS NULL) AS "sourceAccountIsClosed",
    lower(cr.currency_code) AS currency
  FROM pocket_allocations pa
  JOIN pockets p ON p.pocket_id = pa.pocket_id
  -- LEFT: this join supplies a label, not a row. Inner, a source account whose row is
  -- gone would drop the whole allocation from the page while the count still counted
  -- it, leaving a short page. Pockets and currencies stay inner: an allocation cannot
  -- outlive its pocket, and nothing deletes from the currencies catalog.
  LEFT JOIN user_accounts ua ON ua.account_id = pa.source_account_id
  -- The name only, for the same reason; keyed on its primary key it adds no row.
  LEFT JOIN account_registry ar ON ar.account_id = pa.source_account_id
  JOIN currencies cr ON cr.currency_id = p.currency_id
  ${ALLOCATIONS_FILTER}
  ORDER BY pa.allocation_actual_date DESC, pa.allocation_id DESC
  LIMIT $4 OFFSET $5
`;

const ALLOCATIONS_COUNT_QUERY = `
  SELECT COUNT(*) AS total_rows
  FROM pocket_allocations pa
  ${ALLOCATIONS_FILTER}
`;

/**
 * The committed total at the close of every month of a closed range.
 *
 * @param {string} userId - UUID from the token, never from the client body
 * @param {string} from - first month of the window, as 'YYYY-MM-01'
 * @param {string} to - last month, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<Array<{month: string, totalAmount: number}>>} ascending, no gaps
 */
export async function getMonthlyAllocated(pool, userId, from, to, timeZone = 'UTC') {
 const { rows } = await pool.query(MONTHLY_ALLOCATED_QUERY, [userId, from, to, timeZone]);

 return rows.map((row) => ({
  month: row.month,
  totalAmount: toAmount(row.total_amount ?? 0),
 }));
}

/**
 * The net committed inside every month of a closed range, and how many decisions
 * produced it.
 *
 * @param {string} userId - UUID from the token
 * @param {string} from - first month of the window, as 'YYYY-MM-01'
 * @param {string} to - last month, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 */
export async function getMonthlyAllocatedNet(pool, userId, from, to, timeZone = 'UTC') {
 const { rows } = await pool.query(MONTHLY_ALLOCATED_NET_QUERY, [userId, from, to, timeZone]);

 return rows.map((row) => ({
  month: row.month,
  totalAmount: toAmount(row.total_amount ?? 0),
  // COUNT arrives as a string (bigint); Number is exact for a month's count.
  transactionCount: Number(row.transaction_count ?? 0),
 }));
}

/**
 * One page of the allocations of a month, plus the size of the whole set.
 *
 * includeRows false skips the page statement entirely rather than fetching rows and
 * dropping them: GET /overview needs the count and forbids the rows.
 *
 * @param {string} userId - UUID from the token
 * @param {string} month - the month to list, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 * @param {object} paging - { page, pageSize, includeRows }
 */
export async function getAllocationsPage(
 pool,
 userId,
 month,
 timeZone,
 { page, pageSize, includeRows = true },
) {
 if (!includeRows) {
  const total = await pool.query(ALLOCATIONS_COUNT_QUERY, [userId, month, timeZone]);
  return { rows: [], totalRows: Number(total.rows[0]?.total_rows ?? 0) };
 }

 const offset = (page - 1) * pageSize;

 // The count and the page are independent, so both run at once.
 const [rows, total] = await Promise.all([
  pool.query(ALLOCATIONS_PAGE_QUERY, [userId, month, timeZone, pageSize, offset]),
  pool.query(ALLOCATIONS_COUNT_QUERY, [userId, month, timeZone]),
 ]);

 return {
  rows: rows.rows.map((row) => ({
   ...row,
   amount: toAmount(row.amount),
   // Explicit null rather than a missing key: the source-account join is LEFT, so this is
   // the one field that can be absent (only for an account erased before account_registry
   // existed); sourceAccountId still identifies the row.
   sourceAccountName: row.sourceAccountName ?? null,
  })),
  totalRows: Number(total.rows[0]?.total_rows ?? 0),
 };
}
