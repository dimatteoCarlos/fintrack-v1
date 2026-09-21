// An operative date must fall in the back-dating window: a whole number of
// calendar months ending with the current one. Transactions enforce the same
// window off the same constant, so account creation adds no second, softer policy.

import { createError } from '../../errorHandling.js';
import {
 dayInZone,
 earliestDatableDay,
 isCalendarDate,
 todayInZone,
} from './resolveZonedWindow.js';
import { BACKDATING_WINDOW_MONTHS } from '../../../fintrack_api/config/fintrackConfig.js';

/**
 * The calendar day an account is opened on, in the owner's zone; today and any day the back-dating
 * window reaches are allowed. A JSON UTC instant is resolved in that zone, not sliced (23:30 in
 * Bogota is already tomorrow in UTC and would be refused as future).
 *
 * @param {string|Date|null|undefined} value - the request's opening date;
 *  absent means today
 * @param {string} timeZone - the owner's IANA zone
 * @returns {string} YYYY-MM-DD
 * @throws 400 when the value is not a date at all; 422 when it is a date
 *  outside the back-dating window
 */
export const resolveOpeningDay = (value, timeZone) => {
 const today = todayInZone(timeZone);
 const requested = typeof value === 'string' ? value.trim() : value;

 if (requested === undefined || requested === null || requested === '') {
  return today;
 }

 let openingDay;

 if (isCalendarDate(requested)) {
  openingDay = requested;
 } else {
  const instant = new Date(requested);

  if (Number.isNaN(instant.getTime())) {
   throw createError(
    400,
    'The opening date must be a calendar day, YYYY-MM-DD',
    {
     errorCode: 'INVALID_OPENING_DATE',
     details: { expectedFormat: 'YYYY-MM-DD' },
    },
   );
  }

  openingDay = dayInZone(instant, timeZone);
 }

 if (openingDay > today) {
  throw createError(
   422,
   `An account cannot be opened after today, ${today}`,
   {
    errorCode: 'OPENING_DATE_AFTER_TODAY',
    details: { openingDay, today },
   },
  );
 }

 const windowFloor = earliestDatableDay(today, BACKDATING_WINDOW_MONTHS);

 if (openingDay < windowFloor) {
  // errorCode and the currentMonthStart key keep their published names although
  // the window widened: NewAccount matches on them.
  throw createError(
   422,
   `An account cannot be opened before ${windowFloor}`,
   {
    errorCode: 'OPENING_DATE_BEFORE_CURRENT_MONTH',
    details: { openingDay, currentMonthStart: windowFloor },
   },
  );
 }

 return openingDay;
};

/**
 * The day to price an opening at, or null for the rate in force now.
 *
 * currencyAmountConversion has no timezone, so the caller routes: null takes the current path. An opening
 * dated today must, or it would be valued from a source that has not published today's close.
 *
 * @param {string} openingDay - YYYY-MM-DD, already validated
 * @param {string} timeZone - the owner's IANA zone
 */
export const rateDayForOpening = (openingDay, timeZone) =>
 openingDay < todayInZone(timeZone) ? openingDay : null;
