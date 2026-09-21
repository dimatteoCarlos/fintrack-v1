// Budget figures for one category in one month. Separate from makeBudgetAccountStatus: a category has
// no accountId or nextMonthBudget, and it has accountCount. Shared invariants: assertBudgetFigures.

import { assertBudgetFigures } from './assertBudgetFigures.js';
import { toAmount, toRate } from './money.js';

/**
 * currency === null means the group mixes currencies: summing would assume a 1:1 rate, so every
 * figure is null and the caller raises a notice. Unreachable with one accounting currency, but a
 * null is safer than a silent wrong sum if it ever becomes reachable.
 */
export function makeBudgetCategoryStatus({
 categoryName,
 currency,
 accountCount,
 budgetAmount,
 actualSpent,
 remainingBudget,
 executionPercentage,
 isOverBudget,
}) {
 if (typeof categoryName !== 'string' || categoryName.length === 0) {
  throw new Error('BudgetCategoryStatus: categoryName is required and must be a non-empty string');
 }

 // A group is built by folding rows, so it cannot hold zero of them; a 0 would
 // mean the fold produced a key nothing mapped to.
 if (!Number.isInteger(accountCount) || accountCount < 1) {
  throw new Error('BudgetCategoryStatus: accountCount must be a positive integer');
 }

 if (currency === null) {
  return Object.freeze({
   categoryName,
   currency: null,
   accountCount,
   budgetAmount: null,
   actualSpent: null,
   remainingBudget: null,
   executionPercentage: null,
   // Null, not false: whether the group is over budget is exactly as
   // unanswerable as the amounts it would be decided from.
   isOverBudget: null,
  });
 }

 if (typeof currency !== 'string') {
  throw new Error('BudgetCategoryStatus: currency must be a string or null');
 }

 assertBudgetFigures(
  'BudgetCategoryStatus',
  { isOverBudget, executionPercentage },
  { budgetAmount, actualSpent, remainingBudget },
 );

 return Object.freeze({
  categoryName,
  currency,
  // Shown in the group header next to its name; served, not derived client-side
  // with accounts.filter(...).length, which would be a second fold nobody checks.
  accountCount,
  budgetAmount: toAmount(budgetAmount),
  actualSpent: toAmount(actualSpent),
  // Negative when the category was overspent, including when nothing was
  // allocated to any of its accounts.
  remainingBudget: toAmount(remainingBudget),
  // Recomputed from the group's sums, never averaged across its accounts: an
  // average weights an account budgeted at 10 like one budgeted at 10,000.
  executionPercentage: executionPercentage === null ? null : toRate(executionPercentage),
  isOverBudget,
 });
}
