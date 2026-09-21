// Calendar-year net flow and savings rate for the Year to date column. The rate is year net
// flow over year income, not an average of monthly rates; it reuses the totals that
// makeMonthlySnapshot.js accumulates (`yearToDate`) rather than querying again.

import { money, toAmount } from '../../budget_services/core/money.js';
import { savingsRateOf } from './makeHeroSection.js';

// Year-scoped counterpart of NO_INCOME_NOTICE (makeHeroSection.js), so a reader
// knows which window is empty, month or year.
export const NO_YEAR_INCOME_NOTICE =
 'No income was recorded this year, so the year to date savings rate is not reported.';

// Year-scoped counterpart of NEGATIVE_INCOME_NOTICE (makeHeroSection.js).
export const NEGATIVE_YEAR_INCOME_NOTICE =
 'The recorded income for this year is negative, so the year to date savings rate is not reported.';

/**
 * Build the frozen year-to-date flow: { netYearToDateFlow, yearToDateSavingsRate, meta }.
 * The two inputs are the calendar year's accumulated income and expense.
 */
export const makeYearToDateFlow = ({
 incomeYearToDate,
 expenseYearToDate,
 notices = [],
}) => {
 const income = money(incomeYearToDate);
 // Computed once so the published amount and the rate's numerator cannot drift apart.
 const netFlow = income.minus(expenseYearToDate);
 const yearToDateSavingsRate = savingsRateOf(income, netFlow);

 const flowNotices = [...notices];
 if (yearToDateSavingsRate === null) {
  flowNotices.push(
   income.isZero() ? NO_YEAR_INCOME_NOTICE : NEGATIVE_YEAR_INCOME_NOTICE,
  );
 }

 return Object.freeze({
  netYearToDateFlow: toAmount(netFlow),
  yearToDateSavingsRate,
  meta: Object.freeze({
   notices: Object.freeze(flowNotices),
   provenance: null,
  }),
 });
};
