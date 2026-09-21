// How the month's spending splits across the four nature tags. A composition, not a ranking: the
// point is comparing each share with last month's. The tag is read per account, not per category.

import { money, toAmount } from '../../budget_services/core/money.js';

// The catalog's seeded order, so every month lists the natures identically;
// 'other' stays third because re-sequencing would define a second order.
const NATURE_ORDER = Object.freeze(['must', 'need', 'other', 'want']);

// Same four decimals as rankBySpend's shares: a 0-1 ratio at two decimals is only
// 1% resolution.
const SHARE_SCALE = 4;

/**
 * All four rows are always published, zeros included: a vanishing row breaks month-to-month
 * comparison. An account with no tag is counted outside the four, not inside 'other', which is
 * a value somebody chose; folding a gap into it would report a decision never made.
 *
 * @param {object[]} accounts - BudgetAccountStatus rows in scope
 * @param {string|null} categoryName - the category the scope is narrowed to, or
 *   null for the whole expense domain
 * @returns {object} the four rows, their totals, and what carries no tag
 */
export const makeNatureSplit = (accounts, categoryName = null) => {
 const spentOf = (account) => account.actualSpent ?? 0;
 const budgetOf = (account) => account.budgetAmount ?? 0;

 const spentTotal = accounts.reduce((sum, account) => sum.plus(spentOf(account)), money(0));
 const budgetTotal = accounts.reduce((sum, account) => sum.plus(budgetOf(account)), money(0));

 const rows = NATURE_ORDER.map((nature) => {
  const held = accounts.filter((account) => account.nature === nature);
  const spent = held.reduce((sum, account) => sum.plus(spentOf(account)), money(0));
  const budget = held.reduce((sum, account) => sum.plus(budgetOf(account)), money(0));

  return {
   nature,
   accountCount: held.length,
   spent: toAmount(spent),
   budget: toAmount(budget),
   // Of the spending in scope (the whole domain or the one category), never of the
   // month when a category is open. 0 when nothing was spent in scope, since a
   // division by zero would be an invented number.
   share: spentTotal.isZero()
    ? 0
    : spent.dividedBy(spentTotal).toDecimalPlaces(SHARE_SCALE).toNumber(),
  };
 });

 const untagged = accounts.filter((account) => account.nature === null);

 return Object.freeze({
  // Null for the whole domain. The client labels the scope from here, not from its
  // own selection, so a stale selection cannot mislabel a figure.
  categoryName: categoryName ?? null,
  spentTotal: toAmount(spentTotal),
  budgetTotal: toAmount(budgetTotal),
  rows,
  untaggedCount: untagged.length,
  untaggedSpent: toAmount(untagged.reduce((sum, account) => sum.plus(spentOf(account)), money(0))),
  untaggedBudget: toAmount(
   untagged.reduce((sum, account) => sum.plus(budgetOf(account)), money(0)),
  ),
 });
};
