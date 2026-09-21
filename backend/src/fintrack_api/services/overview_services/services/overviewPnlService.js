// Realized P/L calculator behind GET /overview/pnl: movement_type_id 9 across every account the user owns,
// unlike the investment card's realized result (same movement, investment accounts only), on purpose.
// No trend is published; the six-month series is still fetched because the delta needs the prior month.

import {
 getPnlAccountIds,
 getBankAccountIds,
 getInvestmentAccountIds,
 getOldestAccountDate,
} from '../db/overviewAccountRepository.js';
import { getMonthlyPnl } from '../db/overviewMonthlyRepository.js';
import { getPnlTransactionsPage } from '../db/overviewTransactionRepository.js';
import {
 makeDomainCard,
 makePeriodDelta,
 priorPeriodNotices,
} from '../core/makeDomainCard.js';
import { makePnlAnalysis } from '../core/makePnlAnalysis.js';
import { wantsAnalysis } from '../core/analysisLevels.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';

export const overviewPnlService = {
 /**
  * Everything GET /overview/pnl returns for one month and one page. analysis widens only the monthly
  * statement: its series comes off the query the delta already runs, so no second statement can disagree.
  *
  * @param {string} userId - UUID from the token, never from the client body
  * @param {object} request - { window, page, pageSize, analysis }
  */
 async getPnlDomainData(
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

  // Read once and shared so figure and list are the same rows. The annulment-target exclusion lives in the
  // SQL so it holds for total, count and list alike. The wide account set selects the rows; the investment
  // and bank sets cut the shares the card publishes.
  const [accountIds, investmentAccountIds, bankAccountIds] = await Promise.all([
   getPnlAccountIds(pool, userId),
   getInvestmentAccountIds(pool, userId),
   getBankAccountIds(pool, userId),
  ]);

  const [months, oldestAccountDate, transactions] = await Promise.all([
   getMonthlyPnl(
    pool,
    accountIds,
    withAnalysis ? analysisStart : trendStart,
    referenceMonth,
    timeZone,
    investmentAccountIds,
    bankAccountIds,
   ),
   getOldestAccountDate(pool, userId, timeZone),
   getPnlTransactionsPage(pool, accountIds, referenceMonth, timeZone, {
    page,
    pageSize,
    includeRows: includeTransactionRows,
   }),
  ]);

  const { currentPoint, priorTotalAmount, delta, priorPeriodCoverage } = makePeriodDelta({
   months,
   referenceMonth,
   priorMonth,
   oldestAccountDate,
  });

  const card = makeDomainCard({
   domain: 'pnl',
   // Signed: negative is a real answer (a losing month), not an absent figure.
   totalAmount: currentPoint.totalAmount,
   transactionCount: currentPoint.transactionCount,
   priorTotalAmount,
   delta,
   priorPeriodCoverage,
   currency: ACCOUNTING_CURRENCY_CODE,
   window: {
    periodStart,
    periodEnd,
   },
   notices: priorPeriodNotices(priorPeriodCoverage),
   domainFields: {
    // Share of the month's realized result on investment accounts, so a reader can tell whether this card
    // (all accounts but the internal counterparty) and the investment card's realized result are the same
    // money. That one accumulates over history; this is a flow bounded by the reference month.
    realizedFromInvestment: currentPoint.investmentAmount,
    // Read, not derived as total minus the investment share, which would also include
    // debtor and pocket accounts under the name "bank". The two legs need not sum to
    // totalAmount; a gap (a P/L row on a debtor or pocket account) stays visible.
    realizedFromBank: currentPoint.bankAmount,
   },
  });

  return {
   card,
   transactions: {
    rows: transactions.rows,
    page,
    pageSize,
    totalRows: transactions.totalRows,
   },
   ...(withAnalysis
    ? {
       analysis: makePnlAnalysis({
        level: analysis,
        months,
        // Every term off the card, so the parts partition the published figure.
        totalAmount: card.totalAmount,
        realizedFromInvestment: card.realizedFromInvestment,
        realizedFromBank: card.realizedFromBank,
       }),
      }
    : {}),
  };
 },
};
