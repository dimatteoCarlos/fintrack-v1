// Level-2 Pocket section: a series, per-pocket progress and committed against free cash. Progress rows
// are the pocketBoardService rows republished, so section and board agree; the bank balance and free
// cash that committed-against-free needs are page-level reads.

import { money, toAmount } from '../../budget_services/core/money.js';
import { makeTrendSeries } from './makeTrendSeries.js';

// No pocket planned; the progress list is absent, not empty (empty would say
// plans exist and none progressed).
export const NO_POCKETS_PLANNED_NOTICE =
 'No savings pocket has been planned, so there is no progress to report.';

// The promised amount exceeds what the accounts hold. Not an error or a rounding
// artifact: an expense against committed money is always accepted, so an account
// can end a month owing its pockets more than it holds.
export const OVERCOMMITTED_NOTICE =
 'More is committed to pockets than the bank and cash accounts hold at the close of this period.';

/**
 * Build the frozen pocket analysis. It publishes three terms, not two: committed plus free does NOT
 * equal the balance when an account is overcommitted, since free is floored per account before the
 * sum. A client handed two terms would compute a wrong third.
 *
 * @param {object} input
 * @param {Array<{month: string, totalAmount: number}>} input.months - the long series
 * @param {object[]} input.pockets - the board's per-pocket rows, already frozen
 * @param {number} input.committed - the card's total, what the plans claim
 * @param {number} [input.bankBalance] - the balance the commitments sit inside
 * @param {number} [input.freeCash] - what none of the accounts has promised away
 */
export const makePocketAnalysis = ({
 level,
 months,
 pockets,
 committed,
 bankBalance,
 freeCash,
}) => {
 const notices = [];

 let progressByPocket;
 if (pockets.length === 0) {
  notices.push(NO_POCKETS_PLANNED_NOTICE);
 } else {
  progressByPocket = pockets;
 }

 let committedAgainstFree;
 if (bankBalance !== undefined && freeCash !== undefined) {
  committedAgainstFree = Object.freeze({
   bankBalance,
   committed,
   freeCash,
   // What the per-account floor absorbed: 0 when every account covers its own
   // commitments, otherwise the shortfall that explains why the three terms do
   // not add up.
   flooredShortfall: toAmount(
    money(freeCash).plus(committed).minus(bankBalance),
   ),
  });

  if (money(committed).greaterThan(money(bankBalance))) {
   notices.push(OVERCOMMITTED_NOTICE);
  }
 }

 return Object.freeze({
  domain: 'pocket',
  level,
  // The committed position at each month close, thirteen points. The monthly
  // snapshot's pocket entry is a flow, so the two stay separate statements.
  series: Object.freeze(makeTrendSeries(months)),
  ...(progressByPocket === undefined
   ? {}
   : { progressByPocket: Object.freeze(progressByPocket) }),
  ...(committedAgainstFree === undefined ? {} : { committedAgainstFree }),
  meta: Object.freeze({ notices: Object.freeze(notices) }),
 });
};
