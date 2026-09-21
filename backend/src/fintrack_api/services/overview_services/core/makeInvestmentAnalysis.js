// The level-2 Investment section: reconciliation, balance by account and contribution history.
// No monthly series: an accumulation only rises and says less than its two endpoints.

import { money, toAmount, MINIMUM_AMOUNT } from '../../budget_services/core/money.js';
import { makeDistribution } from './makeDistribution.js';

// No investment account; both distributions are absent, not empty (empty would
// say the accounts exist and hold nothing).
export const NO_PORTFOLIO_NOTICE =
 'There is no investment account, so the portfolio is not broken down.';

// Nothing beyond the opening funded the accounts; an empty history and an absent one are different answers.
export const NO_CONTRIBUTION_HISTORY_NOTICE =
 'No contribution has been recorded beyond the account opening, so there is no history to list.';

/**
 * Build the frozen investment analysis; the three terms are copied from the card, never recomputed.
 * difference is signed (terms minus balance) and published only with tolerance, the smallest
 * amount the server can express, so a client's floating-point cent is not read as broken books.
 *
 * @param {object} input
 * @param {object} input.card - the frozen investment card, read for its terms
 * @param {Array<{accountId: number, accountName: string, balance: number}>} [input.balances]
 * @param {{rows: Array<object>, totalRows: number}} [input.contributions] - the
 *   funding events, newest first, and how many of them exist
 */
export const makeInvestmentAnalysis = ({ level, card, balances, contributions }) => {
 const notices = [];

 const difference = toAmount(
  money(card.capitalContributed)
   .plus(card.realizedPnl)
   .plus(card.closureAdjustment)
   .minus(card.ledgerBalance),
 );

 let balanceByAccount;
 if (balances !== undefined) {
  if (balances.length === 0) {
   notices.push(NO_PORTFOLIO_NOTICE);
  } else {
   // A zero-balance account stays in the distribution: opened and emptied differs
   // from never opened, and its share is 0, not an absence.
   balanceByAccount = makeDistribution(
    balances.map((account) => ({
     accountId: account.accountId,
     accountName: account.accountName,
     label: account.accountName,
     amount: account.balance,
    })),
    card.ledgerBalance,
   );
  }
 }

 let contributionHistory;
 if (contributions !== undefined) {
  if (contributions.rows.length === 0) {
   notices.push(NO_CONTRIBUTION_HISTORY_NOTICE);
  } else {
   // Published with totalRows because the rows are only the newest page of an
   // unbounded history; without it a page would read as the whole.
   contributionHistory = Object.freeze({
    rows: Object.freeze(contributions.rows),
    totalRows: contributions.totalRows,
   });
  }
 }

 return Object.freeze({
  domain: 'investment',
  level,
  reconciliation: Object.freeze({
   capitalContributed: card.capitalContributed,
   realizedPnl: card.realizedPnl,
   closureAdjustment: card.closureAdjustment,
   ledgerBalance: card.ledgerBalance,
   difference,
   tolerance: MINIMUM_AMOUNT,
  }),
  ...(balanceByAccount === undefined ? {} : { balanceByAccount: Object.freeze(balanceByAccount) }),
  ...(contributionHistory === undefined ? {} : { contributionHistory }),
  meta: Object.freeze({ notices: Object.freeze(notices) }),
 });
};
