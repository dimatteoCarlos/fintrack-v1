/**
 * Row shape shared by the six transaction lists, in the field order of frontend MovementTransactionDataType.
 * account_balance_after_tr is unselected: writers store 0.00 there, meaning "not persisted".
 * Filters stay in each statement so page and count remain comparable; Data Export reuses this file.
 */

import { derivedAccountBalanceSql } from '../accountDataRetrieval/derivedBalance.js';

const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'FLOAT');

/**
 * The SELECT list (without the SELECT keyword), in the declared type's field order.
 *
 * @param {string} timeZonePlaceholder - bind placeholder such as '$2' holding the
 *  IANA zone; its index differs across statements
 */
export function transactionRowColumns(timeZonePlaceholder) {
 if (!/^\$\d+$/.test(timeZonePlaceholder)) {
  throw new Error(
   `transactionRowColumns expects a bind placeholder such as '$2', received: ${timeZonePlaceholder}`,
  );
 }

 return `
    tr.transaction_id,
    tr.user_id,
    tr.description,
    tr.amount,
    tr.movement_type_id,
    tr.transaction_type_id,
    tr.currency_id,
    tr.account_id,
    tr.source_account_id,
    tr.destination_account_id,
    tr.status,
    tr.transaction_actual_date,
    tr.created_at,
    tr.updated_at,
    mt.movement_type_name,
    trt.transaction_type_name,
    act.account_type_name,
    cr.currency_code,
    -- A closed account's name survives on account_registry, stamped at closure.
    COALESCE(ua.account_name, ar.account_name) AS account_name,
    ua.account_type_id,
    ua.account_starting_amount,
    ${DERIVED_BALANCE} AS account_balance,
    ua.account_start_date,
    (tr.transaction_actual_date AT TIME ZONE ${timeZonePlaceholder})::date::text AS transaction_local_date,
    -- Both tests are needed: a closure that left no user_accounts row shows only as
    -- the missing row; one that kept the row shows only as the stamp read from account_registry.
    (ua.account_id IS NULL OR ar.closed_at IS NOT NULL) AS account_is_closed`;
}

// user_accounts is LEFT-joined because its row can be absent (accounts closed before the close path kept it,
// erased accounts): INNER would drop their movements from the page but not the count, leaving a short page.
// account_registry adds only the name (primary-key join); account_types hangs off ua, so it is LEFT too.
export const TRANSACTION_ROW_SOURCE = `
  FROM transactions tr
  JOIN movement_types mt ON mt.movement_type_id = tr.movement_type_id
  JOIN transaction_types trt ON trt.transaction_type_id = tr.transaction_type_id
  JOIN currencies cr ON cr.currency_id = tr.currency_id
  LEFT JOIN user_accounts ua ON ua.account_id = tr.account_id
  LEFT JOIN account_registry ar ON ar.account_id = tr.account_id
  LEFT JOIN account_types act ON act.account_type_id = ua.account_type_id`;
