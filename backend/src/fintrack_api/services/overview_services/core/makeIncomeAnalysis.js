// Level-2 Income section: thirteen-month series, split by source, concentration. The series
// reuses the card's monthly rows; concentration is the first ranked row's existing share.

import { makeDistribution } from './makeDistribution.js';
import { makeTrendSeries } from './makeTrendSeries.js';

// No income in the month; the distribution is absent, not empty (empty would say
// sources exist and none moved).
export const NO_INCOME_IN_PERIOD_NOTICE =
 'No income was received in this period, so it is not broken down by source.';

// source_account_id is nullable: such income has no attributable origin but is real money,
// so it is its own part; dropping it would make the parts miss the card's total.
export const UNATTRIBUTED_INCOME_NOTICE =
 'Some income in this period names no source account and is reported as unattributed.';

/**
 * Build the frozen income analysis. bySource and concentration are absent together (not null)
 * when the level did not ask for the statement or the month received nothing.
 *
 * @param {object} input
 * @param {Array<{month: string, totalAmount: number}>} input.months - the long series
 * @param {number} input.totalAmount - the card's figure, which the shares are taken against
 * @param {Array<{accountId: number|null, accountName: string|null, accountIsClosed?: boolean, amount: number}>} [input.sources]
 */
export const makeIncomeAnalysis = ({ level, months, totalAmount, sources }) => {
 const notices = [];

 // Absent when the statement was not run (derived level); an empty array would
 // claim something no query checked.
 let bySource;
 let concentration;

 if (sources !== undefined) {
  if (sources.length === 0) {
   notices.push(NO_INCOME_IN_PERIOD_NOTICE);
  } else {
   if (sources.some((source) => source.accountId === null)) {
    notices.push(UNATTRIBUTED_INCOME_NOTICE);
   }

   bySource = makeDistribution(
    sources.map((source) => ({
     accountId: source.accountId,
     accountName: source.accountName,
     // A closed source keeps its name but its account screen is gone.
     accountIsClosed: source.accountIsClosed === true,
     // The ranking's tie-break label; an unattributed part has no name and sorts
     // under '', which is deterministic.
     label: source.accountName ?? '',
     amount: source.amount,
    })),
    totalAmount,
   );

   // The largest source's share, read and never recomputed; null exactly when the
   // shares are (income summing to zero).
   concentration = bySource[0].share;
  }
 }

 return Object.freeze({
  domain: 'income',
  level,
  // Thirteen points: the reference month plus the twelve it is judged against.
  series: Object.freeze(makeTrendSeries(months)),
  ...(bySource === undefined ? {} : { bySource: Object.freeze(bySource) }),
  ...(concentration === undefined ? {} : { concentration }),
  meta: Object.freeze({ notices: Object.freeze(notices) }),
 });
};
