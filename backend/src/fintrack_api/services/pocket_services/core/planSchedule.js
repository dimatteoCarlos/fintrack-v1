// backend/src/fintrack_api/services/pocket_services/core/planSchedule.js

// The plan's own line: what a pocket should hold by a given date, and how far its needed pace drifted from its own.
// A division of stored values (target, deadline, plan start), not a projection; the achieved rate is in actualRate.js.
// Continuous in days, so short plans have a line, day-one instalments are not inflated and the 1st does not jump it.

import { toAmount, money } from '../../budget_services/core/money.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Mean Gregorian month in days: only the unit monthly figures are presented in
// (the stored plan is daily); a flat 30 would skew every monthly figure.
export const DAYS_PER_MONTH = 30.44;

/**
 * Whole days between two YYYY-MM-DD dates, parsed as UTC so a daylight-saving hour cannot skew the
 * count. Shared with makePocketStatus so the board and the card agree on days left.
 */
export const daysBetween = (fromDate, toDate) =>
 Math.round(
  (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) /
   MILLISECONDS_PER_DAY,
 );

/** The plan's line for one pocket at one evaluation date (YYYY-MM-DD, owner's calendar).
 * @returns {object} planInstalment, scheduledByNow, aheadOfPlan and paceRatio, each number|null
 */
export function makePlanSchedule(
 { targetAmount, allocatedAmount, planStart, desiredDate, daysRemaining },
 evaluationDate,
) {
 const planDays = daysBetween(planStart, desiredDate);

 // A plan with no duration (deadline on or before the day it was made) publishes
 // no line, so the pocket reads neither behind nor at risk and the card says the
 // plan has no window.
 if (planDays <= 0) {
  return Object.freeze({
   planInstalment: null,
   scheduledByNow: null,
   aheadOfPlan: null,
   paceRatio: null,
  });
 }

 const dailyRate = targetAmount.dividedBy(planDays);

 // Clamped at both ends: the upper bound stops a plan past its deadline from
 // owing more than its target; the lower keeps a board read at a month before the
 // plan existed from producing a negative line.
 const elapsedDays = Math.min(
  Math.max(daysBetween(planStart, evaluationDate), 0),
  planDays,
 );

 const scheduled = dailyRate.times(elapsedDays);

 // Signed: positive is committed beyond the line, negative is short of it. Served
 // once so no consumer derives the other half and disagrees.
 const aheadOfPlan = allocatedAmount.minus(scheduled);

 const remainder = targetAmount.minus(allocatedAmount);

 // Floored at one day: a deadline of today with a remainder left must not divide
 // by zero, since that is exactly the case the ratio exists to catch.
 const daysLeft = Math.max(daysRemaining, 1);

 return Object.freeze({
  // Per-month figure (the unit owners think in), derived from the same daily rate
  // as the line so the two cannot disagree.
  planInstalment: toAmount(dailyRate.times(DAYS_PER_MONTH)),
  scheduledByNow: toAmount(scheduled),
  aheadOfPlan: toAmount(aheadOfPlan),
  // Pace now required over the plan's pace (1 on plan, above 1 must accelerate); computed here so the
  // level and the printed pace share one division. Zero once covered, null past the deadline: a
  // level above the ratio decides those.
  paceRatio:
   daysRemaining < 0
    ? null
    : remainder.lessThanOrEqualTo(0)
     ? 0
     : remainder
        .dividedBy(money(daysLeft))
        .dividedBy(dailyRate)
        .toDecimalPlaces(2)
        .toNumber(),
 });
}
