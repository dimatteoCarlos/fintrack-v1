// Builds the frozen ExpenseCard; nothing here queries. totalAmount covers every expense leg,
// budgetAmount and categorizedExpense only legs on a live category_budget row (gap: hasUncategorizedExpense)

import { money, toAmount } from '../../budget_services/core/money.js';
import { makeDomainCard } from './makeDomainCard.js';

// No budget in force for the period, so budgetVariance has no second operand.
// An absent budget is not a budget of 0.
export const NO_BUDGET_NOTICE =
 'No category has a budget in force for this period, so the budget figures are not reported.';

// The write path rejects a destination with no category_budget account, so seeing this
// means a category was deleted or lost its budget row.
export const UNCATEGORIZED_EXPENSE_NOTICE =
 'Part of this period\'s expense is not accounted for by any current category.';

/**
 * Build the frozen ExpenseCard. budgetAmount arrives null when no budget is in force or the categories
 * span more than one currency; the caller picks the notice, this only refuses a variance without it.
 *
 * @param {object} figures
 * @param {number} figures.totalAmount - never null: 0 is real activity at zero
 * @param {number} figures.transactionCount - the rows totalAmount is made of
 * @param {number|null} figures.delta - null only when no prior period exists at all
 * @param {'complete'|'partial'|'none'} figures.priorPeriodCoverage - qualifies delta
 * @param {number|null} figures.categorizedExpense - spend on legs that still resolve to a live category_budget row
 */
export const makeExpenseCard = ({
 totalAmount,
 transactionCount,
 priorTotalAmount,
 delta,
 priorPeriodCoverage,
 budgetAmount,
 categorizedExpense,
 currency,
 window,
 notices = [],
}) => {
 // categorizedExpense stays in this condition because hasUncategorizedExpense
 // needs it; a card reporting the variance without that flag would hide which
 // universe the variance covers.
 const hasBudgetFigures = budgetAmount !== null && categorizedExpense !== null;

 // Compared through money(), not >, so a cent of float error cannot raise a
 // false inconsistency flag.
 const hasUncategorizedExpense =
  categorizedExpense !== null &&
  money(totalAmount).greaterThan(money(categorizedExpense));

 // Appended here, not by the caller, so the flag and its explanation come from
 // the same comparison.
 const cardNotices = hasUncategorizedExpense
  ? [...notices, UNCATEGORIZED_EXPENSE_NOTICE]
  : notices;

 return makeDomainCard({
  domain: 'expense',
  totalAmount,
  transactionCount,
  priorTotalAmount,
  delta,
  priorPeriodCoverage,
  currency,
  window,
  notices: cardNotices,
  domainFields: {
   budgetAmount,
   categorizedExpense,
   // Against totalAmount, not categorizedExpense: the budget caps all spending, even spending whose
   // category was closed (the budget query's inner joins drop it, the expense query does not).
   budgetVariance: hasBudgetFigures
    ? toAmount(money(budgetAmount).minus(totalAmount))
    : null,
   hasUncategorizedExpense,
  },
 });
};
