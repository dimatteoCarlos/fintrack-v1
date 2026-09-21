// The hero figures, composed from the domain cards so hero and cards share one path to the same money.

import { money, toAmount, toRate } from '../../budget_services/core/money.js';

// No income recorded: the savings rate would divide by zero rather than be a
// rate of zero. Kept apart from the negative case, which is a different situation.
export const NO_INCOME_NOTICE =
 'No income was recorded this month, so the savings rate is not reported.';

// Refunds or reversals pushed the month's income below zero. A negative
// denominator inverts the sign, so a losing month would report a positive rate;
// the rate is withheld instead.
export const NEGATIVE_INCOME_NOTICE =
 'The recorded income for this month is negative, so the savings rate is not reported.';

// The debt card did not carry its payable leg. Treating it as 0 would publish a
// liquid net worth equal to the gross position and dropping the term would
// publish the same wrong figure, so the figure is withheld (null with a reason).
export const NO_DEBT_LEGS_NOTICE =
 'The debt position did not report what is owed, so liquid net worth is not reported.';

/**
 * The share of income kept: the rate form of netMonthlyFlow, 0-1 and never clamped (above 1 after a refund).
 * greaterThan, not isPositive(): Decimal signs zero positive, which would admit the division by zero.
 * Exported so makeYearToDateFlow.js applies the same denominator guard.
 *
 * @param {Decimal} netFlow - income minus expense, already computed
 * @returns {number|null} the rate, or null when income cannot be a denominator
 */
export const savingsRateOf = (income, netFlow) =>
 income.greaterThan(0) ? toRate(netFlow.dividedBy(income)) : null;

/**
 * Builds the frozen HeroSection with figures signed as the ledger signs them: a debtor balance is already
 * net, so netWorth adds it, and a negative net worth is a real answer, not an error to clamp.
 *
 * @param {object} input
 * @param {number} input.bankBalance - the only figure no card carries
 * @param {number} input.freeCash - the bank and cash balance less what the
 *   pockets have been promised, floored per account before the sum
 * @param {number} input.investmentBalance - InvestmentCard.ledgerBalance
 * @param {number} input.debtPosition - DebtCard.totalAmount
 * @param {number} input.payable - DebtCard.payable, a positive magnitude
 * @param {number} input.incomeTotal - IncomeCard.totalAmount
 * @param {number} input.expenseTotal - ExpenseCard.totalAmount
 */
export const makeHeroSection = ({
 bankBalance,
 freeCash,
 investmentBalance,
 debtPosition,
 payable,
 incomeTotal,
 expenseTotal,
 currency,
 notices = [],
}) => {
 const income = money(incomeTotal);
 // Computed once so the published amount and the rate's denominator cannot drift apart.
 const netFlow = income.minus(expenseTotal);
 const savingsRate = savingsRateOf(income, netFlow);

 // Composed from the stocks and the payable leg, not netWorth minus receivable, so netWorth - liquidNetWorth
 // == receivable stays a check that can fail. Number.isFinite guards undefined and NaN, which the decimal
 // library would take as figures.
 const liquidNetWorth = Number.isFinite(payable)
  ? toAmount(money(bankBalance).plus(investmentBalance).minus(payable))
  : null;

 const heroNotices = [...notices];
 if (savingsRate === null) {
  heroNotices.push(income.isZero() ? NO_INCOME_NOTICE : NEGATIVE_INCOME_NOTICE);
 }
 if (liquidNetWorth === null) {
  heroNotices.push(NO_DEBT_LEGS_NOTICE);
 }

 return Object.freeze({
  // Bank, investment and debt position count as real money. A pocket is not a
  // fourth: committing money to one moves nothing, so it is already inside
  // bankBalance and adding it would count it twice.
  netWorth: toAmount(
   money(bankBalance)
    .plus(investmentBalance)
    .plus(debtPosition),
  ),
  // The same holdings without the receivable leg, so it is what the owner
  // controls. Negative means debts outweigh everything liquid; null only when the
  // payable leg did not arrive.
  liquidNetWorth,
  // Spendable without selling a position or collecting a debt: the bank balance,
  // which covers bank and cash accounts alike. Pockets are never added or
  // subtracted, because a pocket constrains committing, not spending.
  cashPosition: toAmount(money(bankBalance)),
  // What the pockets have not promised, floored per account upstream: composing it from two totals
  // would let one account's surplus cover another's shortfall. Never null or negative.
  freeCash: toAmount(money(freeCash)),
  // Whether the month moved forward or back; negative is a real answer.
  netMonthlyFlow: toAmount(netFlow),
  // The same movement as a share of income. null when income cannot be a
  // denominator, never 0: a month with no income has no rate, and a printed 0%
  // would hide that.
  savingsRate,
  currency,
  meta: Object.freeze({
   notices: Object.freeze(heroNotices),
   provenance: null,
  }),
 });
};
