// DomainCardBase shared by the Income, Expense, Debt, Pocket and PnL cards; Investment's figures differ.

import { money, toAmount } from '../../budget_services/core/money.js';

// Shown when the owner had no prior month at all: the oldest account was opened during the reference
// month or later, so there is nothing earlier to compare against. The only case that withholds the figure.
export const NO_PRIOR_PERIOD_NOTICE =
 'There is no prior period to compare against, so no change is reported.';

// Shown when the prior month existed but the owner did not hold an account for all of it. The delta is
// still computed and this sentence travels with it: a partial baseline is a weaker comparison, not an
// absent one, and the reader decides how much weight it carries.
export const PARTIAL_PRIOR_PERIOD_NOTICE =
 'The oldest account was opened during the prior month, so the change is measured against a partial month.';

/**
 * The notice the coverage earns, as the array every card's notices list splices in. One function
 * rather than a ternary per call site, so five calculators cannot word the same rule differently.
 *
 * @param {'complete'|'partial'|'none'} coverage
 * @returns {string[]} empty for a complete prior month
 */
export const priorPeriodNotices = (coverage) => {
 if (coverage === 'complete') return [];
 if (coverage === 'partial') return [PARTIAL_PRIOR_PERIOD_NOTICE];

 return [NO_PRIOR_PERIOD_NOTICE];
};

/**
 * How much of the prior month this owner existed for (by account age, not by recorded transactions):
 * 'complete': an account predates it; 'partial': oldest opened in it; 'none': opened later or no account.
 * Dates compare as strings ('YYYY-MM-DD' vs 'YYYY-MM-01'), so no Date is built in a non-owner timezone.
 *
 * @param {string|null} oldestAccountDate - 'YYYY-MM-DD', or null with no accounts
 * @param {string} priorMonth - 'YYYY-MM-01'
 * @param {string} referenceMonth - 'YYYY-MM-01'
 * @returns {'complete'|'partial'|'none'}
 */
export const priorPeriodCoverageOf = (oldestAccountDate, priorMonth, referenceMonth) => {
 if (oldestAccountDate === null) return 'none';
 if (oldestAccountDate <= priorMonth) return 'complete';
 if (oldestAccountDate < referenceMonth) return 'partial';

 return 'none';
};

/**
 * The reference month read off the series, and its change against the month before it.
 * One call so the card's figure and the delta's baseline are the same read of the same row; two searches
 * could be pulled apart by a later edit.
 *
 * @param {object} input
 * @param {Array<{month: string, totalAmount: number, transactionCount: number}>} input.months
 * @param {string} input.referenceMonth - 'YYYY-MM-01', always present in months
 * @param {string} input.priorMonth - 'YYYY-MM-01'
 * @param {string|null} input.oldestAccountDate - 'YYYY-MM-DD', or null
 * @returns {{currentPoint: object, priorTotalAmount: number|null, delta: number|null, priorPeriodCoverage: string}}
 */
export const makePeriodDelta = ({ months, referenceMonth, priorMonth, oldestAccountDate }) => {
 const currentPoint = months.find((entry) => entry.month === referenceMonth);
 const priorPoint = months.find((entry) => entry.month === priorMonth);
 const priorPeriodCoverage =
  priorPeriodCoverageOf(oldestAccountDate, priorMonth, referenceMonth);

 // priorPoint is always inside the window, so the guard is on the calendar: a missing row is a series bug.
 // 'partial' computes the delta like 'complete'; only 'none' is null, and there the prior row is
 // generate_series' zero for a month the owner did not exist in.
 const isComparable = priorPeriodCoverage !== 'none' && Boolean(priorPoint);

 // The prior figure is published so clients need not invent a percentage denominator (a percentage is a
 // presentation decision). Same nullity as delta: a baseline with no change beside it is unreadable.
 const priorTotalAmount = isComparable ? priorPoint.totalAmount : null;

 const delta = isComparable
  ? toAmount(money(currentPoint.totalAmount).minus(priorPoint.totalAmount))
  : null;

 return { currentPoint, priorTotalAmount, delta, priorPeriodCoverage };
};

/**
 * Builds a frozen DomainCardBase, with whatever fields the domain adds to it.
 *
 * domainFields sits between delta and currency so the object reads in the order the contract
 * declares: the three shared figures, then the domain's own, then the envelope every card carries.
 *
 * @param {object} input
 * @param {string} input.domain - one of the six domains
 * @param {number} input.totalAmount - never null: 0 is real activity at zero
 * @param {number} input.transactionCount - the rows totalAmount is made of
 * @param {number|null} input.priorTotalAmount - the prior month's own figure, the
 *   denominator a percentage reading needs. Null exactly when delta is.
 * @param {number|null} input.delta - null only when no prior period exists at all
 * @param {'complete'|'partial'|'none'} [input.priorPeriodCoverage] - how much of
 *   the prior month the owner existed for. Defaults to 'complete', which is what
 *   a card that measures no delta should say rather than claiming a gap it never looked for.
 * @param {object} [input.domainFields] - the fields this domain adds to the base
 */
export const makeDomainCard = ({
 domain,
 totalAmount,
 transactionCount,
 priorTotalAmount = null,
 delta,
 priorPeriodCoverage = 'complete',
 currency,
 window,
 notices = [],
 domainFields = {},
}) => Object.freeze({
 domain,
 totalAmount,
 transactionCount,
 // Ordered as the baseline, then the change measured from it, then the baseline's coverage.
 priorTotalAmount,
 delta,
 // Published so the client need not parse the English of meta.notices: with 'partial' the delta
 // is a number like any other.
 priorPeriodCoverage,
 ...domainFields,
 currency,
 window,
 // Always an object holding an array, so callers need no null check and the shape survives a second
 // notice. provenance is null and reserved until the accounting and display currencies can diverge.
 meta: Object.freeze({
  notices: Object.freeze([...notices]),
  provenance: null,
 }),
});
