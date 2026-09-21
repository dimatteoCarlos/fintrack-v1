// The reference month's actual against rolling averages of ACTIVE months only (empty ones
// would understate the need); activity is the transaction COUNT, not the amount. Averages
// read only months BEFORE the reference month, which is still in progress.

import { money, toAmount } from '../../budget_services/core/money.js';

// One reactive window and one stable one, not a window the user picks.
const REACTIVE_MONTHS = 3;
const STABLE_MONTHS = 12;

/**
 * The mean of the months that had activity, and how many there were. The average is null,
 * not 0, when none were active (the frontend renders a dash); the count is published so
 * the widget can say what the average is an average OF.
 */
const activeMonthFigures = (months) => {
 const active = months.filter((entry) => entry.transactionCount > 0);

 if (active.length === 0) {
  return { average: null, activeMonths: 0 };
 }

 const total = active.reduce((sum, entry) => sum.plus(entry.totalAmount), money(0));

 return {
  average: toAmount(total.dividedBy(active.length)),
  activeMonths: active.length,
 };
};

/**
 * The calendar year to date of the reference month, inclusive, read off the thirteen-month
 * series so it cannot disagree with the months above it. Every month counts, active or
 * not (a total has no denominator to protect); never null.
 */
const calendarYearToDate = (months, referenceMonth) => {
 const year = referenceMonth.slice(0, 4);
 const inYear = months.filter((entry) => entry.month.startsWith(year));

 return toAmount(
  inYear.reduce((sum, entry) => sum.plus(entry.totalAmount), money(0)),
 );
};

/**
 * Build one frozen MonthlySnapshot.
 *
 * @param {object} input
 * @param {string} input.domain - 'income', 'expense' or 'pocket'
 * @param {Array<{month: string, totalAmount: number, transactionCount: number}>} input.months -
 *   ascending, the reference month last, preceded by the twelve before it
 */
export const makeMonthlySnapshot = ({ domain, months, currency, notices = [] }) => {
 const current = months[months.length - 1];
 const history = months.slice(0, -1);

 const reactive = activeMonthFigures(history.slice(-REACTIVE_MONTHS));
 const stable = activeMonthFigures(history.slice(-STABLE_MONTHS));

 return Object.freeze({
  domain,
  domainMonthlyActual: current.totalAmount,
  activeMonthAverage3m: reactive.average,
  activeMonths3m: reactive.activeMonths,
  // The variance uses the stable average, not the reactive one: a fast-moving
  // baseline cannot tell whether the month is unusual.
  activeMonthAverage12m: stable.average,
  activeMonths12m: stable.activeMonths,
  varianceVsAverage: stable.average === null
   ? null
   : toAmount(money(current.totalAmount).minus(stable.average)),
  // The reference month's calendar year, summed from the series rather than fetched.
  yearToDate: calendarYearToDate(months, current.month),
  currency,
  meta: Object.freeze({
   notices: Object.freeze([...notices]),
   provenance: null,
  }),
 });
};
