// Rounding point for one account in one month, unbudgeted ones included. No money field is
// null: no allocation reports 0, so remainingBudget goes negative. executionPercentage is
// null for a zero budget. Shared invariants live in assertBudgetFigures.

import { assertBudgetFigures } from './assertBudgetFigures.js';
import { toAmount, toRate } from './money.js';

export function makeBudgetAccountStatus({
 accountId = null,
 accountName = null,
 categoryName = null,
 subcategory = null,
 nature = null,
 accountStartDate = null,
 closedDate = null,
 currency,
 budgetAmount,
 nextMonthBudget,
 actualSpent,
 remainingBudget,
 executionPercentage,
 isOverBudget,
}) {
 if (!currency || typeof currency !== 'string') {
  throw new Error('BudgetAccountStatus: currency is required and must be a string');
 }

 assertBudgetFigures(
  'BudgetAccountStatus',
  { isOverBudget, executionPercentage },
  { budgetAmount, nextMonthBudget, actualSpent, remainingBudget },
 );

 return Object.freeze({
  // One status per requested account.
  accountId,
  accountName,
  // Repeated on every row on purpose: a row must be readable on its own in an
  // ungrouped list, without the client joining back to categories[].
  categoryName,
  subcategory,
  // The nature tag from the catalog seeded by migration 005. Per account, not per
  // category, because it varies within one category.
  nature,
  // Registration day, never summed; lets a form stop offering a category before it existed.
  // Null is admitted, not hidden: the server refuses the movement anyway, and hiding on
  // missing data would silently empty a list.
  accountStartDate,
  // The day CLOSE stamped this account, or null while open. Same shipping
  // rule as accountStartDate above.
  closedDate,
  currency,
  budgetAmount: toAmount(budgetAmount),
  // What next month is already set to; the card shows its exception line by
  // comparing it against budgetAmount, so a terminator repeating the same figure
  // shows nothing.
  nextMonthBudget: toAmount(nextMonthBudget),
  actualSpent: toAmount(actualSpent),
  // Negative when more was spent than allocated, including when nothing was
  // allocated at all.
  remainingBudget: toAmount(remainingBudget),
  // A ratio, not money: rounded so the response and the CSV agree, never summed
  // anywhere. Null when the budget is 0, because there is nothing to divide by.
  executionPercentage: executionPercentage === null ? null : toRate(executionPercentage),
  isOverBudget,
 });
}
