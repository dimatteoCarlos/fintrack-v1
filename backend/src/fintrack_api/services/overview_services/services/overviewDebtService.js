// Debt calculator (GET /overview/debt): totalAmount is the net position from the signed balance series, so
// totalAmount = receivable - payable holds; no trend field. Level 2 omits the net series, since an
// unmoved net hides both legs doubling. Both analyses are per counterparty, full level only.

import {
 getDebtAccountIds,
} from '../db/overviewAccountRepository.js';
import {
 getDebtDomainFields,
 getMonthlyBalanceByAccount,
} from '../db/overviewBalanceRepository.js';
import { getDebtTransactionsPage } from '../db/overviewTransactionRepository.js';
import { makeDebtAnalysis } from '../core/makeDebtAnalysis.js';
import { readStockDomain } from './stockDomainCalculator.js';

const DEBT_DOMAIN = {
 domain: 'debt',
 getAccountIds: getDebtAccountIds,
 getTransactionsPage: getDebtTransactionsPage,
 publishesTrend: false,
 getDomainFields: getDebtDomainFields,
 // Per counterparty per month: the ranking at the reference month and the two legs
 // over the window fold one result set instead of two reads that must agree.
 getAnalysisRows: getMonthlyBalanceByAccount,
 makeAnalysis: makeDebtAnalysis,
};

export const overviewDebtService = {
 /**
  * Everything GET /overview/debt returns, for one month and one page.
  *
  * @param {string} userId - UUID from the token, never from the client body
  */
 async getDebtDomainData(pool, userId, request, timeZone = 'UTC') {
  return readStockDomain(pool, userId, request, timeZone, DEBT_DOMAIN);
 },
};
