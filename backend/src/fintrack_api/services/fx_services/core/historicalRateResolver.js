/**
 * Resolves what one accounting-currency unit was worth in another currency on a past day (back-dating).
 * Apart from fxProviderOrchestrator because a past rate never expires, so its TTL cascade does not apply.
 * Invariants: no source invents an effective date; a past movement is never valued at today's rate.
 */

import {
 ACCOUNTING_CURRENCY_CODE,
 FALLBACK_RATE_SOURCE,
 OFFICIAL_BCV_CURRENCY,
 OFFICIAL_TRM_CURRENCY,
 SUPPORTED_CURRENCIES,
} from './fxConfig.js';

import { createError } from '../../../../utils/errorHandling.js';
import { getCurrencyId } from '../../../../utils/currencyLookup.js';
import { todayInZone } from '../../../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';

import {
 MAX_RATE_AGE_DAYS,
 findDailyRate,
 findLatestBusinessDay,
 isDaySettled,
 persistQueriedRange,
} from '../db/dailyRateDBaccess.js';

import { fetchBancaDItaliaRange } from '../fxProviders/bancaDItaliaProvider.js';
import { fetchBcvRange } from '../fxProviders/bcvApiRafnixgProvider.js';
import { fetchTrmRange } from '../fxProviders/banrepTrmProvider.js';
import { fetchRatesForDate } from '../fxProviders/githubFallbackProvider.js';

// Ceiling for the whole cascade, sized by how long a form submit may hang, not by
// the sum of the arms. Each arm caps its own call by what is left.
const CASCADE_BUDGET_MS = Number(process.env.FX_HISTORICAL_BUDGET_MS || 5000);

const CALL_TIMEOUT_MS = Number(process.env.FX_REQUEST_TIMEOUT_MS || 2000);

const DAY_MS = 24 * 60 * 60 * 1000;

// The source name the CDN arm's rows are stored under. The settled-day guard needs
// it before the call is made; taken from fxConfig because the store ranks by the
// same name and two spellings would silently disagree.
const CDN_SOURCE = FALLBACK_RATE_SOURCE;

/**
 * @typedef {Object} HistoricalRate
 * @property {string} rate - The rate as text: 1 accounting unit = rate currency.
 * @property {string} currency - The currency the rate is quoted in, lowercase.
 * @property {string} source - Which provider supplied it.
 * @property {string} requestedDate - The movement's own day, 'YYYY-MM-DD'.
 * @property {string} effectiveDate - The day the rate was in force.
 * @property {number} daysBack - requestedDate minus effectiveDate, in days.
 * @property {string} provenance - source@effectiveDate, for exchange_rate_source.
 * @property {Date|null} fetchedAt - When the rate was read from the provider.
 *  null when nothing was read, which is the identity answer.
 */

/** Normalize a value to the YYYY-MM-DD calendar day it names, or null. */
function toCalendarDay(value) {
 if (typeof value === 'string') {
  const trimmed = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
 }

 if (value instanceof Date && !Number.isNaN(value.getTime())) {
  return value.toISOString().slice(0, 10);
 }

 return null;
}

/**
 * Span for a range provider when valuing `day`: five days before its month's first, to today or month end.
 * Five days match the store's age bound. Ending at today (the owner's `timeZone`; UTC runs ahead west of
 * Greenwich) costs one request and makes later back-dated movements of that month store hits.
 */
function spanAround(day, timeZone) {
 const [year, month] = day.split('-').map(Number);

 const firstOfMonth = Date.UTC(year, month - 1, 1);
 const from = new Date(firstOfMonth - MAX_RATE_AGE_DAYS * DAY_MS)
  .toISOString()
  .slice(0, 10);

 // Day 0 of the next month is the last day of this one.
 const lastOfMonth = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
 const today = todayInZone(timeZone);

 return { from, to: today < lastOfMonth ? today : lastOfMonth };
}

/** Turn a findDailyRate hit into the resolver's answer. */
function asAnswer(hit, currency, requestedDate) {
 return {
  rate: hit.rate,
  currency,
  source: hit.source,
  requestedDate,
  effectiveDate: hit.rateDate,
  daysBack: hit.daysBack,
  provenance: `${hit.source}@${hit.rateDate}`,
  fetchedAt: hit.fetchedAt,
 };
}

/**
 * Rate for a movement on a past day. Order is deliberate: identity (rate 1), the store, Banrep (cop),
 * BCV (ves), Banca d'Italia (also the business-day oracle), then the CDN, only for a day another source
 * published (it invents movement on closed days). No answer is a 422.
 *
 * @param {Object} [options]
 * @param {number} [options.budgetMs] - Ceiling for the whole cascade
 * @param {string} [options.timeZone='UTC'] - IANA zone that decides what counts as today (the owner's);
 *   UTC is the default because the warm-up fills a shared store and has no owner.
 * @returns {Promise<HistoricalRate>}
 * @throws {Error} Carries a stable errorCode and details: UNSUPPORTED_FX_CURRENCY and INVALID_FX_DATE on
 *   bad input (400), FX_DATE_IN_FUTURE and FX_RATE_UNAVAILABLE on a day that cannot be valued (422).
 *   The code is the contract; the message may change.
 */
export async function resolveHistoricalRate(currencyCode, requestedDate, options = {}) {
 const currency = typeof currencyCode === 'string' ? currencyCode.toLowerCase() : '';

 if (!SUPPORTED_CURRENCIES.includes(currency)) {
  throw createError(
   400,
   `Unsupported currency for a historical rate: ${currencyCode}`,
   {
    errorCode: 'UNSUPPORTED_FX_CURRENCY',
    details: { currency: String(currencyCode) },
   },
  );
 }

 const day = toCalendarDay(requestedDate);

 if (!day) {
  throw createError(
   400,
   `Invalid date for a historical rate: ${requestedDate}`,
   {
    errorCode: 'INVALID_FX_DATE',
    details: { expectedFormat: 'YYYY-MM-DD' },
   },
  );
 }

 // A future day cannot be resolved, only guessed; "future" is judged on the
 // owner's calendar, not the server's.
 const timeZone = options.timeZone || 'UTC';
 const today = todayInZone(timeZone);

 if (day > today) {
  throw createError(
   422,
   `Cannot value a movement dated in the future: ${day}`,
   {
    errorCode: 'FX_DATE_IN_FUTURE',
    details: { requestedDay: day, today },
   },
  );
 }

 // Identity: one accounting unit is one unit of itself on any day, so no store
 // read and no network call.
 if (currency === ACCOUNTING_CURRENCY_CODE) {
  return {
   rate: '1',
   currency,
   source: 'identity',
   requestedDate: day,
   effectiveDate: day,
   // Nothing was read, so there is no timestamp to stamp.
   fetchedAt: null,
   daysBack: 0,
   provenance: `identity@${day}`,
  };
 }

 const budgetMs =
  Number(options.budgetMs) > 0 ? Number(options.budgetMs) : CASCADE_BUDGET_MS;

 const deadlineAt = Date.now() + budgetMs;

 const baseCurrencyId = await getCurrencyId(null, ACCOUNTING_CURRENCY_CODE);
 const targetCurrencyId = await getCurrencyId(null, currency);

 const stored = await findDailyRate(baseCurrencyId, targetCurrencyId, day);

 if (stored) {
  return asAnswer(stored, currency, day);
 }

 // Why each arm failed; logged before the 422 is thrown.
 const attempts = [];

 /**
  * Store a provider's rows and the queried span, then read the answer back, so the resolution rule lives in
  * one SQL statement and the answer served now is the one served next time. The span is required: the read
  * refuses rows it cannot prove were inside a queried period.
  *
  * @param {{from: string, to: string}} span - The days asked for, `to` included.
  */
 const storeThenResolve = async (rows, span) => {
  await persistQueriedRange({
   rateRows: rows,
   baseCurrencyId,
   targetCurrencyId,
   from: span.from,
   to: span.to,
  });

  const hit = await findDailyRate(baseCurrencyId, targetCurrencyId, day);
  return hit ? asAnswer(hit, currency, day) : null;
 };

 if (currency === OFFICIAL_TRM_CURRENCY) {
  try {
   // The whole window, not one day: every calendar day belongs to exactly one
   // TRM validity, and fetching a single one leaves the other days resolving back
   // onto a superseded rate. Rows are stored under the day their validity opens.
   const { from, to } = spanAround(day, timeZone);

   const series = await fetchTrmRange(from, to);

   if (series.length > 0) {
    const answer = await storeThenResolve(series, { from, to });
    if (answer) return answer;
   }

   attempts.push(
    `banrep: nothing in force on ${day} within ${from}..${to}, or the span ` +
     `from the effective day to ${day} is not covered`,
   );
  } catch (error) {
   attempts.push(`banrep: ${error.message}`);
  }
 }

 // BCV ahead of the universal arm, like Banrep: a national bank's own figure outranks a foreign cross or a
 // CDN recomputation (the CDN sat below the BCV on 63 of 63 days measured). As a range provider it resolves
 // a weekend bolivar movement onto the prior publication, which the CDN arm cannot.
 if (currency === OFFICIAL_BCV_CURRENCY) {
  try {
   const { from, to } = spanAround(day, timeZone);

   const series = await fetchBcvRange(currency, from, to, {
    deadlineAt,
    timeoutMs: CALL_TIMEOUT_MS,
   });

   if (series.length > 0) {
    const answer = await storeThenResolve(series, { from, to });
    if (answer) return answer;
   }

   attempts.push(
    `bcv: no published day on or before ${day} within ${from}..${to}, or the ` +
     `span from it to ${day} is not covered`,
   );
  } catch (error) {
   attempts.push(`bcv: ${error.message}`);
  }
 }

 try {
  const { from, to } = spanAround(day, timeZone);

  const series = await fetchBancaDItaliaRange(currency, from, to, {
   deadlineAt,
   timeoutMs: CALL_TIMEOUT_MS,
  });

  if (series.length > 0) {
   const answer = await storeThenResolve(series, { from, to });
   if (answer) return answer;
  }

  attempts.push(
   `bancaditalia: no published day on or before ${day} within the bound, ` +
    `or the span from it to ${day} is not covered`,
  );
 } catch (error) {
  attempts.push(`bancaditalia: ${error.message}`);
 }

 // The CDN is asked for a day read from the store, never the requested day. With
 // an empty history this arm does not run, since the alternative is letting the
 // CDN name a date nobody quoted.
 try {
  const publishedDay = await findLatestBusinessDay(day);

  if (!publishedDay) {
   attempts.push('cdn: skipped, no source has established a business day yet');
  } else if (await isDaySettled(baseCurrencyId, targetCurrencyId, publishedDay, CDN_SOURCE)) {
   // The call would write nothing: the day already holds an observation and its
   // span is covered under this source. Without this, every warm-up pays a round
   // trip per uncovered day (about 7s of a boot, measured).
   attempts.push(
    `cdn: skipped, ${publishedDay} is already stored and covered`,
   );
  } else {
   const payload = await fetchRatesForDate(ACCOUNTING_CURRENCY_CODE, publishedDay, {
    deadlineAt,
    timeoutMs: CALL_TIMEOUT_MS,
   });

   const quote = payload.rates?.[currency];

   if (!quote) {
    attempts.push(`cdn: no ${currency} quote on ${publishedDay}`);
   } else {
    const answer = await storeThenResolve(
     [{ rateDate: publishedDay, rate: String(quote.rate), source: payload.source }],
     // One day was asked for, so one day is covered; the other arms' span would
     // assert days this call never requested.
     { from: publishedDay, to: publishedDay },
    );

    if (answer) return answer;

    attempts.push(
     `cdn answered ${publishedDay}, which is either outside the ` +
      `${MAX_RATE_AGE_DAYS}-day bound or not covered through ${day}: this arm ` +
      `asks for one day, so it covers one day and cannot answer a later one`,
    );
   }
  }
 } catch (error) {
  attempts.push(`cdn: ${error.message}`);
 }

 // Arm diagnostics go to the log, not the response: a client cannot act on
 // provider failures and should not learn how the cascade is built.
 console.error(
  `No historical rate for ${currency} on ${day}. Tried -> ${attempts.join(' | ')}`,
 );

 throw createError(
  422,
  `No historical rate for ${currency} on ${day}.`,
  {
   errorCode: 'FX_RATE_UNAVAILABLE',
   details: { currency, requestedDay: day },
  },
 );
}
