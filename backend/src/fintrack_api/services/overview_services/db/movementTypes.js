/**
 * Named movement type ids for this module's statements. Catalog: 1 expense, 2 income, 3 investment,
 * 4 debt, 5 pocket, 6 transfer, 7 receive, 8 account-opening, 9 pnl, 10 account-closure,
 * 11 balance-reversal (migration 037); only the ids this module reads are named.
 */

import {
 ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID,
 ACCOUNT_OPENING_MOVEMENT_TYPE_ID,
} from '../../../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';

// Re-exported from the account ledger's definition so one number never has two names.
export { ACCOUNT_CLOSURE_MOVEMENT_TYPE_ID, ACCOUNT_OPENING_MOVEMENT_TYPE_ID };

/**
 * Every movement_type_name in catalog order: the values a client sends and a
 * schema validates, where the ids above serve statement predicates.
 * Defined in activityFilters.js and re-exported so existing importers keep working.
 */
export { MOVEMENT_TYPE_NAMES } from '../../../../utils/fintrackUtils/transactionManagement/activityFilters.js';

/** Money leaving the owner's accounts for a category. */
export const EXPENSE_MOVEMENT_TYPE_ID = 1;

/** Money arriving from an income source. */
export const INCOME_MOVEMENT_TYPE_ID = 2;

/** A debt leg, lent or borrowed, whose sign carries the direction. */
export const DEBT_MOVEMENT_TYPE_ID = 4;

/**
 * Money moved between two accounts the same owner holds.
 *
 * Read beside the expense type wherever a figure asks what left a bank account,
 * because a transfer out of it spends it as far as that account is concerned.
 */
export const TRANSFER_MOVEMENT_TYPE_ID = 6;

/**
 * A realised gain or loss. Three populations share it and only a description prefix separates
 * them: a real result, a deletion annulment pair, a closure settlement.
 */
export const PNL_MOVEMENT_TYPE_ID = 9;

/**
 * Neutralises an account's balance so it can close (CLOSE_ZERO_BALANCE_TYPES in deleteAccountService.js):
 * two legs, one on the account and one on the compensation account, both naming the account in
 * transactions.reversal_of_account_id. Neither capital nor a result; read it beside the closure settlement.
 */
export const BALANCE_REVERSAL_MOVEMENT_TYPE_ID = 11;
