// Income domain calculator behind GET /overview/income. No budget module: income has no
// budget counterpart. Its reversal nets like expense's, via incomeReversalSql.js.

import {
 getIncomeAccountIds,
 getOldestAccountDate,
} from '../db/overviewAccountRepository.js';
import {
 getIncomeBySource,
 getMonthlyIncome,
} from '../db/overviewMonthlyRepository.js';
import { getIncomeTransactionsPage } from '../db/overviewTransactionRepository.js';
import {
 makeDomainCard,
 makePeriodDelta,
 priorPeriodNotices,
} from '../core/makeDomainCard.js';
import { makeTrendSeries } from '../core/makeTrendSeries.js';
import { makeIncomeAnalysis } from '../core/makeIncomeAnalysis.js';
import { isFullAnalysis, wantsAnalysis } from '../core/analysisLevels.js';
import { TREND_MONTHS } from '../core/monthArithmetic.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';

export const overviewIncomeService = {
 /**
  * Everything GET /overview/income returns, for one month and one page. The window arrives
  * resolved (one calendar read per request). analysis selects the level-2 depth; the card's
  * six-point chart is the tail of the long monthly series, so the two cannot disagree.
  *
  * @param {string} userId - UUID from the token, never from the client body
  * @param {object} request - { window, page, pageSize, analysis }
  */
 async getIncomeDomainData(
  pool,
  userId,
  { window, page, pageSize, includeTransactionRows = true, analysis },
  timeZone = 'UTC',
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

  // Read once and shared so the list and the card are built over the same accounts.
  const accountIds = await getIncomeAccountIds(pool, userId);

  const [months, oldestAccountDate, transactions, sources] = await Promise.all([
   getMonthlyIncome(
    pool,
    accountIds,
    withAnalysis ? analysisStart : trendStart,
    referenceMonth,
    timeZone,
   ),
   getOldestAccountDate(pool, userId, timeZone),
   getIncomeTransactionsPage(pool, accountIds, referenceMonth, timeZone, {
    page,
    pageSize,
    includeRows: includeTransactionRows,
   }),
   // undefined, not an empty array, when the level did not ask: the builder reads
   // absent as "no statement was run" and empty as "the month received nothing".
   isFullAnalysis(analysis)
    ? getIncomeBySource(pool, accountIds, referenceMonth, timeZone)
    : undefined,
  ]);

  const { currentPoint, priorTotalAmount, delta, priorPeriodCoverage } = makePeriodDelta({
   months,
   referenceMonth,
   priorMonth,
   oldestAccountDate,
  });

  const card = makeDomainCard({
   domain: 'income',
   totalAmount: currentPoint.totalAmount,
   transactionCount: currentPoint.transactionCount,
   priorTotalAmount,
   delta,
   priorPeriodCoverage,
   // The installation's accounting currency, in which every amount is already
   // stored, so nothing is converted. If users.currency_id ever diverges from it,
   // conversion is a presentation concern over this figure.
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
   // Whole, never paginated. Cut to TREND_MONTHS so the chart is the same six
   // points with or without an analysis.
   trend: makeTrendSeries(months, TREND_MONTHS),
   ...(withAnalysis
    ? {
       analysis: makeIncomeAnalysis({
        level: analysis,
        months,
        // The card's figure, so shares are of what the card publishes, not of a second sum.
        totalAmount: card.totalAmount,
        sources,
       }),
      }
    : {}),
  };
 },
};
