// One row of a pocket's history. The sign is the decision: positive committed money
// to the goal, negative released it back to the account's unassigned cash; neither
// moves a balance.

import { toAmount, money } from '../../budget_services/core/money.js';

/**
 * The date is the decision's day (not the row's write time), arriving already as a YYYY-MM-DD label on
 * the owner's calendar so no Date shifts it across zones; allocationTime tells same-day entries apart.
 * originalAmount and its currency are audit metadata, never arithmetic units.
 */
export function makeAllocationEntry({
 allocationId,
 amount,
 allocationDate,
 allocationTime,
 sourceAccountId,
 sourceAccountName,
 sourceAccountIsClosed,
 originalAmount,
 originalCurrency,
 exchangeRate,
 exchangeRateSource,
 exchangeRateTimestamp,
}) {
 return Object.freeze({
  // BIGSERIAL crosses the pg driver as a string; allocation ids stay far below the
  // safe-integer bound, so Number() loses nothing.
  allocationId: Number(allocationId),
  amount: toAmount(amount),
  allocationDate,
  allocationTime,
  sourceAccountId,
  // Null only for an account erased before account_registry existed.
  sourceAccountName: sourceAccountName ?? null,
  sourceAccountIsClosed,
  originalAmount: toAmount(originalAmount),
  originalCurrency,
  // Not an amount: it keeps the ten decimals of its column, so a rate that
  // produced the stored figure can be re-applied and checked against it.
  exchangeRate: money(exchangeRate).toNumber(),
  exchangeRateSource,
  exchangeRateTimestamp,
 });
}
