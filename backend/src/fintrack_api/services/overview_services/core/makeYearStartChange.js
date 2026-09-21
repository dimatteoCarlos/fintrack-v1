// Balance change since the prior December 31 close, for the year-to-date column. A pure
// difference: a null close (e.g. no payable leg) carries the notice of the function that
// computed it (makeHeroSection.js), so none is invented here.

import { money, toAmount } from '../../budget_services/core/money.js';

/**
 * @param {number|null} currentClose - the reference month's close
 * @param {number|null} priorClose - the prior December 31 close
 * @returns {number|null} the rounded difference, or null if either close is null
 */
export const makeYearStartChange = (currentClose, priorClose) =>
 currentClose === null || priorClose === null
  ? null
  : toAmount(money(currentClose).minus(priorClose));
