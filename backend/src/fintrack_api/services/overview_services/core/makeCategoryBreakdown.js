// One array serves both the donut and the Pareto so the two charts read the same rows. Base fields come
// from budgetCalculationService.getBudgetAccountsStatus (makeCategoryGroups is private); rank and the
// curves are added here because that service sorts alphabetically, not by spend.

import { rankBySpend } from './rankBySpend.js';

/**
 * Ranks the categories by spend and carries the Pareto's running total.
 *
 * @param {object[]} categories - ExpenseCategoryStatus base fields, frozen objects
 * @returns {object[]} the same rows with rank and the two curves
 */
export const makeCategoryBreakdown = (categories) =>
 rankBySpend(categories, (category) => category.categoryName);
