/**
 * Banca d'Italia daily rates, one currency per call, no key; cop fallback for
 * banrepTrmProvider. Also the business-day oracle: closed days publish no row.
 * Only convention 'C' (currency per 1 USD) is accepted; others are refused, not inverted.
 */

import axios from 'axios';

const FX_TIMEOUT_MS = Number(process.env.FX_REQUEST_TIMEOUT_MS || 2000);

// The published quote direction this app stores: units of currency per 1 USD.
const USD_BASE_CONVENTION = 'C';

// A connect failure applies to every endpoint on the host, and each hung call burns its
// whole timeout (about 2s of the 5s cascade budget), so the host is skipped briefly; the
// short window keeps a flaky host retried soon, as this provider is the preferred one.
const HOST_RETRY_AFTER_MS = 60_000;

let hostUnreachableUntil = 0;

// Only a failure to REACH the host counts: an HTTP status or malformed body means
// it answered, and skipping the provider for those would hide a bug.
const CONNECTION_FAILURE_CODES = new Set([
 'ECONNABORTED',
 'ECONNREFUSED',
 'ECONNRESET',
 'EAI_AGAIN',
 'EHOSTUNREACH',
 'ENETUNREACH',
 'ENOTFOUND',
 'ETIMEDOUT',
 'ERR_NETWORK',
]);

/**
 * Refuse the call outright while the host is known to be unreachable.
 * @throws {Error} Worded "skipped" so cascade diagnostics do not read as a failure.
 */
function assertHostReachable() {
 if (Date.now() < hostUnreachableUntil) {
  const seconds = Math.ceil((hostUnreachableUntil - Date.now()) / 1000);

  throw new Error(
   `Banca d'Italia skipped: the host did not connect, not retried for ${seconds}s`,
  );
 }
}

/** Record a request's effect on host reachability; pass null on success. */
function noteHostOutcome(error) {
 if (!error) {
  hostUnreachableUntil = 0;
  return;
 }

 if (error.response) return;

 if (CONNECTION_FAILURE_CODES.has(error.code)) {
  hostUnreachableUntil = Date.now() + HOST_RETRY_AFTER_MS;
 }
}


const SUPPORTED_CURRENCIES = ['cop', 'eur', 'jpy', 'mxn', 'ves'];

/**
 * Normalize 'YYYY-MM-DD' (or an ISO timestamp opening with one) to a calendar day, or null.
 * A Date is refused: the instant-to-day conversion happens once on the owner's calendar,
 * and reading it here in UTC would move a 20:00 movement at UTC-5 to the next day.
 */
function toCalendarDay(value) {
 const day =
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
   ? value.slice(0, 10)
   : null;

 if (!day) return null;

 // Rejects a well-formed but impossible day such as '2026-02-31'.
 const parsed = new Date(`${day}T00:00:00.000Z`);

 if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
  return null;
 }

 return day;
}

// Banca d'Italia's range endpoint: one call answers a whole span of days.
const TIME_SERIES_URL =
 'https://tassidicambio.bancaditalia.it/terzevalute-wf-web/rest/v1.0/dailyTimeSeries';

/**
 * Fetch every published rate of one currency against USD between two days, inclusive, in
 * one round trip. Rows match what persistDailyRates writes; the rate stays the provider's
 * string (parsing would round it). The convention is checked once on the resultsInfo envelope.
 * @param {string} currency - Target currency code, case-insensitive
 * @param {string} startDate - First day of the span, 'YYYY-MM-DD'
 * @param {string} endDate - Last day of the span, 'YYYY-MM-DD'
 * @param {Object} [options] - Time budget
 * @param {number} [options.deadlineAt] - Absolute epoch ms the cascade may not pass
 * @param {number} [options.timeoutMs] - Call timeout, defaults to FX_REQUEST_TIMEOUT_MS
 * @returns {Promise<Array<{rateDate: string, rate: string, source: string}>>}
 * @throws {Error} - On an unsupported currency, an invalid span, network failure,
 *  an exceeded deadline, a malformed payload or an unexpected quote convention
 */
export async function fetchBancaDItaliaRange(currency, startDate, endDate, options = {}) {
 const code = typeof currency === 'string' ? currency.toLowerCase() : '';

 if (!SUPPORTED_CURRENCIES.includes(code)) {
  throw new Error(`Banca d'Italia does not serve currency: ${currency}`);
 }

 const from = toCalendarDay(startDate);
 const to = toCalendarDay(endDate);

 if (!from || !to) {
  throw new Error(`Invalid Banca d'Italia span requested: ${startDate}..${endDate}`);
 }

 if (from > to) {
  throw new Error(`Banca d'Italia span ends before it starts: ${from}..${to}`);
 }

 const isoCode = code.toUpperCase();

 let timeoutMs =
  Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : FX_TIMEOUT_MS;

 // One call, so the cascade budget caps it once instead of per step.
 if (Number.isFinite(options.deadlineAt)) {
  const remainingMs = options.deadlineAt - Date.now();

  if (remainingMs <= 0) {
   throw new Error(`Banca d'Italia aborted for ${isoCode}: cascade deadline reached`);
  }

  timeoutMs = Math.min(timeoutMs, remainingMs);
 }

 assertHostReachable();

 let response;

 try {
  response = await axios.get(TIME_SERIES_URL, {
   timeout: timeoutMs,
   headers: { Accept: 'application/json' },
   params: {
    startDate: from,
    endDate: to,
    baseCurrencyIsoCode: isoCode,
    currencyIsoCode: 'USD',
    lang: 'en',
   },
  });

  noteHostOutcome(null);
 } catch (error) {
  noteHostOutcome(error);
  throw error;
 }

 const payload = response.data;
 const rows = payload && Array.isArray(payload.rates) ? payload.rates : null;

 if (!rows) {
  throw new Error(
   `Banca d'Italia returned a malformed payload for ${isoCode} on ${from}..${to}`
  );
 }

 // An empty span is valid (no day published); whether it is a miss is the caller's call.
 if (rows.length === 0) {
  console.log(`[FX] Banca d'Italia usd -> ${code} for ${from}..${to}: no published day`);
  return [];
 }

 const convention = payload.resultsInfo?.exchangeConventionCode;

 if (convention !== USD_BASE_CONVENTION) {
  throw new Error(
   `Banca d'Italia quoted ${isoCode} on ${from}..${to} as '${convention}', not per-USD`
  );
 }

 const series = [];

 for (const row of rows) {
  const rateDate = toCalendarDay(row.referenceDate);

  // An undated row is dropped, not assigned a date this app made up.
  if (!rateDate) {
   console.warn(`Skipping undated Banca d'Italia row for ${isoCode}: ${row.referenceDate}`);
   continue;
  }

  series.push({ rateDate, rate: String(row.avgRate), source: 'bancaditalia' });
 }

 console.log(
  `[FX] Banca d'Italia usd -> ${code} for ${from}..${to}: ${series.length} published day(s)`
 );

 return series;
}
