// Substitute source for `user_accounts` that keeps closed accounts resolvable through `account_registry`.

/**
 * Every account an owner ever had, closed or erased included: `account_registry` (migration 035) drives the
 * rows, but its identity columns are NULL for open accounts, so each is COALESCEd from `user_accounts`.
 * `account_type_id` must stay coalesced: four INNER joins in overviewAccountRepository.js need it non-null.
 *
 * @param {string} [userIdPlaceholder] - The bind placeholder holding the owner's id, e.g. '$1'
 * @returns {string} - The CTE body, to follow a `WITH`
 */
export function accountIdentitySelect(userIdPlaceholder = '$1') {
 // Interpolated into SQL, so restricted to a bind placeholder that can never
 // carry a value (same guard as accountLedgerCte in derivedBalance.js).
 if (!/^\$\d+$/.test(userIdPlaceholder)) {
  throw new Error(
   `accountIdentitySelect expects a bind placeholder such as '$1', received: ${userIdPlaceholder}`,
  );
 }

 return `
        SELECT
          ar.account_id,
          -- Selected as well as filtered on, so a caller that swaps this in for user_accounts
          -- keeps its existing ua.user_id predicate; it reads the same column as the WHERE below.
          ar.user_id,
          COALESCE(ua.account_name, ar.account_name) AS account_name,
          COALESCE(ua.account_type_id, ar.account_type_id) AS account_type_id,
          COALESCE(ua.currency_id, ar.currency_id) AS currency_id,
          COALESCE(
            ua.account_starting_amount,
            ar.account_starting_amount
          ) AS account_starting_amount,
          COALESCE(ua.account_start_date, ar.account_start_date) AS account_start_date,
          COALESCE(ua.created_at, ar.account_created_at) AS account_created_at,
          -- Closed if the user_accounts row is gone or the registry row carries closed_at;
          -- both halves are needed because both populations persist: accounts whose row was
          -- deleted (closures recorded before CLOSE kept the row, and the erasure tail, which
          -- leaves a registry row with no stamp) and accounts closed with the row kept and stamped.
          --
          -- ar.closed_at rather than ua.closed_at: the registry row always exists here, and
          -- CLOSE stamps it in the same statement that re-copies the identity columns.
          (ua.account_id IS NULL OR ar.closed_at IS NOT NULL) AS is_closed
        FROM
          account_registry ar
        LEFT JOIN
          user_accounts ua ON ua.account_id = ar.account_id
        WHERE
          ar.user_id = ${userIdPlaceholder}`;
}

/**
 * The same rows as a derived table, replacing the table name alone: one edit per join instead of the two
 * places a CTE needs (statement head and join). Same precondition: migration 035 has run.
 *
 * @param {string} [userIdPlaceholder] - The bind placeholder holding the owner's id, e.g. '$1'
 * @returns {string} - A parenthesised subquery, to be followed by an alias
 */
export function accountIdentitySource(userIdPlaceholder = '$1') {
 return `(${accountIdentitySelect(userIdPlaceholder)}
      )`;
}

export function accountIdentityCte(userIdPlaceholder = '$1') {
 return `
      account_identity AS (${accountIdentitySelect(userIdPlaceholder)}
      )`;
}

export default accountIdentityCte;
