// Official BCV (Banco Central de Venezuela) bolivar rate, read from a community API that scrapes bcv.org.ve.
// Exists because the CDN of last resort recomputes a cross and sat below the BCV on 63 of 63 days
// (2026-06-01..2026-09-01, mean gap 0.54%), which undervalues back-dated bolivar movements.

// The endpoint returns a polling log (several rows per day), collapsed here to one per day; weekend rows
// stay, being the rate in force. The rate stays a string so no rounding precedes the ledger's precision.

import axios from 'axios';

import { BCV_RATE_SOURCE, OFFICIAL_BCV_CURRENCY } from '../core/fxConfig.js';

// Trailing slashes are stripped so the paths below compose the same whatever the environment holds.
// The default is the live successor of the retired host; BCV_API_BASE_URL can point at a self-hosted copy.
const API_BASE_URL = (
 process.env.BCV_API_BASE_URL || 'https://dolar-vzla.rafnixg.dev'
).replace(/\/+$/, '');

const HISTORY_URL = `${API_BASE_URL}/api/v1/history/bcv`;

// The retired host publishes no DNS address, so pointing at it would surface as an opaque ENOTFOUND;
// fail with an explicit message instead of silently overriding the operator's setting.
const RETIRED_HOST = 'bcv-api.rafnixg.dev';

function assertHostIsNotRetired() {
 if (API_BASE_URL.includes(RETIRED_HOST)) {
  throw new Error(
   `BCV_API_BASE_URL points at ${RETIRED_HOST}, which its author retired and ` +
    'which publishes no DNS address; set it to https://dolar-vzla.rafnixg.dev ' +
    'or leave it blank to use that default',
  );
 }
}

const FX_TIMEOUT_MS = Number(process.env.FX_REQUEST_TIMEOUT_MS || 2000);

// The endpoint's currency parameter is a Spanish enum ('dolar', 'euro', ...); anything else is a 422.
const DOLLAR_PARAMETER = 'dolar';

// One request must cover a whole span (a month plus margin, polled several times a day); a lower
// ceiling could truncate it into a hole the caller would read as a day the BCV did not publish.
const MAX_ROWS = 1000;

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar day a value names, or null.
 * The API's `date` is a zoneless ISO instant written on Caracas time; slicing keeps the intended
 * day, whereas parsing to a Date would attach this machine's zone and could shift it.
 * @returns {string|null} YYYY-MM-DD
 */
function toCalendarDay(value) {
 if (typeof value !== 'string') return null;

 const day = value.slice(0, 10);

 return CALENDAR_DAY.test(day) ? day : null;
}

/**
 * A finite positive number, or null.
 * Text is accepted because self-hosted copies emit it, and a decimal comma is read as a point so a
 * copy forwarding the portal's formatting does not parse as a number hundreds of times too small.
 */
function toRate(value) {
 let parsed = null;

 if (typeof value === 'number') {
  parsed = value;
 } else if (typeof value === 'string') {
  parsed = Number(value.trim().replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
 }

 return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Every rate the BCV had in force across a span, one row per calendar day. Bolivar only: other
 * currencies are quoted in bolivars per unit, so usd->x would compose two quotes under the BCV's name.
 *
 * @param {string} currency - Only 'ves' is served
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} endDate - 'YYYY-MM-DD'
 * @param {Object} [options] - Time budget
 * @param {number} [options.deadlineAt] - Absolute epoch ms the cascade may not pass
 * @param {number} [options.timeoutMs] - Call timeout, defaults to FX_REQUEST_TIMEOUT_MS
 * @returns {Promise<Array<{rateDate: string, rate: string, source: string}>>}
 * @throws {Error} - On an unsupported currency, an invalid span, an exceeded
 *  deadline, network failure or a malformed payload
 */
export async function fetchBcvRange(currency, startDate, endDate, options = {}) {
 const code = typeof currency === 'string' ? currency.toLowerCase() : '';

 if (code !== OFFICIAL_BCV_CURRENCY) {
  throw new Error(`BCV does not serve currency: ${currency}`);
 }

 const from = toCalendarDay(startDate);
 const to = toCalendarDay(endDate);

 if (!from || !to) {
  throw new Error(`Invalid BCV span requested: ${startDate}..${endDate}`);
 }

 if (from > to) {
  throw new Error(`BCV span ends before it starts: ${from}..${to}`);
 }

 let timeoutMs =
  Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : FX_TIMEOUT_MS;

 // One call, so the cascade budget caps it once instead of per step.
 if (Number.isFinite(options.deadlineAt)) {
  const remainingMs = options.deadlineAt - Date.now();

  if (remainingMs <= 0) {
   throw new Error(`BCV aborted for ${from}..${to}: cascade deadline reached`);
  }

  timeoutMs = Math.min(timeoutMs, remainingMs);
 }

 assertHostIsNotRetired();

 const response = await axios.get(HISTORY_URL, {
  timeout: timeoutMs,
  headers: { Accept: 'application/json' },
  params: {
   currency: DOLLAR_PARAMETER,
   start_date: from,
   end_date: to,
   limit: MAX_ROWS,
  },
 });

 const payload = response.data;
 const rows = payload && Array.isArray(payload.currencies) ? payload.currencies : null;

 if (!rows) {
  throw new Error(`BCV returned a malformed payload for ${from}..${to}`);
 }

 // The last scrape of a day carries what the BCV finally had in force; the newest instant is
 // chosen explicitly so the result does not depend on the endpoint's ordering.
 const latestPerDay = new Map();

 for (const row of rows) {
  const day = toCalendarDay(row?.date);
  const rate = toRate(row?.rate);

  if (!day || rate === null) continue;

  // Rows outside from..to must not enter the store: the coverage it records is exactly from..to.
  if (day < from || day > to) continue;

  const seen = latestPerDay.get(day);

  if (!seen || String(row.date) > seen.at) {
   latestPerDay.set(day, { at: String(row.date), rate });
  }
 }

 const series = [...latestPerDay.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([rateDate, { rate }]) => ({
   rateDate,
   rate: String(rate),
   source: BCV_RATE_SOURCE,
  }));

 console.log(
  `[FX] BCV ${from}..${to}: ${series.length} days from ${rows.length} observations`,
 );

 return series;
}
