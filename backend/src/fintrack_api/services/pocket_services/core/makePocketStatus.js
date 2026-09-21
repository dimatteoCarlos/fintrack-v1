// The one place a board pocket row takes its final shape, so no screen computes a percentage twice.
// allocated is summed from the ledger (a pocket holds no money); target is NOT NULL with CHECK (> 0),
// so nothing branches on a missing goal.

import { toAmount, toRate, money } from '../../budget_services/core/money.js';
import {
 makePlanSchedule,
 daysBetween,
 DAYS_PER_MONTH,
} from './planSchedule.js';
import { makePocketLevel } from './pocketLevel.js';

const HUNDRED = 100;

// money.js lives under budget_services but is not budget-specific: it owns the
// app's scale and rounding mode, and importing it keeps one definition of "two decimals".

/**
 * Monthly commitment still needed to reach the goal by its date; zero once the
 * goal is covered, so a negative remainder never yields a monthly figure.
 */
const computeRequiredMonthly = (remaining, daysRemaining) => {
 if (remaining.lessThanOrEqualTo(0)) {
  return 0;
 }

 if (daysRemaining <= 0) {
  return null;
 }

 return toAmount(remaining.dividedBy(money(daysRemaining).dividedBy(DAYS_PER_MONTH)));
};

/**
 * Build one pocket row of the board.
 *
 * Nothing is clamped: the sign is the information (remaining = -100 means over-funded by 100).
 * The board's totals clamp per pocket before summing, in makeSummary.
 *
 * @param {object} row
 * @param {string|number} row.target - NUMERIC as text
 * @param {string|number} row.allocated - NUMERIC as text
 * @param {string} row.desiredDate - YYYY-MM-DD on the owner's calendar
 * @param {string} row.planStart - YYYY-MM-DD, the day the plan was made
 * @param {number} row.sourceCount - distinct accounts the pocket draws on
 * @param {string} row.currency - lowercase code
 * @param {string} [row.movedInMonth] - net of the selected month, NUMERIC as text
 * @param {string} [row.committedInMonth] - the month's positive rows
 * @param {string} [row.releasedInMonth] - the month's negative rows, as magnitude
 * @param {string} today - the evaluation date, YYYY-MM-DD on the owner's
 *   calendar: today for the current month, the month's last day otherwise
 * @returns {Readonly<object>}
 */
export function makePocketStatus(
 {
  pocketId,
  name,
  note,
  target,
  allocated,
  desiredDate,
  planStart,
  sourceCount,
  currency,
  movedInMonth,
  committedInMonth,
  releasedInMonth,
 },
 today,
) {
 if (!Number.isInteger(pocketId)) {
  throw new Error('PocketStatus: pocketId must be an integer');
 }

 if (typeof name !== 'string' || name.length === 0) {
  throw new Error('PocketStatus: name is required and must be a non-empty string');
 }

 if (typeof currency !== 'string' || currency !== currency.toLowerCase()) {
  throw new Error('PocketStatus: currency must be a lowercase code');
 }

 if (typeof today !== 'string' || today.length === 0) {
  throw new Error('PocketStatus: today is required and must be a YYYY-MM-DD label');
 }

 if (typeof planStart !== 'string' || planStart.length === 0) {
  throw new Error('PocketStatus: planStart is required and must be a YYYY-MM-DD label');
 }

 const targetAmount = money(target);
 const allocatedAmount = money(allocated);
 const remaining = targetAmount.minus(allocatedAmount);
 const daysRemaining = daysBetween(today, desiredDate);
 const requiredMonthly = computeRequiredMonthly(remaining, daysRemaining);

 // Derived from the same figures as requiredMonthly, so the level a screen paints
 // and the pace it prints cannot come from two different divisions.
 const schedule = makePlanSchedule(
  { targetAmount, allocatedAmount, planStart, desiredDate, daysRemaining },
  today,
 );

 const overdue = daysRemaining < 0 && allocatedAmount.lessThan(targetAmount);

 // Null, not zero, when no month was requested: the detail screen reads a pocket
 // over its whole life, and a zero would claim that nothing moved.
 const monthAmount = (value) =>
  value === undefined || value === null ? null : toAmount(money(value));

 return Object.freeze({
  pocketId,
  name,
  // Nullable column: a missing note is null, never '' (an empty string is a note
  // the user cleared).
  note: note ?? null,
  target: toAmount(targetAmount),
  allocated: toAmount(allocatedAmount),
  // Negative when over-funded; that is a fact, not an error.
  remaining: toAmount(remaining),
  progress: toRate(allocatedAmount.dividedBy(targetAmount).times(HUNDRED)),
  desiredDate,
  planStart,
  daysRemaining,
  // Null after the deadline: the whole remainder is not a per-month figure, so
  // the screen says the date passed and prints the remainder beside it.
  requiredMonthly,
  // planInstalment, scheduledByNow, aheadOfPlan and paceRatio; all null together
  // when the plan has no window.
  ...schedule,
  // Net moved in the selected month (what the tile prints) plus its two halves,
  // since a net of -180 states neither how much went in nor how much came out.
  movedInMonth: monthAmount(movedInMonth),
  committedInMonth: monthAmount(committedInMonth),
  releasedInMonth: monthAmount(releasedInMonth),
  funded: allocatedAmount.greaterThanOrEqualTo(targetAmount),
  overdue,
  // Decided here, never on the client; funded and overdue stay served for the
  // card's sentences, not for re-classifying. paceRatio picks the band and
  // aheadOfPlan stops a pocket short of its target reading Ahead when they disagree.
  level: makePocketLevel({
   targetAmount,
   allocatedAmount,
   overdue,
   paceRatio: schedule.paceRatio,
   aheadOfPlan: schedule.aheadOfPlan,
  }),
  sourceCount,
  currency,
 });
}
