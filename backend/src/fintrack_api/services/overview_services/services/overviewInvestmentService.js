// Investment domain calculator behind GET /overview/investment. Every figure is read at the reference
// month, except the account count, which counts accounts existing now (not a notice: nothing to act on).
// No trend: the list holds every investment movement, and two histories for one account are worse.

import {
 getInvestmentAccountIds,
 getOldestAccountDate,
} from '../db/overviewAccountRepository.js';
import {
 getContributionHistory,
 getInvestmentBalanceByAccount,
 getInvestmentFigures,
} from '../db/overviewInvestmentRepository.js';
import { getInvestmentTransactionsPage } from '../db/overviewTransactionRepository.js';
import { makeInvestmentCard } from '../core/makeInvestmentCard.js';
import {
 priorPeriodCoverageOf,
 priorPeriodNotices,
} from '../core/makeDomainCard.js';
import { makeInvestmentAnalysis } from '../core/makeInvestmentAnalysis.js';
import { isFullAnalysis, wantsAnalysis } from '../core/analysisLevels.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';

// Cap on funding events per response. The history is deliberately not cut by date,
// so the newest events are served and the count beside them says what was left out.
const CONTRIBUTION_HISTORY_LIMIT = 50;

export const overviewInvestmentService = {
 /**
  * Everything GET /overview/investment returns, for one page.
  *
  * The derived analysis level costs no statement (the reconciliation compares the card's four
  * terms); only the full level reads the database again.
  *
  * @param {string} userId - UUID from the token, never from the client body
  * @param {object} request - { window, page, pageSize, includeTransactionRows, analysis }
  */
 async getInvestmentDomainData(
  pool,
  userId,
  { window, page, pageSize, includeTransactionRows = true, analysis },
  timeZone = 'UTC',
 ) {
  const { referenceMonth, priorMonth } = window;

  const accountIds = await getInvestmentAccountIds(pool, userId);

  const [
   figures,
   priorFigures,
   oldestAccountDate,
   transactions,
   balances,
   contributions,
  ] = await Promise.all([
   getInvestmentFigures(pool, accountIds, timeZone, referenceMonth),
   // The same statement at the prior month's bound is the whole comparison (figures accumulate to a
   // month's close, so makePeriodDelta does not apply); run unconditionally to avoid a second round trip.
   getInvestmentFigures(pool, accountIds, timeZone, priorMonth),
   // The owner's oldest account of any type, not the oldest investment account: the
   // guard says when the owner's records begin, as on the other five cards.
   getOldestAccountDate(pool, userId, timeZone),
   getInvestmentTransactionsPage(pool, accountIds, referenceMonth, timeZone, {
    page,
    pageSize,
    includeRows: includeTransactionRows,
   }),
   // Full level only, at the reference month like every figure on this card.
   isFullAnalysis(analysis)
    ? getInvestmentBalanceByAccount(pool, accountIds, timeZone, referenceMonth)
    : undefined,
   isFullAnalysis(analysis)
    ? getContributionHistory(
       pool,
       accountIds,
       timeZone,
       referenceMonth,
       CONTRIBUTION_HISTORY_LIMIT,
      )
    : undefined,
  ]);

  const priorPeriodCoverage = priorPeriodCoverageOf(
   oldestAccountDate,
   priorMonth,
   referenceMonth,
  );

  const card = makeInvestmentCard({
   accountCount: figures.accountCount,
   capitalContributed: figures.capitalContributed,
   ledgerBalance: figures.ledgerBalance,
   realizedPnl: figures.realizedPnl,
   closureAdjustment: figures.closureAdjustment,
   largestBalance: figures.largestBalance,
   priorLedgerBalance: priorFigures.ledgerBalance,
   priorPeriodCoverage,
   daysSinceLastContribution: figures.daysSinceLastContribution,
   // Off the same paging result as the rows; readTransactionsPage computes it even
   // when rows are suppressed.
   transactionCount: transactions.totalRows,
   currency: ACCOUNTING_CURRENCY_CODE,
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
   ...(wantsAnalysis(analysis)
    ? {
       analysis: makeInvestmentAnalysis({
        level: analysis,
        // The card itself, so the reconciliation compares the figures the card published.
        card,
        balances,
        contributions,
       }),
      }
    : {}),
  };
 },
};
