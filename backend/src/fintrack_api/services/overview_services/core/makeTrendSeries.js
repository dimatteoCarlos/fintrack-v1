// The monthly series behind a domain card's chart, relabelled from the rows the
// card was built from so its last point and the card's totalAmount cannot disagree.

/**
 * Monthly rows to MonthlyTrendPoint[]. Month is 'YYYY-MM' (not a first-day date); empty
 * months stay as zeros so the line is not bent. points keeps the LAST n months: one fetch
 * serves both lengths, and the reference month is the last point of an ascending series.
 *
 * @param {Array<{month: string, totalAmount: number}>} months - ascending, no gaps
 * @param {number} [points] - how many trailing months to publish; all of them when omitted
 * @returns {Array<{month: string, value: number}>}
 */
export const makeTrendSeries = (months, points) =>
 (points === undefined ? months : months.slice(-points)).map((entry) => ({
  month: entry.month.slice(0, 7),
  value: entry.totalAmount,
 }));
