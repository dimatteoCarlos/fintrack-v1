// Calendar window of a dashboard query: YYYY-MM-DD bounds that the SQL converts with one AT TIME ZONE each.
// Half-open, up to the day after the end day, so the end day enters whole with no 23:59:59.999 sentinel.
// The lower bound needs `$s::timestamp`: a bare date picks the TIMESTAMPTZ overload and converts wrongly.

// The only calendar shape accepted from the query string. Anything else is
// rejected, not coerced: 2026-08-20T00:00:00.000Z casts to a date in the
// session's zone and would reintroduce the day-shift bug.
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_LOOKBACK_DAYS = 30;

// The calendar day an instant falls on in a zone; 'en-CA' formats as YYYY-MM-DD, whereas toISOString()
// names the UTC day, which is the previous one for part of every day west of Greenwich.
export const dayInZone = (instant, timeZone) =>
 new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
 }).format(new Date(instant));

// Today on the user's calendar, not the server's; timeZone is an IANA identifier.
export const todayInZone = (timeZone) => dayInZone(new Date(), timeZone);

/**
 * Day arithmetic on a naive calendar date. Date.UTC is safe because no zone is
 * involved: the input carries no time and the output is read back as the same
 * kind of label.
 *
 * @param {string} calendarDate - YYYY-MM-DD
 * @param {number} days - may be negative
 * @returns {string} YYYY-MM-DD
 */
const shiftDays = (calendarDate, days) => {
 const [year, month, day] = calendarDate.split('-').map(Number);

 return new Date(Date.UTC(year, month - 1, day + days))
  .toISOString()
  .slice(0, 10);
};

export const isCalendarDate = (value) =>
 typeof value === 'string' && CALENDAR_DATE.test(value);

// The first day of the oldest month the back-dating window reaches; windowMonths counts whole months
// including the current one (1 = this month) and is a parameter so this utility stays free of config.
// Naive month arithmetic: a negative month index rolls the year back, so January needs no special case.
export const earliestDatableDay = (today, windowMonths) => {
 const [year, month] = today.split('-').map(Number);

 // Clamped rather than trusted: a NaN reaching Date.UTC yields an Invalid Date
 // whose toISOString throws, and throwing on a bad count is worse than closing the
 // window to the current month.
 const months = Number.isFinite(windowMonths) ? Math.trunc(windowMonths) : 1;
 const monthsBack = Math.max(1, months) - 1;

 return new Date(Date.UTC(year, month - 1 - monthsBack, 1))
  .toISOString()
  .slice(0, 10);
};

/**
 * @param {object} params
 * @param {string} [params.start] - YYYY-MM-DD from the query string
 * @param {string} [params.end] - YYYY-MM-DD from the query string
 * @param {string} params.timeZone - the account owner's IANA zone
 * @param {number} [params.lookbackDays] - how many calendar days the default
 *   window spans, counting the end day itself
 * @returns {{ startDate: string, endDate: string, timeZone: string }}
 */
export function resolveZonedWindow({
 start,
 end,
 timeZone,
 lookbackDays = DEFAULT_LOOKBACK_DAYS,
}) {
 // getUserTimeZone already falls back to UTC and the assert_iana_timezone trigger
 // rejects a non-IANA value on write; this guards the remaining path, a caller
 // that passes nothing.
 let zone = timeZone || 'UTC';

 try {
  todayInZone(zone);
 } catch {
  zone = 'UTC';
 }

 // The end day anchors the window: a missing end defaults to today, and a missing
 // start is measured back from the end day, not from today.
 const endDate = isCalendarDate(end) ? end : todayInZone(zone);
 const startDate = isCalendarDate(start)
  ? start
  : shiftDays(endDate, -(lookbackDays - 1));

 return { startDate, endDate, timeZone: zone };
}
