// The consolidated ALL card. It recalculates nothing: five of its six figures are copied from the
// domain cards and the hero, so a consolidated figure never disagrees with the card beside it.
// transactionCountAll is the only figure ALL owns, and it is a count rather than a financial formula.

/**
 * Builds the frozen AllCard. transactionCountAll is the SUM of the five domain counts, not a COUNT over
 * transactions: counting rows would double every two-legged movement (an expense writes a bank withdraw
 * and a category deposit). Transfers stay out: no Transfer domain counts, and Investment has no count.
 *
 * @param {object} input
 * @param {number} input.netWorth - HeroSection.netWorth, the same value
 * @param {number} input.totalIncomePeriod - IncomeCard.totalAmount
 * @param {number} input.totalExpensePeriod - ExpenseCard.totalAmount
 * @param {number} input.netDebtPosition - DebtCard.totalAmount
 * @param {number} input.totalPocketBalance - PocketCard.totalAmount
 * @param {number[]} input.domainCounts - the transactionCount of every card that has one
 */
export const makeAllCard = ({
 netWorth,
 totalIncomePeriod,
 totalExpensePeriod,
 netDebtPosition,
 totalPocketBalance,
 domainCounts,
 currency,
 window,
 notices = [],
}) => Object.freeze({
 domain: 'all',
 netWorth,
 totalIncomePeriod,
 totalExpensePeriod,
 netDebtPosition,
 totalPocketBalance,
 // Integer counts: plain addition, not money arithmetic, so no decimal helper.
 transactionCountAll: domainCounts.reduce((sum, count) => sum + count, 0),
 currency,
 window,
 meta: Object.freeze({
  notices: Object.freeze([...notices]),
  provenance: null,
 }),
});
