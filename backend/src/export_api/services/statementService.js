// Period Statement Executive Summary dataset (no writer or route): Month values are Overview's output
// unchanged; Year to date values are the change against the prior year's December 31 close, from a
// second call to the same repositories, never a second formula.

import { overviewPageService } from '../../fintrack_api/services/overview_services/services/overviewPageService.js';
import {
 getBankBalance,
 getFreeCash,
} from '../../fintrack_api/services/overview_services/db/overviewPageRepository.js';
import { getInvestmentFigures } from '../../fintrack_api/services/overview_services/db/overviewInvestmentRepository.js';
import {
 getDebtAccountIds,
 getInvestmentAccountIds,
} from '../../fintrack_api/services/overview_services/db/overviewAccountRepository.js';
import {
 getMonthlyBalance,
 getDebtDomainFields,
} from '../../fintrack_api/services/overview_services/db/overviewBalanceRepository.js';
import { pocketBoardService } from '../../fintrack_api/services/pocket_services/services/pocketBoardService.js';
import { makeHeroSection, NO_DEBT_LEGS_NOTICE } from '../../fintrack_api/services/overview_services/core/makeHeroSection.js';
import { makeYearToDateFlow } from '../../fintrack_api/services/overview_services/core/makeYearToDateFlow.js';
import { makeYearStartChange } from '../../fintrack_api/services/overview_services/core/makeYearStartChange.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../fintrack_api/config/fintrackConfig.js';

// The prior calendar year's December, against which every repository below is called a
// second time. Derived from the reference month's year, not from today, so a statement for
// a past month compares against that year's prior December.
export const priorDecemberOf = (referenceMonth) =>
 `${Number(referenceMonth.slice(0, 4)) - 1}-12-01`;

/**
 * The prior December 31 close: the same repositories called with the prior month, no new query.
 * makeHeroSection is reused for netWorth, liquidNetWorth, cashPosition and freeCash, so December
 * uses the same formula; incomeTotal and expenseTotal are 0 because those fields do not read them.
 *
 * @param {string} priorMonth - 'YYYY-12-01' of the prior calendar year
 */
const getPriorYearClose = async (pool, userId, priorMonth, timeZone) => {
 const [debtAccountIds, investmentAccountIds] = await Promise.all([
  getDebtAccountIds(pool, userId),
  getInvestmentAccountIds(pool, userId),
 ]);

 const [bankBalance, freeCash, investmentFigures, debtMonths, debtFields, board] =
  await Promise.all([
   getBankBalance(pool, userId, priorMonth, timeZone),
   getFreeCash(pool, userId, priorMonth, timeZone),
   getInvestmentFigures(pool, investmentAccountIds, timeZone, priorMonth),
   // The single point at priorMonth, from the repository stockDomainCalculator reads a series
   // from; never receivable minus payable, which is an audit identity, not the production formula.
   getMonthlyBalance(pool, debtAccountIds, priorMonth, priorMonth, timeZone),
   getDebtDomainFields(pool, debtAccountIds, priorMonth, timeZone),
   pocketBoardService.getBoard(pool, userId, timeZone, priorMonth),
  ]);

 const debtPosition = debtMonths[0]?.totalAmount ?? 0;

 const hero = makeHeroSection({
  bankBalance,
  freeCash,
  investmentBalance: investmentFigures.ledgerBalance,
  debtPosition,
  payable: debtFields.payable,
  incomeTotal: 0,
  expenseTotal: 0,
  currency: ACCOUNTING_CURRENCY_CODE,
 });

 return {
  hero,
  debtPosition,
  receivable: debtFields.receivable,
  payable: debtFields.payable,
  pocketsCommitted: board.summary.totalAllocated ?? 0,
  investmentBalance: investmentFigures.ledgerBalance,
 };
};

const makeRow = (metric, month, yearToDate, notices = []) =>
 Object.freeze({ metric, month, yearToDate, notices: Object.freeze([...notices]) });

/**
 * The Executive Summary rows, pure composition over two resolved reads: no query, so a test
 * can exercise it with plain objects and no pool.
 *
 * @param {object} overview - overviewPageService.getOverviewPage's result, for the reference month
 * @param {object} priorClose - getPriorYearClose's result, for the prior December 31
 * @returns {object[]} frozen { metric, month, yearToDate, notices }[]
 */
export const composeExecutiveSummaryRows = (overview, priorClose) => {
 const { hero, domainCards, monthlySnapshot } = overview;
 const priorHero = priorClose.hero;

 const incomeSnapshot = monthlySnapshot.find((entry) => entry.domain === 'income');
 const expenseSnapshot = monthlySnapshot.find((entry) => entry.domain === 'expense');

 const yearFlow = makeYearToDateFlow({
  incomeYearToDate: incomeSnapshot.yearToDate,
  expenseYearToDate: expenseSnapshot.yearToDate,
 });

 // null only when a close on either side did not resolve (an absent payable leg), the one
 // case makeYearStartChange does not cover; reuses makeHeroSection's notice for it.
 const liquidNetWorthYtd = makeYearStartChange(hero.liquidNetWorth, priorHero.liquidNetWorth);
 const liquidNetWorthNotices =
  hero.liquidNetWorth === null || priorHero.liquidNetWorth === null ? [NO_DEBT_LEGS_NOTICE] : [];

 return Object.freeze([
  makeRow('income', domainCards.income.totalAmount, incomeSnapshot.yearToDate),
  makeRow('expenses', domainCards.expense.totalAmount, expenseSnapshot.yearToDate),
  makeRow('netMonthlyFlow', hero.netMonthlyFlow, yearFlow.netYearToDateFlow),
  makeRow('savingsRate', hero.savingsRate, yearFlow.yearToDateSavingsRate, yearFlow.meta.notices),
  makeRow('netWorth', hero.netWorth, makeYearStartChange(hero.netWorth, priorHero.netWorth)),
  makeRow('liquidNetWorth', hero.liquidNetWorth, liquidNetWorthYtd, liquidNetWorthNotices),
  makeRow('cashPosition', hero.cashPosition, makeYearStartChange(hero.cashPosition, priorHero.cashPosition)),
  makeRow('freeCash', hero.freeCash, makeYearStartChange(hero.freeCash, priorHero.freeCash)),
  makeRow(
   'netDebtPosition',
   domainCards.debt.totalAmount,
   makeYearStartChange(domainCards.debt.totalAmount, priorClose.debtPosition),
  ),
  makeRow(
   'receivable',
   domainCards.debt.receivable,
   makeYearStartChange(domainCards.debt.receivable, priorClose.receivable),
  ),
  makeRow(
   'payable',
   domainCards.debt.payable,
   makeYearStartChange(domainCards.debt.payable, priorClose.payable),
  ),
  makeRow(
   'pocketsCommitted',
   domainCards.pocket.totalAmount,
   makeYearStartChange(domainCards.pocket.totalAmount, priorClose.pocketsCommitted),
  ),
  makeRow(
   'investments',
   domainCards.investment.ledgerBalance,
   makeYearStartChange(domainCards.investment.ledgerBalance, priorClose.investmentBalance),
  ),
 ]);
};

export const statementService = {
 /**
  * overviewPageService's full result for the reference month plus the Executive Summary rows
  * composed over it: one overview read serving the XLSX sheet (rows only) and the PDF (the
  * whole overview, for figures the summary does not carry, e.g. charts, financialGoals).
  *
  * @param {{window: object}} request - the resolved reporting window
  * @param {string} timeZone - IANA zone of the account owner
  * @returns {Promise<{overview: object, executiveSummaryRows: object[]}>}
  */
 async getStatementCore(pool, userId, { window }, timeZone = 'UTC') {
  const priorMonth = priorDecemberOf(window.referenceMonth);

  const [overview, priorClose] = await Promise.all([
   overviewPageService.getOverviewPage(pool, userId, { window }, timeZone),
   getPriorYearClose(pool, userId, priorMonth, timeZone),
  ]);

  return {
   overview,
   executiveSummaryRows: composeExecutiveSummaryRows(overview, priorClose),
  };
 },

 /**
  * The Executive Summary for one user and one reference month.
  *
  * @param {{window: object}} request - the resolved reporting window (makeReportingWindow's
  *  shape); only `referenceMonth` is read here
  * @param {string} timeZone - IANA zone of the account owner
  * @returns {Promise<object[]>} frozen Executive Summary rows
  */
 async getExecutiveSummary(pool, userId, { window }, timeZone = 'UTC') {
  const { executiveSummaryRows } = await statementService.getStatementCore(pool, userId, { window }, timeZone);
  return executiveSummaryRows;
 },
};
