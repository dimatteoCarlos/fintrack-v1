// Expense calculator behind GET /overview/expense: four readings of one window in one round of queries.
// budgetCalculationService is called whole and its output read, not rebuilt: a second formula could drift,
// and reaching into its private helpers would open its frozen contract.

import { createError } from '../../../../utils/errorHandling.js';
import { budgetCalculationService } from '../../budget_services/services/budgetCalculationService.js';
import {
 getExpenseAccountIds,
 getOldestAccountDate,
} from '../db/overviewAccountRepository.js';
import { getMonthlyExpense } from '../db/overviewMonthlyRepository.js';
import { getExpenseTransactionsPage } from '../db/overviewTransactionRepository.js';
import {
 makePeriodDelta,
 priorPeriodNotices,
} from '../core/makeDomainCard.js';
import { makeExpenseCard, NO_BUDGET_NOTICE } from '../core/makeExpenseCard.js';
import { makeTrendSeries } from '../core/makeTrendSeries.js';
import { makeCategoryBreakdown } from '../core/makeCategoryBreakdown.js';
import {
 accountsInCategory,
 makeSubcategoryBreakdown,
} from '../core/makeSubcategoryBreakdown.js';
import { makeNatureSplit } from '../core/makeNatureSplit.js';
import { makeCategoryBudgetExecution } from '../core/makeCategoryBudgetExecution.js';
import { makeExpenseAnalysis } from '../core/makeExpenseAnalysis.js';
import { wantsAnalysis } from '../core/analysisLevels.js';
import { TREND_MONTHS } from '../core/monthArithmetic.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';

/**
 * The account ids one category holds, read off the budget status rows.
 * An unknown name is a 404, not an empty page, so "nothing happened here" differs from "there is no here".
 * Case is folded (lowercase is guaranteed only after migration 013); a null categoryName is skipped.
 */
const categoryAccountIds = (budgetStatus, categoryName) => {
 const wanted = categoryName.toLowerCase();

 const ids = budgetStatus.accounts
  .filter((account) => account.categoryName?.toLowerCase() === wanted)
  .map((account) => account.accountId);

 if (ids.length === 0) {
  throw createError(404, `No expense category named '${categoryName}'.`);
 }

 return ids;
};

export const overviewExpenseService = {
 /**
  * Everything GET /overview/expense returns, for one month and one page.
  * The window arrives resolved: its month ceiling depends on the owner's calendar, so it is checked once.
  * analysis adds no statement here at any level; only the series widens.
  *
  * @param {string} userId - UUID from the token, never from the client body
  * @param {object} request - { window, page, pageSize, analysis, category }
  */
 async getExpenseDomainData(
  pool,
  userId,
  { window, page, pageSize, includeTransactionRows = true, analysis, category },
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

  // The id set every figure is computed over, deleted categories included. Read once
  // and shared so categories[] and totalAmount cannot come from different sets.
  const accountIds = await getExpenseAccountIds(pool, userId);

  // Category membership is makeCategoryGroups' rule, read off the status rows, not a second query: so a
  // category-filtered request costs two round trips, an unfiltered one stays at one.
  const categoryStatus = category
   ? await budgetCalculationService.getBudgetAccountsStatus(
      pool,
      accountIds,
      timeZone,
      referenceMonth,
     )
   : null;

  // Only the list is narrowed to the category; the card, series and ranked breakdown
  // stay on the whole domain, since a level-3 screen shows one category's rows
  // under the month's totals.
  const listedAccountIds = category
   ? categoryAccountIds(categoryStatus, category)
   : accountIds;

  const [months, oldestAccountDate, transactions, budgetStatus] = await Promise.all([
   getMonthlyExpense(
    pool,
    accountIds,
    withAnalysis ? analysisStart : trendStart,
    referenceMonth,
    timeZone,
   ),
   getOldestAccountDate(pool, userId, timeZone),
   getExpenseTransactionsPage(pool, listedAccountIds, referenceMonth, timeZone, {
    page,
    pageSize,
    includeRows: includeTransactionRows,
   }),
   // Reuses the status read above when a category was named, so the call is not repeated.
   categoryStatus ??
    budgetCalculationService.getBudgetAccountsStatus(
     pool,
     accountIds,
     timeZone,
     referenceMonth,
    ),
  ]);

  // The reference month is the last point of the series the chart draws, so card and
  // chart cannot disagree. generate_series guarantees the row exists for an empty month.
  const { currentPoint, priorTotalAmount, delta, priorPeriodCoverage } = makePeriodDelta({
   months,
   referenceMonth,
   priorMonth,
   oldestAccountDate,
  });

  // "No budget in force" differs from "a budget of 0", but makeTotals sums to 0 in
  // both, so the distinction is read off the account rows.
  const hasBudgetInForce = budgetStatus.accounts.some((account) => account.budgetAmount > 0);
  const isMixedCurrency = budgetStatus.totals.budgetAmount === null;

  const notices = [...budgetStatus.meta.notices, ...priorPeriodNotices(priorPeriodCoverage)];
  // Skipped for mixed currencies: budgetCalculationService already raised a notice
  // for that absent figure, and two would read as two problems.
  if (!isMixedCurrency && !hasBudgetInForce) notices.push(NO_BUDGET_NOTICE);

  const card = makeExpenseCard({
   totalAmount: currentPoint.totalAmount,
   transactionCount: currentPoint.transactionCount,
   priorTotalAmount,
   delta,
   priorPeriodCoverage,
   budgetAmount: isMixedCurrency || !hasBudgetInForce ? null : budgetStatus.totals.budgetAmount,
   // Reported even without a budget, so real spending is not hidden behind a
   // missing budget decision.
   categorizedExpense: budgetStatus.totals.actualSpent,
   // The accounts' currency when they agree; otherwise the accounting currency the
   // amounts are stored in (no category account, or mixed currencies with a notice).
   currency: budgetStatus.totals.currency ?? ACCOUNTING_CURRENCY_CODE,
   window: {
    periodStart,
    periodEnd,
   },
   notices,
  });

  const categories = makeCategoryBreakdown(budgetStatus.categories);

  // The level under the categories costs no query: both blocks below fold
  // budgetStatus.accounts, scoped once so the ranking and the composition describe
  // the same population.
  const scopedAccounts = accountsInCategory(budgetStatus.accounts, category ?? null);

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
   // Whole because the Pareto's running total is only correct over the complete set.
   categories,
   // Whole for the same reason. Where the chart folds the tail into one bar is the
   // chart's decision, not the server's. Scoped to the named category, or to every
   // expense account of the month when none was named.
   subcategories: makeSubcategoryBreakdown(scopedAccounts),
   // The same scope, as a composition rather than a ranking.
   natureSplit: makeNatureSplit(scopedAccounts, category ?? null),
   // Categorized spending against the same categories' budget, off the running
   // figures above.
   categoryExecution: makeCategoryBudgetExecution(categories),
   ...(withAnalysis
    ? {
       analysis: makeExpenseAnalysis({
        level: analysis,
        months,
        // Both terms off the card, so the decomposition sums to the published figure.
        totalAmount: card.totalAmount,
        categorizedExpense: card.categorizedExpense,
       }),
      }
    : {}),
  };
 },
};
