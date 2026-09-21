// Read queries for budget status and series; every function takes a pg pool first.
// Spend nets movement type 1 (expense) against type 6 (transfer from a category budget).
// Amounts come from pg's NUMERIC string via toAmount, never parseFloat (float loss).

import { toAmount } from '../core/money.js';
import {
 spentAmountSql,
 spentMovementTypeList,
} from '../../../../utils/fintrackUtils/transactionManagement/spentAmountSql.js';

// Current and next month on the owner's calendar, as text: a DATE crossing the driver
// becomes a node-local Date and can shift a day. One CURRENT_TIMESTAMP keeps both values
// from straddling midnight on a month's last day.
const MONTH_QUERY = `
  SELECT
    date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS month,
    (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE $1)
      + INTERVAL '1 month')::date::text AS next_month
`;

// Identity and currency per REQUESTED account. currency_id is COALESCEd (migration 011
// backfill may differ from user_accounts); INNER join: a missing row is a data error.
// No closed_at predicate, or a closed account's name would blank out in a past month.
const ACCOUNTS_QUERY = `
  SELECT
    ua.account_id,
    ua.account_name,
    cba.category_name,
    cba.subcategory,
    cnt.category_nature_type_name AS nature,
    COALESCE(cba.currency_id, ua.currency_id) AS currency_id,
    -- The registration day, raw as the getAccountController list queries ship it, so the
    -- client predicate that hides a category before its start day reads both payloads
    -- the same way; the server refuses such a movement either way.
    ua.account_start_date
  FROM user_accounts ua
  JOIN category_budget_accounts cba ON cba.account_id = ua.account_id
  LEFT JOIN category_nature_types cnt
    ON cnt.category_nature_type_id = cba.category_nature_type_id
  WHERE ua.account_id = ANY($1)
  ORDER BY cba.category_name, ua.account_name
`;

// The allocation in force at month $2 for N accounts: the last row at or before the month
// (DISTINCT ON applies the LIMIT per account). An account with no such row is absent, not
// zero; the caller resolves that to a budget of 0.
const ALLOCATION_QUERY = `
  SELECT DISTINCT ON (account_id)
    account_id,
    budget_amount
  FROM budget_monthly_allocations
  WHERE account_id = ANY($1)
    AND budget_month <= $2
  ORDER BY account_id, budget_month DESC
`;

// Spend is kept apart from allocations (a join would repeat it N times). Each local month
// bound gets one AT TIME ZONE to become an instant on the OWNER's calendar. ::timestamp,
// not ::date, is load-bearing: on a date AT TIME ZONE converts OUT to local time.
const SPENT_QUERY = `
  SELECT
    t.account_id,
    COALESCE(SUM(
      ${spentAmountSql('t')}
    ), 0) AS actual_spent
  FROM transactions t
  WHERE t.account_id = ANY($1)
    AND t.transaction_actual_date >= ($2::timestamp AT TIME ZONE $4)
    AND t.transaction_actual_date <  ($3::timestamp AT TIME ZONE $4)
    AND t.movement_type_id IN (${spentMovementTypeList()})
  GROUP BY t.account_id
`;

// Spend per CATEGORY over a month range, grouped in SQL. Upper bound is the first of the
// month after $3. No closed_at predicate: spend in March is not unspent by closing in June.
const CATEGORY_SPEND_IN_RANGE_QUERY = `
  SELECT
    cba.category_name,
    COALESCE(SUM(
      ${spentAmountSql('t')}
    ), 0) AS actual_spent
  FROM transactions t
  JOIN user_accounts ua ON ua.account_id = t.account_id
  JOIN category_budget_accounts cba ON cba.account_id = ua.account_id
  WHERE ua.user_id = $1
    AND t.transaction_actual_date >= ($2::timestamp AT TIME ZONE $4)
    AND t.transaction_actual_date <  (($3::date + INTERVAL '1 month') AT TIME ZONE $4)
    AND t.movement_type_id IN (${spentMovementTypeList()})
  GROUP BY cba.category_name
  ORDER BY cba.category_name
`;

/**
 * What each category spent from `fromMonth` through the end of `throughMonth`, on the
 * owner's calendar.
 * @param {string} fromMonth - inclusive lower bound, 'YYYY-MM-01'
 * @param {string} throughMonth - the last month to include, 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 */
export async function getCategorySpendInRange(pool, userId, fromMonth, throughMonth, timeZone = 'UTC') {
 const { rows } = await pool.query(CATEGORY_SPEND_IN_RANGE_QUERY, [
  userId,
  fromMonth,
  throughMonth,
  timeZone,
 ]);

 return rows.map((row) => ({
  categoryName: row.category_name,
  actualSpent: toAmount(row.actual_spent ?? 0),
 }));
}

// The current month and its successor from ONE CURRENT_TIMESTAMP evaluation; two reads
// of "now" could straddle midnight on a month's last day.
const resolveCurrentMonths = async (pool, timeZone) => {
 const { rows } = await pool.query(MONTH_QUERY, [timeZone]);
 return { month: rows[0].month, nextMonth: rows[0].next_month };
};

/**
 * The budget of a set of accounts for one month: ONE entry per requested account, so a
 * dropped account is not mistaken for an unbudgeted one. budgetAmount is always a number
 * (no allocation in force is 0); nextMonthBudget is the same one month later.
 * @param {object} [months] - { month, nextMonth } as 'YYYY-MM-01'; omitted resolves the current month
 * @returns {Promise<object>} { month, accounts: [...] }
 */
export async function getMonthlyStatusForAccounts(pool, accountIds, timeZone = 'UTC', months) {
 const { month, nextMonth } = months ?? (await resolveCurrentMonths(pool, timeZone));

 if (!accountIds || accountIds.length === 0) {
  return { month, accounts: [] };
 }

 const [accounts, current, next, spent] = await Promise.all([
  pool.query(ACCOUNTS_QUERY, [accountIds]),
  pool.query(ALLOCATION_QUERY, [accountIds, month]),
  pool.query(ALLOCATION_QUERY, [accountIds, nextMonth]),
  pool.query(SPENT_QUERY, [accountIds, month, nextMonth, timeZone]),
 ]);

 const amountsByAccount = (result) =>
  new Map(result.rows.map((row) => [row.account_id, toAmount(row.budget_amount)]));

 const currentByAccount = amountsByAccount(current);
 const nextByAccount = amountsByAccount(next);
 const spentByAccount = new Map(
  spent.rows.map((row) => [row.account_id, toAmount(row.actual_spent ?? 0)]),
 );

 return {
  month,
  accounts: accounts.rows.map((row) => ({
   accountId: row.account_id,
   accountName: row.account_name,
   categoryName: row.category_name,
   subcategory: row.subcategory ?? null,
   // A tag the row may lack, not a figure, so it stays null rather than defaulting.
   nature: row.nature ?? null,
   currencyId: row.currency_id,
   accountStartDate: row.account_start_date ?? null,
   // No allocation in force is an effective budget of 0, not a null callers must branch on.
   budgetAmount: currentByAccount.get(row.account_id) ?? 0,
   nextMonthBudget: nextByAccount.get(row.account_id) ?? 0,
   // No matching transaction means nothing was spent.
   actualSpent: spentByAccount.get(row.account_id) ?? 0,
  })),
 };
}

/**
 * The current month on the owner's calendar, as 'YYYY-MM-01'. Range endpoints need it as
 * the default upper bound and the ceiling for `to`; same query as the status path.
 */
export async function getCurrentMonth(pool, timeZone = 'UTC') {
 const { rows } = await pool.query(MONTH_QUERY, [timeZone]);
 return rows[0].month;
}

// One row per (account, month) with carry-forward; NULL before the first allocation keeps
// "never budgeted" distinct from zero. One query, not one per account: cost is accounts x
// months, bounded by the service's 60-month cap. Months are text as in MONTH_QUERY.
const SERIES_QUERY = `
  SELECT
    a.account_id,
    m.month::date::text AS budget_month,
    (SELECT alloc.budget_amount
       FROM budget_monthly_allocations alloc
      WHERE alloc.account_id = a.account_id
        AND alloc.budget_month <= m.month
      ORDER BY alloc.budget_month DESC
      LIMIT 1) AS budget_amount
  FROM unnest($1::int[]) AS a(account_id)
  CROSS JOIN generate_series($2::date, $3::date, INTERVAL '1 month') AS m(month)
  ORDER BY a.account_id, m.month
`;

// Spend per account and month on the OWNER's calendar; timezone rules as in SPENT_QUERY
// (bounds go local -> instant, date_trunc goes instant -> local date, one each).
// $3 is the inclusive LAST month; the window is half-open at the month after it.
const SPENT_BY_MONTH_QUERY = `
  SELECT
    t.account_id,
    date_trunc('month', t.transaction_actual_date AT TIME ZONE $4)::date::text AS budget_month,
    COALESCE(SUM(
      ${spentAmountSql('t')}
    ), 0) AS actual_spent
  FROM transactions t
  WHERE t.account_id = ANY($1)
    AND t.transaction_actual_date >= ($2::timestamp AT TIME ZONE $4)
    AND t.transaction_actual_date <  (($3::date + INTERVAL '1 month') AT TIME ZONE $4)
    AND t.movement_type_id IN (${spentMovementTypeList()})
  GROUP BY t.account_id, 2
`;

/**
 * The month-by-month budget of a set of accounts over a range: every month from `from` to
 * `to` inclusive with no gaps, so callers need not re-derive the carry-forward.
 * @param {string} from - first month of the range, as 'YYYY-MM-01'
 * @param {string} to - last month of the range, inclusive, as 'YYYY-MM-01'
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<object[]>} one entry per account, with its months
 */
export async function getMonthlySeriesForAccounts(pool, accountIds, from, to, timeZone = 'UTC') {
 if (!accountIds || accountIds.length === 0) {
  return [];
 }

 const [accounts, series, spent] = await Promise.all([
  pool.query(ACCOUNTS_QUERY, [accountIds]),
  pool.query(SERIES_QUERY, [accountIds, from, to]),
  pool.query(SPENT_BY_MONTH_QUERY, [accountIds, from, to, timeZone]),
 ]);

 const spentByAccount = new Map();
 for (const row of spent.rows) {
  if (!spentByAccount.has(row.account_id)) {
   spentByAccount.set(row.account_id, new Map());
  }
  spentByAccount.get(row.account_id).set(row.budget_month, toAmount(row.actual_spent ?? 0));
 }

 const monthsByAccount = new Map();
 for (const row of series.rows) {
  if (!monthsByAccount.has(row.account_id)) {
   monthsByAccount.set(row.account_id, []);
  }
  const spentInMonth = spentByAccount.get(row.account_id)?.get(row.budget_month) ?? 0;
  monthsByAccount.get(row.account_id).push({
   month: row.budget_month,
   // NULL: no allocation at or before this month, so an effective budget of 0.
   budgetAmount: row.budget_amount === null ? 0 : toAmount(row.budget_amount),
   actualSpent: spentInMonth,
  });
 }

 return accounts.rows.map((row) => ({
  accountId: row.account_id,
  accountName: row.account_name,
  subcategory: row.subcategory ?? null,
  currencyId: row.currency_id,
  months: monthsByAccount.get(row.account_id) ?? [],
 }));
}
