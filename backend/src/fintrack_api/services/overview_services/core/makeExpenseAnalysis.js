// Level-2 section of the Expense domain: the thirteen-month series plus one decomposition. The category
// ranking and its budget variance are already published at level 1, so they are read there, not rebuilt.

import { money, toAmount } from '../../budget_services/core/money.js';
import { makeTrendSeries } from './makeTrendSeries.js';

// Shown when no budget-module figure exists to split against (mixed currencies, or no category
// account); the pair stays absent, since "all uncategorised" would misstate the owner's categories.
export const NO_CATEGORIZATION_NOTICE =
 'Categorized spending is not reported for this period, so the month is not split against it.';

/**
 * Level 1 publishes only a boolean for uncategorised spending (the amount would be a second total);
 * the categorized/uncategorized pair is the level-2 decomposition. uncategorized is not clamped: it
 * goes negative only if a category account were charged outside the expense set, and a clamp hides that.
 *
 * @param {object} input
 * @param {string} input.level - the requested depth
 * @param {Array<{month: string, totalAmount: number}>} input.months - the long series
 * @param {number} input.totalAmount - every expense leg of the period
 * @param {number|null} input.categorizedExpense - null when there is no figure
 * @returns {object} frozen analysis section
 */
export const makeExpenseAnalysis = ({ level, months, totalAmount, categorizedExpense }) => {
 const notices = [];

 let categorization;
 if (categorizedExpense === null) {
  notices.push(NO_CATEGORIZATION_NOTICE);
 } else {
  categorization = Object.freeze({
   categorized: categorizedExpense,
   uncategorized: toAmount(money(totalAmount).minus(categorizedExpense)),
  });
 }

 return Object.freeze({
  domain: 'expense',
  level,
  series: Object.freeze(makeTrendSeries(months)),
  ...(categorization === undefined ? {} : { categorization }),
  meta: Object.freeze({ notices: Object.freeze(notices) }),
 });
};
