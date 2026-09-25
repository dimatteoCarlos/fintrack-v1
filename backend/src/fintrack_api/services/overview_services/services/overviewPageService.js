// The Overview page, assembled from the six domain calculators; it computes no domain figure itself.
// Free cash is floored per account, so it cannot be composed from two totals: an overcommitted
// account would be covered by another. Only recentActivity loads transaction rows (calculators get counts).

import { overviewExpenseService } from './overviewExpenseService.js';
import { overviewIncomeService } from './overviewIncomeService.js';
import { overviewPnlService } from './overviewPnlService.js';
import { overviewDebtService } from './overviewDebtService.js';
import { overviewPocketService } from './overviewPocketService.js';
import { overviewInvestmentService } from './overviewInvestmentService.js';

import {
 getExpenseAccountIds,
 getIncomeAccountIds,
} from '../db/overviewAccountRepository.js';
import {
 getMonthlyExpense,
 getMonthlyIncome,
} from '../db/overviewMonthlyRepository.js';
import { getMonthlyAllocatedNet } from '../db/overviewPocketRepository.js';
import {
 getBankBalance,
 getFreeCash,
 getSavingGoals,
 getRecentActivity,
} from '../db/overviewPageRepository.js';

import { makeHeroSection } from '../core/makeHeroSection.js';
import { makeAllCard } from '../core/makeAllCard.js';
import { makeMonthlySnapshot } from '../core/makeMonthlySnapshot.js';
import { makeFinancialGoals } from '../core/makeFinancialGoals.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';

// Cards only. pageSize cannot be 0 (the validators reject it), but
// includeTransactionRows: false keeps the page statement from running, so the
// value never reaches a query.
const CARD_ONLY = { page: 1, pageSize: 1, includeTransactionRows: false };

export const overviewPageService = {
 /**
  * Everything GET /overview returns, for one month.
  *
  * @param {string} userId - UUID from the token, never from the client body
  * @param {object} request - { window }, already resolved by the controller
  */
 async getOverviewPage(pool, userId, { window }, timeZone = 'UTC') {
  const { referenceMonth, analysisStart, periodStart, periodEnd } = window;
  const cardRequest = { window, ...CARD_ONLY };

  const [
   expense,
   income,
   pnl,
   debt,
   pocket,
   investment,
   bankBalance,
   freeCash,
   goals,
   recentActivity,
   expenseAccountIds,
   incomeAccountIds,
  ] = await Promise.all([
   overviewExpenseService.getExpenseDomainData(pool, userId, cardRequest, timeZone),
   overviewIncomeService.getIncomeDomainData(pool, userId, cardRequest, timeZone),
   overviewPnlService.getPnlDomainData(pool, userId, cardRequest, timeZone),
   overviewDebtService.getDebtDomainData(pool, userId, cardRequest, timeZone),
   overviewPocketService.getPocketDomainData(pool, userId, cardRequest, timeZone),
   overviewInvestmentService.getInvestmentDomainData(pool, userId, cardRequest, timeZone),
   // The balance, free cash and saving goals are all read at the reference month;
   // leaving one unbound would put a figure from today beside one from a closed month.
   getBankBalance(pool, userId, referenceMonth, timeZone),
   // Same month and accounts as the balance above: the pair only means something
   // when both halves are the same balance.
   getFreeCash(pool, userId, referenceMonth, timeZone),
   getSavingGoals(pool, userId, referenceMonth, timeZone),
   getRecentActivity(pool, userId, timeZone),
   getExpenseAccountIds(pool, userId),
   getIncomeAccountIds(pool, userId),
  ]);

  // Thirteen months (reference month plus twelve, from analysisStart) for the snapshot averages,
  // fetched apart from the cards' six-month series; each last point matches its card's figure.
  const [expenseMonths, incomeMonths, pocketMonths] = await Promise.all([
   getMonthlyExpense(pool, expenseAccountIds, analysisStart, referenceMonth, timeZone),
   getMonthlyIncome(pool, incomeAccountIds, analysisStart, referenceMonth, timeZone),
   // Pocket's snapshot is a flow though its card is a stock: the widget entries must be one kind of
   // quantity. Read over the allocation ledger, scoped by user (a pocket is a plan, not an account).
   getMonthlyAllocatedNet(pool, userId, analysisStart, referenceMonth, timeZone),
  ]);

  const hero = makeHeroSection({
   bankBalance,
   freeCash,
   investmentBalance: investment.card.ledgerBalance,
   debtPosition: debt.card.totalAmount,
   // The payable leg, not the net: liquid net worth subtracts what is owed and
   // leaves out what is owed to the user, which the net position cannot express.
   payable: debt.card.payable,
   incomeTotal: income.card.totalAmount,
   expenseTotal: expense.card.totalAmount,
   currency: ACCOUNTING_CURRENCY_CODE,
  });

  // Taken from the resolved window: it ends at the reference date, so a period
  // rebuilt from the month would give a running month two ends in one payload.
  const periodWindow = { periodStart, periodEnd };

  return {
   hero,
   all: makeAllCard({
    // The hero's value, not a second addition.
    netWorth: hero.netWorth,
    totalIncomePeriod: income.card.totalAmount,
    totalExpensePeriod: expense.card.totalAmount,
    netDebtPosition: debt.card.totalAmount,
    totalPocketBalance: pocket.card.totalAmount,
    // All six domains count: no other domain counts investment movements (expense
    // counts types 1 and 6 on category_budget accounts, income income, debt debt,
    // pocket allocations, pnl pnl).
    domainCounts: [
     income.card.transactionCount,
     expense.card.transactionCount,
     investment.card.transactionCount,
     debt.card.transactionCount,
     pocket.card.transactionCount,
     pnl.card.transactionCount,
    ],
    currency: ACCOUNTING_CURRENCY_CODE,
    window: periodWindow,
   }),
   domainCards: {
    income: income.card,
    expense: expense.card,
    investment: investment.card,
    debt: debt.card,
    pocket: pocket.card,
    pnl: pnl.card,
   },
   // The widget is defined for these three domains only.
   monthlySnapshot: [
    makeMonthlySnapshot({ domain: 'income', months: incomeMonths, currency: ACCOUNTING_CURRENCY_CODE }),
    makeMonthlySnapshot({ domain: 'expense', months: expenseMonths, currency: ACCOUNTING_CURRENCY_CODE }),
    makeMonthlySnapshot({ domain: 'pocket', months: pocketMonths, currency: ACCOUNTING_CURRENCY_CODE }),
   ],
   financialGoals: makeFinancialGoals({
    goals,
    currency: ACCOUNTING_CURRENCY_CODE,
    progress: pocket.card.progress,
    levels: pocket.pocketLevels,
   }),
   // Not an aggregation and not bounded by the month: the teaser answers what
   // happened last, which is why it carries no currency of its own — every row
   // already has one (D7).
   recentActivity: { transactions: recentActivity },

   // Calculator series published verbatim so a chart matches its figure. trend has keys only for
   // domains with a series: absent means no series, empty would mean a blank one.
   charts: {
    trend: {
     income: income.trend,
     expense: expense.trend,
     pocket: pocket.trend,
    },
    expenseCategories: expense.categories,
   },
  };
 },
};
