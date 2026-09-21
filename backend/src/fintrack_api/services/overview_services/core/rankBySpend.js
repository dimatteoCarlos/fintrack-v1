// The Pareto fold shared by every level that ranks budget-bearing rows (category and subcategory rankings),
// so two copies cannot disagree on a figure on one screen. The caller supplies which rows and their labels.

import { money, toAmount } from '../../budget_services/core/money.js';

// Four decimals, not the two toRate applies: cumulativePercentage is a 0-1 ratio,
// so two decimals is 1% resolution and the Pareto's 80% line would land on the
// same point for several rows in a long tail.
const SHARE_SCALE = 4;

/**
 * Rank rows by spend with the Pareto's running totals; ties break by label so equal-spend rows cannot swap.
 * A mixed-currency row (actualSpent null) ranks last, adds 0, keeps its null; dropping it breaks the card.
 * A row with no plan carries the running plan forward, not truncating the curve; hasSkippedBudget flags it.
 *
 * @param {object[]} rows - rows carrying actualSpent and budgetAmount, frozen
 * @param {(row: object) => string} labelOf - the row's name, for the tie break
 * @returns {object[]} the same rows with rank and the two curves
 */
export const rankBySpend = (rows, labelOf) => {
 const spentOf = (row) => row.actualSpent ?? 0;

 const ranked = [...rows].sort((a, b) => {
  const difference = spentOf(b) - spentOf(a);
  return difference !== 0 ? difference : labelOf(a).localeCompare(labelOf(b));
 });

 const total = ranked.reduce((sum, row) => sum.plus(spentOf(row)), money(0));

 // Denominator is the plan of the rows that have one, not the card's budget: the
 // card's figure would leave the curve short of 1 whenever a row was skipped,
 // which reads as missing data.
 const budgetTotal = ranked.reduce(
  (sum, row) => (row.budgetAmount === null ? sum : sum.plus(row.budgetAmount)),
  money(0),
 );

 let running = money(0);
 let runningBudget = money(0);
 let skipped = false;

 // Spread into a new object: the status builders return frozen rows, and mutating
 // one would fail silently or throw, and edit a value another caller may hold.
 return ranked.map((row, index) => {
  running = running.plus(spentOf(row));

  // Inclusive of this row: the flag says whether the running figure beside it
  // covers every row up to that point, so the row that breaks it raises it.
  if (row.budgetAmount === null) {
   skipped = true;
  } else {
   runningBudget = runningBudget.plus(row.budgetAmount);
  }

  return {
   ...row,
   rank: index + 1,
   // Rounded like the rows beneath, so the last value equals their sum to the cent.
   cumulativeActual: toAmount(running),
   // 0 when nothing was spent: there is no share of zero, and a division by zero
   // would be an invented number.
   cumulativePercentage: total.isZero()
    ? 0
    : running.dividedBy(total).toDecimalPlaces(SHARE_SCALE).toNumber(),
   // Rounded like cumulativeActual, so the last point equals the sum of the rows' budgetAmount.
   cumulativeBudget: toAmount(runningBudget),
   // 0 when no row carries a plan (same division refusal as above); hasSkippedBudget
   // tells that apart from a complete plan.
   cumulativeBudgetPercentage: budgetTotal.isZero()
    ? 0
    : runningBudget.dividedBy(budgetTotal).toDecimalPlaces(SHARE_SCALE).toNumber(),
   hasSkippedBudget: skipped,
  };
 });
};
