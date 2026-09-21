// Arithmetic invariants shared by the budget-status factories (makeBudgetAccountStatus,
// makeBudgetMonthStatus, makeBudgetCategoryStatus), so a rule cannot change in one
// and leave the card and the chart reporting different figures.

import { isFiniteMoney } from './money.js';

/**
 * Reject a set of budget figures that cannot be true together.
 *
 * @param {string} label - factory name, so the message says which shape failed
 * @param {object} flags - { isOverBudget, executionPercentage }
 * @param {object} amounts - every monetary field, keyed by name
 */
export function assertBudgetFigures(label, flags, amounts) {
 const { isOverBudget, executionPercentage } = flags;

 if (typeof isOverBudget !== 'boolean') {
  throw new Error(`${label}: isOverBudget is required and must be a boolean`);
 }

 // isFiniteMoney, not typeof 'number': the service hands over Decimals so no
 // lossy conversion happens on the way in.
 for (const [field, value] of Object.entries(amounts)) {
  if (!isFiniteMoney(value)) {
   throw new Error(`${label}: ${field} must be a finite amount`);
  }
 }

 // Checked after the loop, not before: a non-finite budgetAmount has to fail as
 // "not a finite amount", not as an incoherence it is not the cause of.
 if (executionPercentage !== null && !isFiniteMoney(executionPercentage)) {
  throw new Error(`${label}: executionPercentage must be a finite amount or null`);
 }
}
