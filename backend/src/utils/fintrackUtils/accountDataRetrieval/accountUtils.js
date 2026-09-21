// Account lookups shared by Budget, Overview and Reports.
// A query about circulation or visibility filters both stamps (deleted_at IS NULL AND
// closed_at IS NULL); getAccountsByType is the one exception and states its reason.

import { pool } from '../../../db/config/configDB.js';
import { createError } from '../../errorHandling.js';

// Account types a request may ask for; the creation-side counterpart of NOT_BOUNDARY_ACCOUNT.
// Written out rather than read from account_types: the catalog lists what can exist, and migration
// 031 added 'boundary' to it, which any controller resolving a type from the catalog would accept.
export const USER_CREATABLE_ACCOUNT_TYPES = Object.freeze([
  'bank',
  'cash',
  'investment',
  'debtor',
  'pocket_saving',
  'category_budget',
  'income_source',
]);

/**
 * Returns the normalised type name, or throws a 400 naming `field`. Throws rather than returning
 * a boolean so call sites do not each repeat the throw. Case-insensitive; catalog names are lowercase.
 */
export const assertUserCreatableAccountType = (accountTypeName, field) => {
  const name = String(accountTypeName ?? '')
    .trim()
    .toLowerCase();

  if (!USER_CREATABLE_ACCOUNT_TYPES.includes(name)) {
    throw createError(
      400,
      `Account type "${name}" is not available on ${field}.`,
    );
  }

  return name;
};

// Excludes the compensation account by type; expects account_types joined as `act`. The name filter
// beside it stays until 'slack' is reserved at creation: since migration 031 a 'bank' account
// named 'slack' can still be captured, and no type predicate sees it.
export const NOT_BOUNDARY_ACCOUNT =
 "AND act.account_type_name IS DISTINCT FROM 'boundary'";

// Both stamps, never one: they coincide only while CLOSE writes them together,
// and a deleted_at test alone would put a closed account back in every list the
// day that stops. Expects the account table aliased `ua`.
export const LIVE_ACCOUNT =
 'AND ua.deleted_at IS NULL AND ua.closed_at IS NULL';

/**
 * Every account of a type the user has ever had, closed ones included, with its window ends as
 * 'YYYY-MM-01' months on the owner's calendar (string order is chronological); `closedMonth` null = open.
 * The WHERE cannot be a bare `deleted_at IS NULL` (CLOSE stamps it too); `nature` is LEFT-joined (nullable).
 *
 * @param {string} userId - User UUID.
 * @param {string} accountType - e.g. 'category_budget'.
 * @param {string} [timeZone] - IANA zone of the account owner, the calendar the month boundaries are cut on.
 * @param {Object} [clientOrPool] - Database client or pool; a probe closing an account inside a transaction must read on that transaction's client.
 * @returns {Promise<Array<{accountId: number, accountName: string, subcategory: string|null, nature: string|null, currency: string, startMonth: string, closedMonth: string|null, currentMonth: string}>>}
 */
export async function getAccountsByType(userId, accountType, timeZone = 'UTC', clientOrPool = pool) {
  // currentMonth repeats on every row so callers never read the device clock;
  // the current month is the server's to decide.
  const query = `
    SELECT
      ua.account_id,
      ua.account_name,
      cba.subcategory,
      cnt.category_nature_type_name AS nature,
      cur.currency_code AS currency,
      to_char(date_trunc('month', ua.account_start_date AT TIME ZONE $3), 'YYYY-MM-01') AS start_month,
      CASE
        WHEN ua.closed_at IS NULL THEN NULL
        ELSE to_char(date_trunc('month', ua.closed_at AT TIME ZONE $3), 'YYYY-MM-01')
      END AS closed_month,
      to_char(date_trunc('month', now() AT TIME ZONE $3), 'YYYY-MM-01') AS current_month
    FROM user_accounts ua
    JOIN account_types act ON ua.account_type_id = act.account_type_id
    JOIN category_budget_accounts cba ON ua.account_id = cba.account_id
    JOIN currencies cur ON ua.currency_id = cur.currency_id
    LEFT JOIN category_nature_types cnt
      ON cnt.category_nature_type_id = cba.category_nature_type_id
    WHERE ua.user_id = $1
      AND act.account_type_name = $2
      AND ua.account_name != 'slack'
      AND act.account_type_name IS DISTINCT FROM 'boundary'
      AND (ua.deleted_at IS NULL OR ua.closed_at IS NOT NULL)
    ORDER BY ua.account_name ASC
  `;
  const result = await clientOrPool.query(query, [userId, accountType, timeZone]);
  return result.rows.map((row) => ({
    accountId: row.account_id,
    accountName: row.account_name,
    subcategory: row.subcategory || null,
    nature: row.nature || null,
    currency: row.currency,
    startMonth: row.start_month,
    closedMonth: row.closed_month,
    currentMonth: row.current_month,
  }));
}
