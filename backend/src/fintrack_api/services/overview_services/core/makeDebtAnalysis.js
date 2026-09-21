// Level-2 Debt section. The derived level publishes nothing: the card's figure is a NET position, and a
// net series would hide both legs doubling. Both analyses come from ONE statement (closing balances per
// account per month), so the ranking's top debtor cannot disagree with the series' last point.

import { money, toAmount } from '../../budget_services/core/money.js';

// Shown when the owner has no debt in either direction. The list is absent, not empty: empty would
// mean debtors exist and all sit at zero, a settled book, which is a different fact.
export const NO_DEBT_NOTICE =
 'There is no debt in either direction, so it is not broken down by counterparty.';

// Shown at the derived level, where this domain publishes nothing: a bare section reads as a
// failure, so the sentence says the requested depth is the cause and names the level that answers.
export const ANALYSIS_NEEDS_FULL_NOTICE =
 'Both debt analyses need a statement of their own and are only served at the full analysis level.';

// The direction travels beside the amount because a row has one amount field and rows of opposite
// signs; the client should not derive "you owe" / "you're owed" from a number's sign.
export const OWED_TO_USER = 'receivable';
export const OWED_BY_USER = 'payable';
export const SETTLED = 'settled';

const directionOf = (balance) => {
 if (balance > 0) return OWED_TO_USER;
 if (balance < 0) return OWED_BY_USER;
 return SETTLED;
};

/**
 * Folds the per-account monthly balances into the two legs of each month.
 * Both legs are POSITIVE MAGNITUDES; an account at zero enters neither. A month with no debtor
 * reports 0 on both legs, since a missing month would bend the line between its neighbours.
 *
 * @param {Array<{month: string, accountId: number, accountName: string, balance: number}>} rows
 * @param {string[]} months - every month of the window, ascending, as 'YYYY-MM-01'
 * @returns {Array<{month: string, receivable: number, payable: number}>}
 */
const foldLegs = (rows, months) => {
 const legs = new Map(months.map((month) => [month, { receivable: money(0), payable: money(0) }]));

 rows.forEach((row) => {
  const entry = legs.get(row.month);
  // Cannot arrive from the statement, which generates its months from the same bounds; guarded
  // because the fold would otherwise throw on a shape change.
  if (!entry) return;

  if (row.balance > 0) {
   entry.receivable = entry.receivable.plus(row.balance);
  } else if (row.balance < 0) {
   entry.payable = entry.payable.plus(-row.balance);
  }
 });

 return months.map((month) => {
  const entry = legs.get(month);
  return {
   month: month.slice(0, 7),
   receivable: toAmount(entry.receivable),
   payable: toAmount(entry.payable),
  };
 });
};

/**
 * Builds the frozen debt analysis. byCounterparty is ordered by MAGNITUDE, not signed value, so the
 * biggest debt and credit both lead; the name breaks ties. A counterparty settled at zero stays in
 * the list (the card's settled count already reports it).
 *
 * @param {object} input
 * @param {string} input.level - the requested depth
 * @param {Array<{month: string, accountId: number, accountName: string, balance: number}>} [input.balances]
 * @param {string[]} [input.months] - every month of the window, ascending
 * @param {string} [input.referenceMonth] - which of those months the ranking is taken at
 * @returns {object} frozen analysis section
 */
export const makeDebtAnalysis = ({ level, balances, months, referenceMonth }) => {
 const notices = [];

 let byCounterparty;
 let legsOverTime;

 if (balances === undefined) {
  notices.push(ANALYSIS_NEEDS_FULL_NOTICE);
 } else if (balances.length === 0) {
  notices.push(NO_DEBT_NOTICE);
 } else {
  // filter() returns a copy, so the sort does not reorder the rows the legs are folded from.
  byCounterparty = balances
   .filter((row) => row.month === referenceMonth)
   .sort((a, b) => {
    const difference = Math.abs(b.balance) - Math.abs(a.balance);
    return difference !== 0 ? difference : a.accountName.localeCompare(b.accountName);
   })
   .map((row, index) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    balance: row.balance,
    direction: directionOf(row.balance),
    rank: index + 1,
   }));

  legsOverTime = foldLegs(balances, months);
 }

 return Object.freeze({
  domain: 'debt',
  level,
  ...(byCounterparty === undefined
   ? {}
   : { byCounterparty: Object.freeze(byCounterparty) }),
  ...(legsOverTime === undefined ? {} : { legsOverTime: Object.freeze(legsOverTime) }),
  meta: Object.freeze({ notices: Object.freeze(notices) }),
 });
};
