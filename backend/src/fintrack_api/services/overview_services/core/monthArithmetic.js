// Month arithmetic on 'YYYY-MM-01' text, never through Date: it parses as UTC midnight and a local getter
// can land on the previous month. Mirrors a private helper in budgetCalculationService.js on purpose:
// budget_services is a frozen contract, and integer arithmetic here cannot disagree with it.

/**
 * A month as a count of months since year 0, so shifting is addition.
 *
 * @param {string} month - 'YYYY-MM-01'
 */
const monthIndex = (month) => {
 const [year, index] = month.split('-').map(Number);
 return year * 12 + (index - 1);
};

/**
 * The month `delta` months away from `month`.
 *
 * @param {string} month - 'YYYY-MM-01'
 * @param {number} delta - months to add; negative goes back
 * @returns {string} 'YYYY-MM-01'
 */
export const shiftMonths = (month, delta) => {
 const total = monthIndex(month) + delta;
 const year = Math.floor(total / 12);
 const index = total % 12;
 return `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}-01`;
};

/**
 * The last calendar day of a month, as text.
 *
 * Built and read entirely in UTC: day 0 of the following month is the last day
 * of this one, so no local getter can shift the day.
 *
 * @param {string} month - 'YYYY-MM-01'
 * @returns {string} 'YYYY-MM-DD'
 */
export const monthEndDate = (month) => {
 const [year, index] = month.split('-').map(Number);
 return new Date(Date.UTC(year, index, 0)).toISOString().split('T')[0];
};

// Six points: three is too short to read a direction from, and twelve is sized for
// a statistical stability a visual series does not need.
export const TREND_MONTHS = 6;

// Thirteen points: the reference month plus the twelve before it as baseline, so the month under study
// never enters its own baseline. Every reader takes its bounds from one window.
export const ANALYSIS_MONTHS = 13;

/**
 * The months a module export's detail rows cover: ANALYSIS_MONTHS ending at the
 * month on screen (the span makeReportingWindow derives as analysisStart), so every
 * export takes that depth from one definition.
 *
 * @param {string} referenceMonth - 'YYYY-MM-01', the month the summary reports
 * @returns {{from: string, to: string}} both as 'YYYY-MM-01', inclusive
 */
export const detailWindowFor = (referenceMonth) => ({
 from: shiftMonths(referenceMonth, -(ANALYSIS_MONTHS - 1)),
 to: referenceMonth,
});

// The window every domain calculator reads, derived once so none disagrees on series reach or delta month.
// periodEnd is the reference date in a running month, since the month end would claim days not yet happened;
// it is clamped to the served month, so clock skew or a midnight request never reports a date outside it.
export const makeReportingWindow = (referenceMonth, currentMonth, today) => {
 if (!currentMonth || !today) {
  throw new Error(
   `makeReportingWindow needs the owner's current month and day, received: ${currentMonth}, ${today}`,
  );
 }

 const monthEnd = monthEndDate(referenceMonth);
 const isCurrentMonth = referenceMonth === currentMonth;

 return Object.freeze({
  referenceMonth,
  // Carried out because it is the ceiling resolveWindowOr422 raises its 422
  // against; a client that cannot read it finds the bound only by being refused.
  currentMonth,
  priorMonth: shiftMonths(referenceMonth, -1),
  trendStart: shiftMonths(referenceMonth, -(TREND_MONTHS - 1)),
  analysisStart: shiftMonths(referenceMonth, -(ANALYSIS_MONTHS - 1)),
  periodStart: referenceMonth,
  periodEnd: isCurrentMonth && today < monthEnd ? today : monthEnd,
  isCurrentMonth,
 });
};

// The part of the window a response publishes; trend bounds stay out, each series point carries its month.
// currentMonth is published because isCurrentMonth does not say which month the ceiling is, and a month
// control must not compute it from the browser clock.
export const servedWindow = ({
 referenceMonth,
 currentMonth,
 periodStart,
 periodEnd,
 isCurrentMonth,
}) =>
 Object.freeze({ referenceMonth, currentMonth, periodStart, periodEnd, isCurrentMonth });
