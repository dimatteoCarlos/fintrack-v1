// The pocket's real pace: net committed (commits minus releases) over the calendar months the
// plan has lived, the current month included, so a plan made this month divides by one.

import { toAmount, money } from '../../budget_services/core/money.js';
import { DAYS_PER_MONTH } from './planSchedule.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const monthIndex = (day) => {
 const [year, monthNum] = day.split('-').map(Number);
 return year * 12 + (monthNum - 1);
};

const addDays = (day, days) => {
 const [year, monthNum, dayNum] = day.split('-').map(Number);
 const shifted = new Date(
  Date.UTC(year, monthNum - 1, dayNum) + Math.round(days) * MILLISECONDS_PER_DAY,
 );
 return shifted.toISOString().slice(0, 10);
};

/**
 * @param {{amount: string, allocationDate: string}[]} history - signed rows from getPocketHistory
 * @param {string} planStart - 'YYYY-MM-DD'
 * @param {string} today - 'YYYY-MM-DD' on the owner's calendar
 * @param {number} remaining - target minus allocated; may be negative
 * @returns {{actualRate: number|null, projectedCompletion: string|null}} projectedCompletion is
 *  null without a rate, a remainder or a positive pace: a flat pocket has no arrival date.
 */
export function makeActualRate(history, planStart, today, remaining) {
 const monthsLived = monthIndex(today) - monthIndex(planStart) + 1;

 if (monthsLived < 1) {
  return { actualRate: null, projectedCompletion: null };
 }

 const netCommitted = history.reduce(
  (total, row) => total.plus(money(row.amount)),
  money(0),
 );

 const actualRate = toAmount(netCommitted.dividedBy(monthsLived));

 if (remaining <= 0 || actualRate <= 0) {
  return { actualRate, projectedCompletion: null };
 }

 const monthsNeeded = money(remaining).dividedBy(actualRate).toNumber();
 const projectedCompletion = addDays(today, monthsNeeded * DAYS_PER_MONTH);

 return { actualRate, projectedCompletion };
}
