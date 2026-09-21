// The Overview's saving-goals aggregate across every pocket. A target of 0.00 is excluded: an
// absent target is coerced to zero on write, and counting it would read as a goal already reached.

import { money, toAmount } from '../../budget_services/core/money.js';

// No pocket carries a real target, so target and remaining have nothing to report.
export const NO_GOAL_SET_NOTICE =
 'No saving goal has a target set, so the target and remaining figures are not reported.';

// Some pockets have a target and others do not, so target and remaining cover a
// subset of the pockets the balance counts.
export const PARTIAL_GOAL_COVERAGE_NOTICE =
 'Some pockets have no target, so the target and remaining figures cover fewer pockets than the balance does.';

/**
 * goalsTotalBalance counts every pocket; the other two figures count only pockets with a real
 * target (a notice announces the gap). goalsTotalRemaining clamps each goal's gap to zero before
 * summing, so an exceeded goal never offsets another's shortfall; the pocket board does the same.
 *
 * @param {object} input
 * @param {Array<{balance: number, target: number|null}>} input.goals - one entry per pocket
 */
export const makeFinancialGoals = ({ goals, currency, notices = [] }) => {
 // null and 0 are both "no target".
 const withTarget = goals.filter((goal) => goal.target !== null && goal.target !== 0);

 const totalBalance = goals.reduce((sum, goal) => sum.plus(goal.balance), money(0));

 const sectionNotices = [...notices];
 if (withTarget.length === 0) {
  sectionNotices.push(NO_GOAL_SET_NOTICE);
 } else if (withTarget.length < goals.length) {
  sectionNotices.push(PARTIAL_GOAL_COVERAGE_NOTICE);
 }

 const totalTarget = withTarget.length === 0
  ? null
  : withTarget.reduce((sum, goal) => sum.plus(goal.target), money(0));

 return Object.freeze({
  goalsTotalBalance: toAmount(totalBalance),
  // null, never 0: an absent target is not a target of zero, and the frontend
  // renders a dash for it.
  goalsTotalTarget: totalTarget === null ? null : toAmount(totalTarget),
  // Uses only pockets that have a target: a targetless pocket's savings would
  // report progress toward a goal it was never aimed at. Each gap is clamped
  // before summing, so a goal exceeded by $100 cannot cancel another $100 short.
  goalsTotalRemaining: totalTarget === null
   ? null
   : toAmount(withTarget.reduce((sum, goal) => {
    const gap = money(goal.target).minus(goal.balance);
    return gap.isPositive() ? sum.plus(gap) : sum;
   }, money(0))),
  currency,
  meta: Object.freeze({
   notices: Object.freeze(sectionNotices),
   provenance: null,
  }),
 });
};
