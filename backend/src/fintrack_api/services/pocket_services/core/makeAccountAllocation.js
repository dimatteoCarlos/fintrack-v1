// The allocation figures of a real account, computed only here: the allocate service
// checks unassignedCash inside a row lock and the account screen shows the same figure.

import { toAmount, money } from '../../budget_services/core/money.js';

/**
 * unassignedCash is not an "available balance": a pocket never blocks a spend. It may be negative
 * (a state, not an error): the shortfall is reported on the account, never split across pockets.
 *
 * @param {object} row
 * @param {Date|string|null} [row.accountStartDate] - the opening instant
 * @param {string|number} row.accountBalance - NUMERIC as text
 * @param {string|number} row.accountAllocated - NUMERIC as text
 */
export function makeAccountAllocation({
 accountId,
 accountName,
 accountType,
 accountStartDate,
 accountBalance,
 accountAllocated,
}) {
 const balance = money(accountBalance);
 const allocated = money(accountAllocated);
 const unassigned = balance.minus(allocated);

 return Object.freeze({
  accountId,
  accountName,
  accountType,
  // Passed through untouched: it floors what may be dated onto this account, and
  // the form uses it to avoid offering a source the server would refuse.
  accountStartDate: accountStartDate ?? null,
  accountBalance: toAmount(balance),
  accountAllocated: toAmount(allocated),
  accountUnassignedCash: toAmount(unassigned),
  isOverAllocated: unassigned.isNegative(),
 });
}
