// Level-2 realized P/L section: a series and a split by account type, adding no statement (the months
// are already fetched for the card's delta). Both parts are published; the card leaves the remainder out.

import { money, toAmount } from '../../budget_services/core/money.js';
import { makeTrendSeries } from './makeTrendSeries.js';

/**
 * Build the frozen profit-and-loss analysis. Every part is always present and may be negative
 * (a loss is not an absent figure), so there is no notice and no null branch. investment and bank
 * filter the rows totalAmount summed; other is the remainder, so the three parts partition it.
 *
 * @param {object} input
 * @param {Array<{month: string, totalAmount: number}>} input.months - the long series
 * @param {number} input.totalAmount - realized P/L over every account except the counterparty
 * @param {number} input.realizedFromInvestment - the part of it on investment accounts
 * @param {number} input.realizedFromBank - the part of it on bank and cash accounts
 */
export const makePnlAnalysis = ({
 level,
 months,
 totalAmount,
 realizedFromInvestment,
 realizedFromBank,
}) =>
 Object.freeze({
  domain: 'pnl',
  level,
  series: Object.freeze(makeTrendSeries(months)),
  byAccountType: Object.freeze({
   investment: realizedFromInvestment,
   bank: realizedFromBank,
   other: toAmount(
    money(totalAmount).minus(realizedFromInvestment).minus(realizedFromBank),
   ),
  }),
  meta: Object.freeze({ notices: Object.freeze([]) }),
 });
