// Pre-fetches the days a back-dated movement is likely to fall on, so a cold store does not cost a user a
// provider call mid-form. It goes through resolveHistoricalRate so the cascade owns source order; nothing
// here knows what a provider is. The day range and currency order are correctness fixes (see the helpers).

import pc from 'picocolors';

import {
 ACCOUNTING_CURRENCY_CODE,
 OFFICIAL_TRM_CURRENCY,
 SUPPORTED_CURRENCIES,
} from './fxConfig.js';
import { resolveHistoricalRate } from './historicalRateResolver.js';

/**
 * Every day from the first of last month to today, in UTC (the resolver rejects future days on a UTC boundary).
 * Every day, not the 1st only: the CDN arm covers one day, so a non-trading 1st would warm nothing.
 * Two calendar months because owners span UTC-12..UTC+14 and spanAround fetches by month (two range calls).
 *
 * @returns {string[]} 'YYYY-MM-DD', ascending.
 */
const daysToWarm = () => {
 const today = new Date();
 const year = today.getUTCFullYear();
 const month = today.getUTCMonth();

 const days = [];
 // Walked in UTC so no local zone or daylight-saving shift can drop or repeat a day.
 const cursor = new Date(Date.UTC(year, month - 1, 1));
 const end = today.toISOString().slice(0, 10);

 for (;;) {
  const day = cursor.toISOString().slice(0, 10);

  days.push(day);
  if (day === end) break;

  cursor.setUTCDate(cursor.getUTCDate() + 1);
 }

 return days;
};

/**
 * The currencies to warm, the one with an official range source first. The order matters: the CDN arm asks
 * the store for the latest established day, shared across pairs, so on a cold store a currency warmed
 * before the peso has no day to ask for (measured: 0 days ready for the euro before the peso, 22 after).
 *
 * @returns {string[]}
 */
const currenciesToWarm = () => {
 // The accounting currency is an identity conversion and consults no source.
 const rest = SUPPORTED_CURRENCIES.filter(
  (code) => code !== ACCOUNTING_CURRENCY_CODE && code !== OFFICIAL_TRM_CURRENCY,
 );

 return SUPPORTED_CURRENCIES.includes(OFFICIAL_TRM_CURRENCY)
  ? [OFFICIAL_TRM_CURRENCY, ...rest]
  : rest;
};

/**
 * Fills the historical store for every converted currency. Never throws: a provider outage must not stop
 * startup, and an unwarmed currency resolves lazily on first use.
 * A day the cascade cannot answer is not an error; the counts report a partial window as it is.
 *
 * @returns {Promise<{days: number, ready: Object<string, number>, warmed: string[], failed: string[]}>}
 *  for a caller that wants to log or test the outcome. Startup ignores it.
 */
export async function warmRecentRates() {
 const days = daysToWarm();
 const ready = {};
 const warmed = [];
 const failed = [];

 for (const currency of currenciesToWarm()) {
  let lastError = null;

  ready[currency] = 0;

  for (const day of days) {
   try {
    await resolveHistoricalRate(currency, day);
    ready[currency] += 1;
   } catch (error) {
    lastError = error;
   }
  }

  if (ready[currency] > 0) {
   warmed.push(currency);
  } else {
   failed.push(currency);
   // One line per currency: an unreachable provider fails every day for the same reason.
   console.warn(
    pc.yellow(`FX warm-up: ${currency} unavailable — ${lastError?.message}`),
   );
  }
 }

 const summary =
  warmed.map((code) => `${code} ${ready[code]}/${days.length}`).join(', ') || 'none';

 console.log(
  pc.cyan(
   `FX warm-up for ${days[0]}..${days[days.length - 1]}: ${summary}${
    failed.length > 0 ? `; ${failed.join(', ')} left to the lazy path` : ''
   }.`,
  ),
 );

 return { days: days.length, ready, warmed, failed };
}
