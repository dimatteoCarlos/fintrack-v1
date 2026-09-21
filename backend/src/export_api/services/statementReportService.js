// The dataset the PDF draws from. No financial logic: figures come from the same services
// Overview and the pocket board call, re-run at full analysis where getOverviewPage does not
// republish byCounterparty, legsOverTime, categoryExecution and board.pockets.

import { statementService, priorDecemberOf } from './statementService.js';
import { overviewExpenseService } from '../../fintrack_api/services/overview_services/services/overviewExpenseService.js';
import { overviewIncomeService } from '../../fintrack_api/services/overview_services/services/overviewIncomeService.js';
import { overviewDebtService } from '../../fintrack_api/services/overview_services/services/overviewDebtService.js';
import { pocketBoardService } from '../../fintrack_api/services/pocket_services/services/pocketBoardService.js';
import {
 getAccountAllocations,
 getAccountIdentitiesById,
 getPocketSourceHoldings,
} from '../../fintrack_api/services/pocket_services/db/accountAllocationRepository.js';
import {
 getIncomeAccountIds,
 getExpenseAccountIds,
} from '../../fintrack_api/services/overview_services/db/overviewAccountRepository.js';
import {
 getMonthlyIncome,
 getMonthlyExpense,
} from '../../fintrack_api/services/overview_services/db/overviewMonthlyRepository.js';
import { getCategorySpendInRange } from '../../fintrack_api/services/budget_services/db/budgetTransactionRepository.js';
import { getAccountsAndBalances } from '../db/accountsAndBalancesRepository.js';
import { toAmount } from '../../fintrack_api/services/budget_services/core/money.js';

const CARD_ONLY = { page: 1, pageSize: 1, includeTransactionRows: false };
const CARD_FULL = { ...CARD_ONLY, analysis: 'full' };

const monthLabel = (yyyyMmDd) => {
 const [year, month] = yyyyMmDd.split('-');
 return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString('en-US', {
  month: 'short',
  timeZone: 'UTC',
 });
};

/**
 * Section 4's monthly table: every month of the reference year up to referenceMonth, as an
 * aggregate lead-in (months older than the trailing 6) plus up to 6 individual months. A
 * reference month in the year's first 6 months produces no aggregate.
 *
 * @param {object[]} incomeMonths - getMonthlyIncome's rows, Jan 1 through referenceMonth
 * @param {object[]} expenseMonths - getMonthlyExpense's rows, same range
 * @param {string} referenceMonth - 'YYYY-MM-01'
 * @returns {{aggregate: object|null, individual: object[]}}
 */
const buildMonthlyBreakdown = (incomeMonths, expenseMonths, referenceMonth) => {
 const year = referenceMonth.slice(0, 4);
 const byMonth = new Map();
 incomeMonths.forEach((row) => {
  byMonth.set(row.month, { income: toAmount(row.totalAmount), expense: 0 });
 });
 expenseMonths.forEach((row) => {
  const entry = byMonth.get(row.month) ?? { income: 0, expense: 0 };
  entry.expense = toAmount(row.totalAmount);
  byMonth.set(row.month, entry);
 });

 const months = [...byMonth.entries()]
  .filter(([month]) => month.startsWith(`${year}-`))
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([month, figures]) => ({
   month,
   label: monthLabel(month),
   income: figures.income,
   expense: figures.expense,
   netFlow: figures.income - figures.expense,
  }));

 const individualCount = Math.min(6, months.length);
 const individual = months.slice(months.length - individualCount);
 const aggregateMonths = months.slice(0, months.length - individualCount);

 const sum = (list, key) => list.reduce((total, entry) => total + entry[key], 0);
 const aggregate = aggregateMonths.length
  ? {
     label:
      aggregateMonths.length === 1
       ? aggregateMonths[0].label
       : `${aggregateMonths[0].label}–${aggregateMonths[aggregateMonths.length - 1].label}`,
     income: sum(aggregateMonths, 'income'),
     expense: sum(aggregateMonths, 'expense'),
     netFlow: sum(aggregateMonths, 'netFlow'),
    }
  : null;

 return { aggregate, individual };
};

/**
 * Section 3's "Change since Jan 1" column: a second read at the prior December close. An
 * account absent from it opened during the reference year; its row says so in words instead
 * of printing a change against a balance that never existed.
 *
 * @returns {Map<number, number>} accountId -> balance at the prior close
 */
const buildPriorBalanceByAccountId = (priorAccountsAndBalances) =>
 new Map(priorAccountsAndBalances.map((row) => [row.accountId, row.balance]));

/**
 * Feeds the pockets table's "Committed YTD" column via a second board read at the prior
 * close. A pocket absent from the prior board was opened during the reference year.
 *
 * @returns {Map<number, number>} pocketId -> allocated at the prior close
 */
const buildPriorAllocatedByPocketId = (priorBoard) =>
 new Map(priorBoard.pockets.map((pocket) => [pocket.pocketId, pocket.allocated]));

/**
 * Which accounts back each pocket, named as pocketDetailService names a soft-deleted or
 * otherwise non-live account: the live read first, getAccountIdentitiesById for the rest.
 *
 * @param {object[]} accountRows - getAccountAllocations's rows (live accounts)
 * @param {object[]} holdingRows - getPocketSourceHoldings's rows, every pocket
 * @param {object[]} identityRows - getAccountIdentitiesById's rows, for the ids
 *  accountRows could not name
 * @returns {Map<number, object[]>} pocketId -> [{ accountId, accountName, heldByThisPocket }]
 */
const groupSourcesByPocket = (accountRows, holdingRows, identityRows) => {
 const nameById = new Map([
  ...accountRows.map((row) => [row.accountId, row.accountName]),
  ...identityRows.map((row) => [row.accountId, row.accountName]),
 ]);

 const byPocket = new Map();
 for (const holding of holdingRows) {
  const list = byPocket.get(holding.pocketId) ?? [];
  list.push({
   accountId: holding.accountId,
   accountName: nameById.get(holding.accountId) ?? null,
   heldByThisPocket: toAmount(holding.heldByThisPocket),
  });
  byPocket.set(holding.pocketId, list);
 }
 for (const list of byPocket.values()) {
  list.sort((a, b) => b.heldByThisPocket - a.heldByThisPocket);
 }
 return byPocket;
};

/**
 * Everything the PDF statement draws on, for one user and one reference month.
 *
 * @param {{window: object}} request - the resolved reporting window
 * @param {string} timeZone - IANA zone of the account owner
 */
export async function getStatementReportData(pool, userId, { window }, timeZone = 'UTC') {
 const { referenceMonth } = window;
 const priorMonth = priorDecemberOf(referenceMonth);
 const yearStart = `${referenceMonth.slice(0, 4)}-01-01`;

 const [incomeAccountIds, expenseAccountIds] = await Promise.all([
  getIncomeAccountIds(pool, userId),
  getExpenseAccountIds(pool, userId),
 ]);

 const [
  { overview, executiveSummaryRows },
  expenseFull,
  incomeFull,
  debtFull,
  board,
  priorBoard,
  accountsAndBalances,
  priorAccountsAndBalances,
  accountRows,
  holdingRows,
  incomeMonths,
  expenseMonths,
  categoryYearToDate,
 ] = await Promise.all([
  statementService.getStatementCore(pool, userId, { window }, timeZone),
  // Second run of overviewPageService's own call, for the one field it drops:
  // categoryExecution (the donut). categories is not refetched: overview.charts.expenseCategories
  // is that array.
  overviewExpenseService.getExpenseDomainData(pool, userId, { window, ...CARD_ONLY }, timeZone),
  // Full level, for bySource (income by originating account): getIncomeBySource runs only
  // at that level and the page service never republishes it.
  overviewIncomeService.getIncomeDomainData(pool, userId, { window, ...CARD_FULL }, timeZone),
  // Full level, for byCounterparty and legsOverTime, which card level refuses on purpose.
  overviewDebtService.getDebtDomainData(pool, userId, { window, ...CARD_FULL }, timeZone),
  // Coverage and holdings are deliberately not month-bound (see pocketBoardService.getBoard);
  // allocated, target, remaining and progress are, at this reference month's close.
  pocketBoardService.getBoard(pool, userId, timeZone, referenceMonth),
  // Second board read at the prior close, for the "Committed YTD" column.
  pocketBoardService.getBoard(pool, userId, timeZone, priorMonth),
  getAccountsAndBalances(pool, userId, referenceMonth, timeZone),
  // Second read at the prior close, for the "Change since Jan 1" column.
  getAccountsAndBalances(pool, userId, priorMonth, timeZone),
  getAccountAllocations(pool, userId),
  getPocketSourceHoldings(pool, userId),
  // Monthly table series: Jan 1 of the reference year through referenceMonth,
  // gap-filled by the repository.
  getMonthlyIncome(pool, incomeAccountIds, yearStart, referenceMonth, timeZone),
  getMonthlyExpense(pool, expenseAccountIds, yearStart, referenceMonth, timeZone),
  // Year-to-date spend per category, grouped in SQL over the same Jan 1 to close window
  // as the two series above.
  getCategorySpendInRange(pool, userId, yearStart, referenceMonth, timeZone),
 ]);

 const knownAccountIds = new Set(accountRows.map((row) => row.accountId));
 const unresolvedIds = [...new Set(holdingRows.map((row) => row.accountId))].filter(
  (accountId) => !knownAccountIds.has(accountId),
 );
 const identityRows = unresolvedIds.length
  ? await getAccountIdentitiesById(pool, userId, unresolvedIds)
  : [];

 return {
  referenceMonth,
  executiveSummaryRows,
  hero: overview.hero,
  domainCards: overview.domainCards,
  financialGoals: overview.financialGoals,
  trend: overview.charts.trend,
  categories: overview.charts.expenseCategories,
  // One level under the categories: every budget account of the month ranked by spend,
  // taken from the same call as categoryExecution.
  subcategories: expenseFull.subcategories ?? [],
  // Income by originating account, ranked, with shares already taken against the card's
  // total; empty when the month received nothing.
  incomeBySource: incomeFull.analysis?.bySource ?? [],
  // Keyed by the same lowercase category_name the month's categories carry, so the PDF
  // matches rows without folding case.
  categoryYearToDate,
  categoryExecution: expenseFull.categoryExecution,
  debtAnalysis: debtFull.analysis,
  pocketBoard: board,
  priorAllocatedByPocketId: buildPriorAllocatedByPocketId(priorBoard),
  pocketSourcesByPocket: groupSourcesByPocket(accountRows, holdingRows, identityRows),
  accountsAndBalances,
  priorBalanceByAccountId: buildPriorBalanceByAccountId(priorAccountsAndBalances),
  monthlyBreakdown: buildMonthlyBreakdown(incomeMonths, expenseMonths, referenceMonth),
 };
}
