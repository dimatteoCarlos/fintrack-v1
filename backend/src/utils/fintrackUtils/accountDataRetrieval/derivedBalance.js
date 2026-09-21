/**
 * Balance at a movement: `account_starting_amount` plus the running sum, derived because the stored
 * `account_balance_after_tr` goes stale when a back-dated movement lands mid-series.
 * Only the opening credit is excluded (one row, named by `opening_for_account_id`); the funding debit stays.
 */

// movement_types.movement_type_id, the 'account-opening' row.
export const ACCOUNT_OPENING_MOVEMENT_TYPE_ID = 8;

// Catalog ids of the 'account-closure' row in movement_types and transaction_types (migration 032).
// Unused by the derivation below: a closure settlement moves real money and stays in the sum.
// Exported so queries never inline the literals.
export const ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID = 10;
export const ACCOUNT_CLOSURE_TRANSACTION_TYPE_ID = 6;

// Catalog ids of the 'balance-reversal' row in movement_types and transaction_types (migration 037).
// It stays in the sum below: excluding real money movement would make the balance disagree with the ledger.
export const BALANCE_REVERSAL_MOVEMENT_TYPE_ID = 11;
export const BALANCE_REVERSAL_TRANSACTION_TYPE_ID = 7;

/**
 * The amount each movement contributes to a balance, defined once so the three builders cannot drift apart.
 * Only the opening credit leg is zeroed; the funding debit leg has a NULL `opening_for_account_id`.
 *
 * @returns {string} - A CASE expression, to sit inside a SUM
 */
function movementAmountSql() {
 return `CASE WHEN tr.movement_type_id = ${ACCOUNT_OPENING_MOVEMENT_TYPE_ID}
                 AND tr.account_id = tr.opening_for_account_id
            THEN 0 ELSE tr.amount END`;
}

/**
 * A CTE giving each movement of one account its balance once applied; caller joins on `transaction_id`.
 * It spans the account's whole life: a window sees only its own rows, so a period filter would restart it.
 *
 * @param {string} [accountIdPlaceholder] - The bind placeholder holding the account id, e.g. '$1'
 * @returns {string} - The CTE body, to follow a `WITH`
 */
export function accountLedgerCte(accountIdPlaceholder = '$1') {
 // Interpolated into SQL, so only a bind placeholder is accepted; values stay bound by the caller.
 if (!/^\$\d+$/.test(accountIdPlaceholder)) {
  throw new Error(
   `accountLedgerCte expects a bind placeholder such as '$1', received: ${accountIdPlaceholder}`,
  );
 }

 return `
      account_ledger AS (${ledgerBody(accountIdPlaceholder)})`;
}

/**
 * The same series for the account a transaction belongs to, for callers that hold a transaction id and
 * no account id. The account is resolved inside the statement (one round trip), and the user id in that
 * lookup makes another owner's transaction resolve to no account.
 *
 * @param {string} transactionIdPlaceholder - The bind placeholder holding the transaction id
 * @param {string} userIdPlaceholder - The bind placeholder holding the owner's id
 * @returns {string} - Two CTE bodies, to follow a `WITH`
 */
export function accountLedgerCteForTransaction(
 transactionIdPlaceholder,
 userIdPlaceholder,
) {
 for (const placeholder of [transactionIdPlaceholder, userIdPlaceholder]) {
  if (!/^\$\d+$/.test(placeholder)) {
   throw new Error(
    `accountLedgerCteForTransaction expects bind placeholders such as '$1', received: ${placeholder}`,
   );
  }
 }

 return `
      ledger_account AS (
        SELECT
          tr.account_id
        FROM
          transactions tr
        WHERE
          tr.transaction_id = ${transactionIdPlaceholder}
          AND tr.user_id = ${userIdPlaceholder}
      ),
      account_ledger AS (${ledgerBody('(SELECT account_id FROM ledger_account)')})`;
}

/**
 * The balance one account holds now, as a scalar expression correlated to the caller's `user_accounts` row.
 * One correlated pass per row: sort by the output column's name, not by this expression.
 * `castAs`: FLOAT for screens, NUMERIC for money arithmetic (the pocket module feeds a decimal library).
 *
 * @param {string} [accountAlias] - The alias of `user_accounts` in the caller's query
 * @param {'FLOAT'|'NUMERIC'} [castAs] - The type the expression yields
 * @returns {string} - A parenthesised scalar SQL expression
 */
export function derivedAccountBalanceSql(accountAlias = 'ua', castAs = 'FLOAT') {
 // Interpolated into SQL, so it is restricted to a bare identifier.
 if (!/^[a-z_][a-z0-9_]*$/i.test(accountAlias)) {
  throw new Error(
   `derivedAccountBalanceSql expects a table alias, received: ${accountAlias}`,
  );
 }

 if (castAs !== 'FLOAT' && castAs !== 'NUMERIC') {
  throw new Error(
   `derivedAccountBalanceSql expects 'FLOAT' or 'NUMERIC', received: ${castAs}`,
  );
 }

 return `(
        SELECT CAST(
          ${accountAlias}.account_starting_amount
          + COALESCE(SUM(
              ${movementAmountSql()}
            ), 0)
        AS ${castAs})
        FROM transactions tr
        WHERE tr.account_id = ${accountAlias}.account_id
      )`;
}

/**
 * The series itself; private, so `accountIdSql` is only a bind placeholder or the `ledger_account` subquery.
 * FLOAT is fixed because consumers type `account_balance_after_tr` as `number`; a window SUM is never NULL.
 */
function ledgerBody(accountIdSql) {
 return `
        SELECT
          tr.transaction_id,
          tr.transaction_actual_date,
          CAST(
            ua.account_starting_amount
            + SUM(
                ${movementAmountSql()}
              ) OVER (
                ORDER BY tr.transaction_actual_date ASC, tr.transaction_id ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              )
          AS FLOAT) AS balance
        FROM
          transactions tr
        JOIN
          user_accounts ua ON ua.account_id = tr.account_id
        WHERE
          tr.account_id = ${accountIdSql}
      `;
}

/**
 * Publishes the derived figure under the stored column's name, `account_balance_after_tr`, which the
 * account list renders by its raw name. The `derived_balance_after_tr` alias is dropped so no reader
 * picks up a second value.
 *
 * @param {Array<Object>} rows - Rows carrying `derived_balance_after_tr`
 */
export function withDerivedBalance(rows) {
 return rows.map(({ derived_balance_after_tr, ...row }) => ({
  ...row,
  account_balance_after_tr: derived_balance_after_tr,
 }));
}
