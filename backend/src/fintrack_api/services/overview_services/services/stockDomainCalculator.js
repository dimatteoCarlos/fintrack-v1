// The body of a stock domain (headline figure is a balance); debt is the only caller. Its delta is the same
// balance read at the end of two consecutive months. Extra card fields come through a reader callback, and
// transactionCount is the list's totalRows because a balance has no rows to count.

import { getOldestAccountDate } from '../db/overviewAccountRepository.js';
import { getMonthlyBalance } from '../db/overviewBalanceRepository.js';
import {
 makeDomainCard,
 makePeriodDelta,
 priorPeriodNotices,
} from '../core/makeDomainCard.js';
import { makeTrendSeries } from '../core/makeTrendSeries.js';
import { isFullAnalysis, wantsAnalysis } from '../core/analysisLevels.js';
import { TREND_MONTHS } from '../core/monthArithmetic.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';

/**
 * Everything a stock domain returns, for one month and one page.
 *
 * @param {string} userId - UUID from the token, never from the client body
 * @param {object} config - the values that separate one stock domain from the next
 * @param {boolean} config.publishesTrend - false for debt, which has no series
 * @param {Function} [config.getDomainFields] - the fields this domain adds to the
 *   base card, read at the same cut as the total; omitted by a domain that adds none
 * @param {Function} [config.getAnalysisRows] - the single statement the level-2
 *   section is built from, run at the full level only
 * @param {Function} [config.makeAnalysis] - the builder for that section; a reader
 *   and a builder rather than named fields, so the section's contents stay one
 *   domain's contract
 */
export async function readStockDomain(
 pool,
 userId,
 { window, page, pageSize, includeTransactionRows = true, analysis },
 timeZone,
 {
  domain,
  getAccountIds,
  getTransactionsPage,
  publishesTrend,
  getDomainFields,
  getAnalysisRows,
  makeAnalysis,
 },
) {
 const {
  referenceMonth,
  priorMonth,
  trendStart,
  analysisStart,
  periodStart,
  periodEnd,
 } = window;

 const withAnalysis = wantsAnalysis(analysis);

 // One lower bound for every monthly statement, so a ranking taken from the
 // per-account rows cannot disagree with the aggregate series it appears in.
 const monthlyFrom = withAnalysis ? analysisStart : trendStart;

 // Read once so the balance series and the list are built over the same accounts.
 const accountIds = await getAccountIds(pool, userId);

 const [months, oldestAccountDate, transactions, domainFields, analysisRows] =
  await Promise.all([
   getMonthlyBalance(pool, accountIds, monthlyFrom, referenceMonth, timeZone),
   getOldestAccountDate(pool, userId, timeZone),
   getTransactionsPage(pool, accountIds, referenceMonth, timeZone, {
    page,
    pageSize,
    includeRows: includeTransactionRows,
   }),
   // Same round trip as the total it must agree with. {} for a domain that adds
   // nothing, so the spread below needs no branch.
   getDomainFields
    ? getDomainFields(pool, accountIds, referenceMonth, timeZone)
    : {},
   // Full level only; undefined otherwise. The builder reads absent as "no
   // statement was run" and empty as "the owner has no counterparties".
   isFullAnalysis(analysis) && getAnalysisRows
    ? getAnalysisRows(pool, accountIds, monthlyFrom, referenceMonth, timeZone)
    : undefined,
  ]);

 // The last point of the series is the card's balance by construction, so the
 // card's total and the chart's last bar are the same read.
 const { currentPoint, priorTotalAmount, delta, priorPeriodCoverage } = makePeriodDelta({
  months,
  referenceMonth,
  priorMonth,
  oldestAccountDate,
 });

 const card = makeDomainCard({
  domain,
  // Signed and already netted by the ledger: a debtor balance is positive when the
  // user is owed and negative when the user owes (movementInputHandler.js), so it
  // is summed, never subtracted.
  totalAmount: currentPoint.totalAmount,
  transactionCount: transactions.totalRows,
  priorTotalAmount,
  delta,
  priorPeriodCoverage,
  domainFields,
  currency: ACCOUNTING_CURRENCY_CODE,
  window: {
   periodStart,
   periodEnd,
  },
  notices: priorPeriodNotices(priorPeriodCoverage),
 });

 return {
  card,
  transactions: {
   rows: transactions.rows,
   page,
   pageSize,
   totalRows: transactions.totalRows,
  },
  // Spread, not `trend: undefined`: the key must be absent for a domain with no series. Cut to
  // TREND_MONTHS so the chart is the same six points with or without an analysis.
  ...(publishesTrend ? { trend: makeTrendSeries(months, TREND_MONTHS) } : {}),
  ...(withAnalysis && makeAnalysis
   ? {
      analysis: makeAnalysis({
       level: analysis,
       balances: analysisRows,
       // The month axis of the series above, passed rather than rebuilt, so the
       // analysis and the per-account statement share one generate_series bound.
       months: months.map((entry) => entry.month),
       referenceMonth,
      }),
     }
   : {}),
 };
}
