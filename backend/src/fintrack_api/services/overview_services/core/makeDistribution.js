// Level-2 distributions: rank the parts and carry each one's share of the whole. Kept apart from
// makeCategoryBreakdown so a plain distribution never gets a Pareto's running-total fields.

import { money } from '../../budget_services/core/money.js';

// Four decimals, not toRate's two: a share is a 0-1 ratio, so two decimals would round every source
// under half a percent to 0.00 and read as contributing nothing.
const SHARE_SCALE = 4;

/**
 * Ranks the parts by amount descending (label breaks ties so rank is stable between requests).
 * share is a 0-1 ratio, null rather than 0 when the total is zero; a negative total is not clamped.
 * The total comes from the caller so shares are of the figure the card already published.
 *
 * @param {Array<{label: string, amount: number}>} parts - the rows, in any order
 * @param {number} total - the published figure the shares are taken against
 * @returns {Array<object>} the same rows, ranked, each with rank and share
 */
export const makeDistribution = (parts, total) => {
 const whole = money(total);

 const ranked = [...parts].sort((a, b) => {
  const difference = b.amount - a.amount;
  return difference !== 0 ? difference : a.label.localeCompare(b.label);
 });

 return ranked.map((part, index) => ({
  ...part,
  rank: index + 1,
  share: whole.isZero()
   ? null
   : money(part.amount).dividedBy(whole).toDecimalPlaces(SHARE_SCALE).toNumber(),
 }));
};
