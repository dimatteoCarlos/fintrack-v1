// Closed-accounts list and export, read from account_registry because a close deletes the user_accounts row.

import { createError } from '../../../utils/errorHandling.js';

// Sort-key whitelist mapped to SQL: the key reaches ORDER BY as an identifier, which no
// placeholder can carry, so the client may only choose from this map.
const SORTABLE_COLUMNS = {
  closed_at: 'ar.closed_at',
  account_name: 'ar.account_name',
  account_type_name: 'act.account_type_name',
  account_created_at: 'ar.account_created_at',
};

const DEFAULT_SORT = 'closed_at';
const DEFAULT_ORDER = 'DESC';

// 20 fits one phone screen without scrolling; 100 stops a crafted limit from
// requesting the whole registry in one call.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Unparseable input falls back rather than raising, so a stray `?page=abc` in a
// shared link shows the first page instead of an error screen.
const toPositiveInt = (value, fallback, ceiling = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, ceiling);
};

// ORDER BY for both readers; an unrecognised key falls back to the default order
// (same tolerance as toPositiveInt) so a stale shared link does not error.
const resolveSort = (query) => ({
  sortKey: Object.prototype.hasOwnProperty.call(SORTABLE_COLUMNS, query.sort)
    ? query.sort
    : DEFAULT_SORT,
  sortDirection:
    String(query.order ?? '').toLowerCase() === 'asc' ? 'ASC' : DEFAULT_ORDER,
});

// WHERE clause and placeholder values shared by the list and the export, so the
// downloaded file always matches the rows on the screen it was launched from.
const buildRegistryFilter = (userId, query) => {
  // The compensation account needs no exclusion: deleteAccountService refuses to
  // close it (403), so it never has a closed_at.
  const conditions = ['ar.user_id = $1', 'ar.closed_at IS NOT NULL'];
  const values = [userId];

  const searchTerm = String(query.search ?? '').trim();
  if (searchTerm.length > 0) {
    // Wildcards are added here, not by the client, so the search stays a plain
    // substring match.
    values.push(`%${searchTerm}%`);
    conditions.push(
      `(ar.account_name ILIKE $${values.length}
        OR ar.close_reason ILIKE $${values.length}
        OR ar.category_name ILIKE $${values.length})`,
    );
  }

  const typeFilter = String(query.type ?? '').trim();
  if (typeFilter.length > 0) {
    values.push(typeFilter.toLowerCase());
    conditions.push(`LOWER(act.account_type_name) = $${values.length}`);
  }

  return { conditions, values, searchTerm, typeFilter };
};

// Shared FROM. Every join is LEFT: account_type_id is ON DELETE SET NULL and rows
// for accounts erased before the registry existed (035) hold no type or currency,
// so an INNER JOIN would drop the oldest closures.
const REGISTRY_SOURCE = `
    FROM account_registry ar
    LEFT JOIN account_types act
      ON act.account_type_id = ar.account_type_id
    LEFT JOIN currencies cur
      ON cur.currency_id = ar.currency_id
    LEFT JOIN category_nature_types cnt
      ON cnt.category_nature_type_id = ar.category_nature_type_id`;

// account_id breaks ties, so paging over equal sort keys cannot repeat one row
// and skip another.
const orderBy = ({ sortKey, sortDirection }) =>
  `ORDER BY ${SORTABLE_COLUMNS[sortKey]} ${sortDirection} NULLS LAST, ar.account_id DESC`;

/**
 * One page of the owner's closures plus the figures a pager needs.
 * @param {object} db - pool; this is a read and takes no lock
 * @param {object} query - parsed query string: search (name, reason or category
 *   name), type (an account_type_name), sort (a key of SORTABLE_COLUMNS), order
 *   ('asc' or 'desc'), page, limit
 * @param {string} timeZone - IANA zone the dates are rendered on; defaults to 'UTC'
 */
export const getClosedAccountRegistry = async (
  db,
  userId,
  query = {},
  timeZone = 'UTC',
) => {
  if (!userId) {
    throw createError(400, 'A user is required to list closed accounts.');
  }

  const { sortKey, sortDirection } = resolveSort(query);

  const limit = toPositiveInt(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const page = toPositiveInt(query.page, 1);
  const offset = (page - 1) * limit;

  const { conditions, values, searchTerm, typeFilter } = buildRegistryFilter(
    userId,
    query,
  );

  // The zone travels as a placeholder, never interpolated.
  values.push(timeZone);
  const zone = `$${values.length}::text`;

  // COUNT(*) OVER() instead of a second statement, so the total always agrees with
  // the page even if another session writes between two reads.
  const listQuery = `
    SELECT
      ar.account_id,
      ar.account_name,
      act.account_type_name,
      cur.currency_code,
      ar.account_starting_amount::text AS account_starting_amount,
      (ar.account_start_date AT TIME ZONE ${zone})::date::text
        AS account_start_date,
      ar.account_created_at,
      ar.category_name,
      ar.subcategory,
      cnt.category_nature_type_name,
      (ar.closed_at AT TIME ZONE ${zone})::date::text AS closed_at,
      ar.close_reason,
      COUNT(*) OVER() AS total_rows
    ${REGISTRY_SOURCE}
    WHERE ${conditions.join('\n      AND ')}
    ${orderBy({ sortKey, sortDirection })}
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;

  const { rows } = await db.query(listQuery, [...values, limit, offset]);

  // An empty page carries no total_rows; zero is correct because the filter
  // matched nothing.
  const total = rows.length > 0 ? Number(rows[0].total_rows) : 0;

  // Mapped field by field: total_rows is dropped (it repeats on every row) and the
  // keys are camelCase like every other service in this module.
  const accountList = rows.map((row) => ({
    accountId: row.account_id,
    accountName: row.account_name,
    accountTypeName: row.account_type_name,
    currencyCode: row.currency_code,
    accountStartingAmount: row.account_starting_amount,
    accountStartDate: row.account_start_date,
    accountCreatedAt: row.account_created_at,
    categoryName: row.category_name,
    subcategory: row.subcategory,
    categoryNatureTypeName: row.category_nature_type_name,
    closedAt: row.closed_at,
    closeReason: row.close_reason,
  }));

  return {
    rows: accountList.length,
    total,
    page,
    limit,
    // ceil counts a final partial page; zero results give zero pages, which lets a
    // pager hide itself.
    pageCount: Math.ceil(total / limit),
    sort: sortKey,
    order: sortDirection.toLowerCase(),
    search: searchTerm,
    type: typeFilter,
    accountList,
  };
};

/**
 * Every closure the filter matches, unpaged, for the download endpoint. A sibling of the list
 * reader, not a mode of it: a flag there would let list callers fetch the whole registry past MAX_LIMIT.
 *
 * @param {object} db - pool; this is a read and takes no lock
 * @param {object} query - same search, type, sort and order as the list; page and
 *   limit are not read
 * @param {string} timeZone - IANA zone from getUserTimeZone, the calendar the
 *   three dates are rendered on
 */
export const getClosedAccountRegistryForExport = async (
  db,
  userId,
  query = {},
  timeZone = 'UTC',
) => {
  if (!userId) {
    throw createError(400, 'A user is required to list closed accounts.');
  }

  const { sortKey, sortDirection } = resolveSort(query);
  const { conditions, values } = buildRegistryFilter(userId, query);

  // The zone is bound as a placeholder, never interpolated: it reaches AT TIME
  // ZONE as an expression, not an identifier.
  values.push(timeZone);
  const zone = `$${values.length}::text`;

  // closed_by joins LEFT to a username: 035 makes it ON DELETE SET NULL so a deleted user keeps the record.
  // Dates are 'YYYY-MM-DD' text on the owner's calendar: writeXlsx's toCellValue parses them as UTC
  // midnight, which reads back a day early west of UTC.
  const exportQuery = `
    SELECT
      ar.account_name,
      act.account_type_name,
      cur.currency_code,
      ar.account_starting_amount::text AS account_starting_amount,
      (ar.account_start_date AT TIME ZONE ${zone})::date::text
        AS account_start_date,
      (ar.account_created_at AT TIME ZONE ${zone})::date::text
        AS account_created_at,
      ar.category_name,
      ar.subcategory,
      cnt.category_nature_type_name,
      (ar.closed_at AT TIME ZONE ${zone})::date::text AS closed_at,
      closer.username AS closed_by_username,
      ar.close_reason
    ${REGISTRY_SOURCE}
    LEFT JOIN users closer
      ON closer.user_id = ar.closed_by
    WHERE ${conditions.join('\n      AND ')}
    ${orderBy({ sortKey, sortDirection })}
  `;

  const { rows } = await db.query(exportQuery, values);

  // camelCase keys, as read by the sheet spec in exportUtils. account_id is left
  // out: it names a row that no longer exists in user_accounts.
  return rows.map((row) => ({
    accountName: row.account_name,
    accountTypeName: row.account_type_name,
    currencyCode: row.currency_code,
    accountStartingAmount: row.account_starting_amount,
    accountStartDate: row.account_start_date,
    accountCreatedAt: row.account_created_at,
    categoryName: row.category_name,
    subcategory: row.subcategory,
    categoryNatureTypeName: row.category_nature_type_name,
    closedAt: row.closed_at,
    closedBy: row.closed_by_username,
    closeReason: row.close_reason,
  }));
};

// Exported so the screen's sort dropdown cannot offer an option the query rejects.
export const CLOSED_ACCOUNT_SORT_KEYS = Object.keys(SORTABLE_COLUMNS);
