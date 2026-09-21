// Bespoke InvestmentCard, not the shared domain card shape. No return, market value or
// unrealized gain exists (no valuation model), so those fields are absent, not null.
// Nothing here queries; it only derives the concentration and the ledger-balance delta.

// toRate for concentration: a ratio that never enters a sum is rounded by the
// ratio rule, not the money rule.
import { money, toAmount, toRate } from '../../budget_services/core/money.js';

// No investment account, so there is nothing to be concentrated in; not the same
// as a diversified portfolio.
export const NO_INVESTMENT_ACCOUNTS_NOTICE =
 'There is no investment account, so the concentration figure is not reported.';

// Accounts exist but hold nothing, so the ratio would divide by zero.
export const EMPTY_PORTFOLIO_NOTICE =
 'The investment accounts hold no balance, so the concentration figure is not reported.';

// Nothing beyond the opening ever funded the accounts; an invented figure would
// read as a recent contribution that never happened.
export const NO_CONTRIBUTIONS_NOTICE =
 'No contribution has been recorded beyond the account opening.';

// Raised when capitalContributed + realizedPnl + closureAdjustment != ledgerBalance, so a
// card whose figures fail to add up is not silent. Rare: closureAdjustment absorbs the
// reversal row of a deleted account; this covers movement types none of the terms name.
export const UNRECONCILED_BALANCE_NOTICE =
 'Contributed capital, realized P/L and closure adjustments do not add up to the ledger balance; some movement on these accounts is none of the three.';

/**
 * Build the frozen InvestmentCard.
 *
 * @param {object} figures
 * @param {number} figures.capitalContributed - never null: 0 is a new account
 * @param {number} figures.realizedPnl - never null: 0 is a real answer
 * @param {number} figures.closureAdjustment - never null, and NOT what the name
 *   suggests: it sums an account-closure movement type (no rows exist in practice)
 *   and movements whose description carries the annulment prefix, so it reports
 *   the annulment. 0 does not mean no account was deleted: a soft delete writes neither.
 * @param {number|null} figures.largestBalance - the biggest single balance, null with no accounts
 * @param {number|null} figures.priorLedgerBalance - the ledger balance at the close
 *   of the prior month (same statement, different bound), or null when the owner
 *   held no account through any part of it
 * @param {'complete'|'partial'|'none'} [figures.priorPeriodCoverage] - how much
 *   of the prior month the owner existed for, decided by priorPeriodCoverageOf
 *   in makeDomainCard.js. 'partial' still compares: a young baseline is a weaker
 *   comparison, not an absent one.
 * @param {number} figures.transactionCount - movements on these accounts in the
 *   reference month, the one field this card shares with the other five
 */
export const makeInvestmentCard = ({
 accountCount,
 capitalContributed,
 ledgerBalance,
 realizedPnl,
 closureAdjustment,
 largestBalance,
 priorLedgerBalance = null,
 priorPeriodCoverage = 'none',
 transactionCount,
 daysSinceLastContribution,
 currency,
 notices = [],
}) => {
 const cardNotices = [...notices];

 // Three cases, only one yields a number. With one account the ratio is 1, which
 // is correct: all the money is in one place.
 let concentration = null;
 if (accountCount === 0) {
  cardNotices.push(NO_INVESTMENT_ACCOUNTS_NOTICE);
 } else if (money(ledgerBalance).isZero() || largestBalance === null) {
  cardNotices.push(EMPTY_PORTFOLIO_NOTICE);
 } else {
  concentration = toRate(money(largestBalance).dividedBy(ledgerBalance));
 }

 if (daysSinceLastContribution === null && accountCount > 0) {
  cardNotices.push(NO_CONTRIBUTIONS_NOTICE);
 }

 // The card's one month-over-month comparison, on the ledger balance: the deltas
 // of the other three figures sum to this one, so publishing all four would repeat
 // one fact. Baseline and delta are null together, as on the shared cards.
 const isComparable = priorPeriodCoverage !== 'none' && priorLedgerBalance !== null;

 const ledgerBalanceDelta = isComparable
  ? toAmount(money(ledgerBalance).minus(priorLedgerBalance))
  : null;

 // Compared through money(), not floats, so a cent of float error cannot flag
 // consistent books as inconsistent.
 const reconciles = money(capitalContributed)
  .plus(realizedPnl)
  .plus(closureAdjustment)
  .equals(money(ledgerBalance));
 if (accountCount > 0 && !reconciles) {
  cardNotices.push(UNRECONCILED_BALANCE_NOTICE);
 }

 return Object.freeze({
  domain: 'investment',
  // Published because it decides two notices (no account vs empty accounts). Not bounded by
  // the month (no creation date is read), so on a past month it can disagree with the money.
  accountCount,
  // The only shared-card field kept: the page's transactionCountAll sums one count
  // per domain and no other domain counts investment movements.
  transactionCount,
  capitalContributed,
  ledgerBalance,
  realizedPnl,
  closureAdjustment,
  // After the four terms, not beside ledgerBalance, so the identity checked by
  // UNRECONCILED_BALANCE_NOTICE stays four adjacent lines. Baseline precedes delta,
  // as in makeDomainCard.
  priorLedgerBalance: isComparable ? priorLedgerBalance : null,
  ledgerBalanceDelta,
  // Published beside the delta it qualifies: with 'partial' the delta looks like
  // any other, and the client should not parse meta.notices wording to find out.
  priorPeriodCoverage,
  concentration,
  daysSinceLastContribution,
  currency,
  meta: Object.freeze({
   notices: Object.freeze(cardNotices),
   provenance: null,
  }),
 });
};
