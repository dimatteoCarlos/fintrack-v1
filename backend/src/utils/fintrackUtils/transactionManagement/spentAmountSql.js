/**
 * What "spent" means in SQL, shared by SPENT_QUERY (actualSpent) and MONTHLY_EXPENSE_QUERY (totalAmount).
 * Movement type 6 refunds a category account to a bank and `amount` is signed per leg, so type 1
 * alone would report a refunded expense as spent. Month bounds, account set and zone stay per statement.
 */

// Expense is bank -> category_budget (movementInputHandler.js), so the category
// account's leg is a positive deposit.
export const EXPENSE_MOVEMENT_TYPE_ID = 1;

// The transfer that returns money from a category account to a bank account.
export const EXPENSE_REVERSAL_MOVEMENT_TYPE_ID = 6;

// The movement types a spend figure is made of; shared by the filter and the sum so
// a statement cannot filter on one set and sum over another.
export const SPENT_MOVEMENT_TYPE_IDS = [
 EXPENSE_MOVEMENT_TYPE_ID,
 EXPENSE_REVERSAL_MOVEMENT_TYPE_ID,
];

/**
 * The amount each row contributes to a spend figure, as a CASE expression for a SUM.
 * ELSE 0 keeps it total over any row the caller's join admits, so a statement that
 * later widens its filter does not silently sum rows this rule never covered.
 *
 * @param {string} [alias] - The alias of `transactions` in the caller's query
 */
export function spentAmountSql(alias = 't') {
 // Interpolated into SQL, so it is restricted to a bare identifier.
 if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
  throw new Error(`spentAmountSql expects a table alias, received: ${alias}`);
 }

 return `CASE
        WHEN ${alias}.movement_type_id = ${EXPENSE_MOVEMENT_TYPE_ID} THEN ${alias}.amount
        WHEN ${alias}.movement_type_id = ${EXPENSE_REVERSAL_MOVEMENT_TYPE_ID} THEN ${alias}.amount
        ELSE 0
      END`;
}

/** The movement type list as a SQL literal (e.g. `1, 6`) for the IN (...) filter beside the sum. */
export function spentMovementTypeList() {
 return SPENT_MOVEMENT_TYPE_IDS.join(', ');
}
