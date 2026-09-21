// One entry of the month series. Separate from makeBudgetAccountStatus, which requires currency (stated
// once per series) and nextMonthBudget (the next entry) that a month lacks. Invariants: assertBudgetFigures.

import { assertBudgetFigures } from './assertBudgetFigures.js';
import { toAmount, toRate } from './money.js';

// First of the month, as text: a DATE through the driver becomes a Date at local midnight,
// so months are resolved in SQL and carried as text.
const MONTH_PATTERN = /^\d{4}-\d{2}-01$/;

export function makeBudgetMonthStatus({
 month,
 budgetAmount,
 actualSpent,
 remainingBudget,
 executionPercentage,
 isOverBudget,
}) {
 if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
  throw new Error('BudgetMonthStatus: month must be a first-of-month date as YYYY-MM-01');
 }

 assertBudgetFigures(
  'BudgetMonthStatus',
  { isOverBudget, executionPercentage },
  { budgetAmount, actualSpent, remainingBudget },
 );

 return Object.freeze({
  month,
  // The carry-forward fill means a month with no allocation in force is still
  // present in the series, reporting the 0 that absence resolves to.
  budgetAmount: toAmount(budgetAmount),
  actualSpent: toAmount(actualSpent),
  // Negative for a month spent against without a budget; this is why no monetary
  // field here is nullable.
  remainingBudget: toAmount(remainingBudget),
  // Null when the month's budget is 0. Never averaged into the range total:
  // the range percentage is recomputed from the sums.
  executionPercentage: executionPercentage === null ? null : toRate(executionPercentage),
  isOverBudget,
 });
}
