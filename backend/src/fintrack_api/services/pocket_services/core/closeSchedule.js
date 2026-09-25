// backend/src/fintrack_api/services/pocket_services/core/closeSchedule.js

// The plan's line read at a month's close, shared by the board and the detail
// so both state the same month-end figures for one pocket.

import { daysBetween, makePlanSchedule } from './planSchedule.js';
import { toAmount, money } from '../../budget_services/core/money.js';

/** Last day of the selected month, YYYY-MM-DD: day 0 of the following month, read in UTC.
 * @param {string} monthStart - YYYY-MM-01
 */
export const monthCloseDate = (monthStart) => {
 const year = Number(monthStart.slice(0, 4));
 const month = Number(monthStart.slice(5, 7));
 const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

 return `${monthStart.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
};

/** Last day of the month before the selected one, YYYY-MM-DD: where the month's share of a plan's line begins.
 * @param {string} monthStart - YYYY-MM-01
 */
export const previousCloseDate = (monthStart) => {
 const year = Number(monthStart.slice(0, 4));
 const month = Number(monthStart.slice(5, 7));

 return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
};

/** What a pocket's plan asks to be held by the month's close, from the rounded line so board totals reconcile.
 * @returns {object} scheduledByClose, aheadAtClose and scheduledInMonth, all null when the plan has no window
 */
export const makeCloseSchedule = (status, closeDate, priorCloseDate) => {
 const lineAt = (date) =>
  makePlanSchedule(
   {
    targetAmount: money(status.target),
    allocatedAmount: money(status.allocated),
    planStart: status.planStart,
    desiredDate: status.desiredDate,
    daysRemaining: daysBetween(date, status.desiredDate),
   },
   date,
  ).scheduledByNow;

 const scheduledByClose = lineAt(closeDate);

 if (scheduledByClose === null) {
  return { scheduledByClose: null, aheadAtClose: null, scheduledInMonth: null };
 }

 return {
  scheduledByClose,
  aheadAtClose: toAmount(money(status.allocated).minus(money(scheduledByClose))),
  scheduledInMonth: toAmount(
   money(scheduledByClose).minus(money(lineAt(priorCloseDate))),
  ),
 };
};
