// Read side of the budget module: turns repository rows (one per requested account, for a
// month resolved on the owner's calendar) into the response the frontend contract defines.
// Currency comes from the in-memory catalog, so no query is issued for it.

import {
 getCurrentMonth,
 getMonthlySeriesForAccounts,
 getMonthlyStatusForAccounts,
} from '../db/budgetTransactionRepository.js';
import { makeBudgetAccountStatus } from '../core/makeBudgetAccountStatus.js';
import { makeBudgetCategoryStatus } from '../core/makeBudgetCategoryStatus.js';
import { makeBudgetMonthStatus } from '../core/makeBudgetMonthStatus.js';
import { money, toAmount, toRate } from '../core/money.js';
import { getCurrencyCodeSync } from '../../../../utils/currencyLookup.js';

const HUNDRED = 100;

// Default window of the history screen and the cap on months per request; the cap bounds generate_series
// and the correlated lookup under it (accounts x months) to a size a chart can render.
const DEFAULT_SERIES_MONTHS = 12;
const MAX_SERIES_MONTHS = 60;

/**
 * Turn one repository row into a BudgetAccountStatus. With no allocation in force the budget is 0, so
 * remaining is negative and isOverBudget true; only the percentage needs the hasDenominator guard.
 */
const buildAccountStatus = (entry) => {
 const budgetAmount = money(entry.budgetAmount);
 const actualSpent = money(entry.actualSpent);
 const hasDenominator = !budgetAmount.isZero();

 return makeBudgetAccountStatus({
  accountId: entry.accountId,
  accountName: entry.accountName,
  categoryName: entry.categoryName,
  subcategory: entry.subcategory,
  nature: entry.nature,
  accountStartDate: entry.accountStartDate,
  currency: getCurrencyCodeSync(entry.currencyId),
  budgetAmount,
  nextMonthBudget: money(entry.nextMonthBudget),
  actualSpent,
  remainingBudget: budgetAmount.minus(actualSpent),
  executionPercentage: hasDenominator
   ? actualSpent.dividedBy(budgetAmount).times(HUNDRED)
   : null,
  isOverBudget: actualSpent.greaterThan(budgetAmount),
 });
};

/**
 * Turn one repository month into a BudgetMonthStatus, deriving the same figures as
 * buildAccountStatus with the same zero-budget behaviour.
 */
const buildMonthStatus = (entry) => {
 const budgetAmount = money(entry.budgetAmount);
 const actualSpent = money(entry.actualSpent);
 const hasDenominator = !budgetAmount.isZero();

 return makeBudgetMonthStatus({
  month: entry.month,
  budgetAmount,
  actualSpent,
  remainingBudget: budgetAmount.minus(actualSpent),
  executionPercentage: hasDenominator
   ? actualSpent.dividedBy(budgetAmount).times(HUNDRED)
   : null,
  isOverBudget: actualSpent.greaterThan(budgetAmount),
 });
};

// Month arithmetic on 'YYYY-MM-01' text, never through Date: such a string parses as UTC
// midnight and a local getter can read back the previous month. Integer months have no
// zone or daylight saving to lose.
const monthIndex = (month) => {
 const [year, index] = month.split('-').map(Number);
 return year * 12 + (index - 1);
};

const shiftMonths = (month, delta) => {
 const total = monthIndex(month) + delta;
 const year = Math.floor(total / 12);
 const index = total % 12;
 return `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}-01`;
};

const rangeError = (message) =>
 Object.assign(new Error(message), { status: 422 });

/**
 * The month a status request is about, and the one after it.
 * Undefined when no month was named: the repository then resolves both from one CURRENT_TIMESTAMP.
 * currentMonth is returned because the 422 check already queried it and the response states it.
 *
 * @param {string|undefined} requestedMonth - 'YYYY-MM-01', already coerced by the validator
 * @returns {Promise<object|undefined>} { month, nextMonth, currentMonth }, or undefined
 */
const resolveStatusMonths = async (pool, requestedMonth, timeZone) => {
 if (!requestedMonth) return undefined;

 const currentMonth = await getCurrentMonth(pool, timeZone);

 // V1 has no future to show: a later month has a budget and no spending, so it would
 // report the whole amount as remaining and read as an underspend.
 if (requestedMonth > currentMonth) {
  throw rangeError(
   `month (${requestedMonth}) must not be later than the current month (${currentMonth}).`,
  );
 }

 return {
  month: requestedMonth,
  nextMonth: shiftMonths(requestedMonth, 1),
  currentMonth,
 };
};

/**
 * Fill in the range the caller left open and reject the ones that cannot be answered.
 * 422, not 400: the request is well-formed; what fails is a relationship between values, or with today.
 * Both bounds are first-of-month text, so `<` and `>` compare chronologically without parsing a date.
 *
 * @param {object} requested - { from, to }, either or both undefined
 * @param {number} defaultMonths - span to use when `from` is omitted
 * @returns {Promise<object>} { from, to }, both resolved
 */
const resolveSeriesRange = async (pool, requested, timeZone, defaultMonths) => {
 const currentMonth = await getCurrentMonth(pool, timeZone);
 const to = requested.to ?? currentMonth;
 const from = requested.from ?? shiftMonths(to, -(defaultMonths - 1));

 if (from > to) {
  throw rangeError(`from (${from}) must not be later than to (${to}).`);
 }

 // V1 has no future to show: months past the current one have no spending, so they
 // would report the full budget as remaining and read as an underspend.
 if (to > currentMonth) {
  throw rangeError(`to (${to}) must not be later than the current month (${currentMonth}).`);
 }

 const span = monthIndex(to) - monthIndex(from) + 1;
 if (span > MAX_SERIES_MONTHS) {
  throw rangeError(
   `The range spans ${span} months; at most ${MAX_SERIES_MONTHS} may be requested.`,
  );
 }

 return { from, to };
};

/**
 * Aggregate a month series into the range figures Overview and Insights show.
 * The range percentage is SUM(actual) / SUM(budget), never an average of month percentages (which is wrong).
 * Totals sum the already-rounded month values so the header reconciles with the rows under it.
 */
const makeSeriesTotals = (months) => {
 const sums = months.reduce(
  (acc, m) => ({
   budgetAmount: acc.budgetAmount.plus(m.budgetAmount),
   actualSpent: acc.actualSpent.plus(m.actualSpent),
  }),
  { budgetAmount: money(0), actualSpent: money(0) },
 );

 return {
  budgetAmount: toAmount(sums.budgetAmount),
  actualSpent: toAmount(sums.actualSpent),
  remainingBudget: toAmount(sums.budgetAmount.minus(sums.actualSpent)),
  executionPercentage: sums.budgetAmount.isZero()
   ? null
   : toRate(sums.actualSpent.dividedBy(sums.budgetAmount).times(HUNDRED)),
  monthsOverBudget: months.filter((m) => m.isOverBudget).length,
  // Divided by every month in the range: spending happens whether or not an allocation
  // was in force, and a smaller denominator would overstate the average.
  averageMonthlySpend:
   months.length === 0 ? 0 : toAmount(sums.actualSpent.dividedBy(months.length)),
 };
};

const MIXED_CURRENCY_NOTICE =
 'Totals add amounts in more than one currency and are not converted.';

// Accounts of one category disagreeing about currency is a state V1 does not allow (one
// accounting currency per installation), so seeing it means the data is wrong; the
// response names the category.
const mixedCurrencyCategoryNotice = (categoryName) =>
 `Category "${categoryName}" holds accounts in more than one currency, which V1 does not support. Its totals are not reported; the account rows keep their own amounts.`;

/**
 * Fold the account statuses into one entry per category, over rows already in memory (no second query).
 * Amounts sum the rounded account rows so a group header reconciles with its rows.
 * Ordered by categoryName so no component sorts; names are lowercased by migration 013.
 */
const makeCategoryGroups = (accountsStatus) => {
 const groups = new Map();

 for (const row of accountsStatus) {
  if (!groups.has(row.categoryName)) {
   groups.set(row.categoryName, []);
  }
  groups.get(row.categoryName).push(row);
 }

 return [...groups.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([categoryName, rows]) => {
   const currencies = new Set(rows.map((r) => r.currency));
   const currency = currencies.size === 1 ? [...currencies][0] : null;

   if (currency === null) {
    return makeBudgetCategoryStatus({
     categoryName,
     currency: null,
     accountCount: rows.length,
    });
   }

   const sums = rows.reduce(
    (acc, r) => ({
     budgetAmount: acc.budgetAmount.plus(r.budgetAmount),
     actualSpent: acc.actualSpent.plus(r.actualSpent),
    }),
    { budgetAmount: money(0), actualSpent: money(0) },
   );

   return makeBudgetCategoryStatus({
    categoryName,
    currency,
    accountCount: rows.length,
    budgetAmount: sums.budgetAmount,
    actualSpent: sums.actualSpent,
    remainingBudget: sums.budgetAmount.minus(sums.actualSpent),
    executionPercentage: sums.budgetAmount.isZero()
     ? null
     : sums.actualSpent.dividedBy(sums.budgetAmount).times(HUNDRED),
    isOverBudget: sums.actualSpent.greaterThan(sums.budgetAmount),
   });
  });
};

/**
 * Aggregate account statuses into the Overview header figures, summed from the already-rounded rows.
 * The percentage is recomputed from the totals, not averaged: an average weights a budget of 10 like 10,000.
 * Currencies are never converted (USD + COP would be an invented 1:1 rate): a mixed set reports null totals.
 */
const makeTotals = (accountsStatus) => {
 const currencies = new Set(accountsStatus.map((r) => r.currency));
 const currency = currencies.size === 1 ? [...currencies][0] : null;

 if (accountsStatus.length > 0 && currency === null) {
  return {
   currency: null,
   budgetAmount: null,
   actualSpent: null,
   remainingBudget: null,
   executionPercentage: null,
  };
 }

 const sums = accountsStatus.reduce(
  (acc, r) => ({
   budgetAmount: acc.budgetAmount.plus(r.budgetAmount),
   actualSpent: acc.actualSpent.plus(r.actualSpent),
  }),
  { budgetAmount: money(0), actualSpent: money(0) },
 );

 return {
  currency,
  budgetAmount: toAmount(sums.budgetAmount),
  actualSpent: toAmount(sums.actualSpent),
  remainingBudget: toAmount(sums.budgetAmount.minus(sums.actualSpent)),
  executionPercentage: sums.budgetAmount.isZero()
   ? null
   : toRate(sums.actualSpent.dividedBy(sums.budgetAmount).times(HUNDRED)),
 };
};

// Every function takes a PostgreSQL pool as its first argument.
export const budgetCalculationService = {
 /**
  * The budget of several accounts for one month, plus the totals and the same rows folded by category.
  * One entry per requested account, budgeted or not. requestedMonth is optional and past-only (default: the
  * owner's current month). timeZone decides which month "now" is and which month each transaction falls in.
  */
 async getBudgetAccountsStatus(pool, accountIds, timeZone = 'UTC', requestedMonth) {
  const months = await resolveStatusMonths(pool, requestedMonth, timeZone);

  const { month, accounts } = await getMonthlyStatusForAccounts(
   pool,
   accountIds,
   timeZone,
   months,
  );

  const accountsStatus = accounts.map(buildAccountStatus);
  const categories = makeCategoryGroups(accountsStatus);
  const totals = makeTotals(accountsStatus);

  // notices is always a list and meta always an object: a singular field could carry only
  // the first notice, and callers iterate with no null check or shape change when a
  // second appears.
  const notices = [];
  if (accountsStatus.length > 0 && totals.currency === null) {
   notices.push(MIXED_CURRENCY_NOTICE);
  }
  for (const category of categories) {
   if (category.currency === null) {
    notices.push(mixedCurrencyCategoryNotice(category.categoryName));
   }
  }

  // Differs from referenceMonth whenever a past month was named; the client cannot compute the ceiling
  // itself: its clock is not the owner's calendar. No extra query in either branch.
  const currentMonth = months?.currentMonth ?? month;

  return {
   referenceMonth: month,
   accounts: accountsStatus,
   categories,
   totals,
   meta: { notices, currentMonth },
  };
 },

 /**
  * The month-by-month budget of ONE account over a range, plus the range totals.
  * Every month is present, even before the first allocation: carry-forward is applied in SQL. The range is
  * resolved here because its default upper bound is a query (the owner's current month), not a constant.
  */
 async getBudgetAccountSeries(pool, accountId, requestedRange, timeZone = 'UTC') {
  const { from, to } = await resolveSeriesRange(
   pool,
   requestedRange,
   timeZone,
   DEFAULT_SERIES_MONTHS,
  );

  const [account] = await getMonthlySeriesForAccounts(pool, [accountId], from, to, timeZone);

  // Ownership was checked upstream, so a missing account has no category_budget_accounts
  // row: a data inconsistency that an empty series would hide.
  if (!account) {
   throw new Error(`Account ${accountId} has no category_budget row.`);
  }

  const months = account.months.map(buildMonthStatus);

  return {
   accountId: account.accountId,
   accountName: account.accountName,
   // Stated once for the whole series; the months cannot disagree about it.
   currency: getCurrencyCodeSync(account.currencyId),
   from,
   to,
   months,
   totals: makeSeriesTotals(months),
  };
 },

 /**
  * The same series for SEVERAL accounts, flattened for the export; no single currency or range totals,
  * since accounts can span currencies (no FX in V1), so the CSV carries each line's own currency.
  * defaultMonths is a parameter: /export defaults to the current month, /series to twelve months.
  */
 async getBudgetAccountsSeries(pool, accountIds, requestedRange, timeZone = 'UTC', defaultMonths = 1) {
  const { from, to } = await resolveSeriesRange(pool, requestedRange, timeZone, defaultMonths);

  const accounts = await getMonthlySeriesForAccounts(pool, accountIds, from, to, timeZone);

  return {
   from,
   to,
   accounts: accounts.map((account) => ({
    accountId: account.accountId,
    accountName: account.accountName,
    subcategory: account.subcategory,
    currency: getCurrencyCodeSync(account.currencyId),
    months: account.months.map(buildMonthStatus),
   })),
  };
 },
};
