// GitHub fallback provider (fawazahmed0/currency-api on a CDN): free, no API key, every currency for a base.

import axios from 'axios';

// The version segment selects the day ('@latest' or '@YYYY-MM-DD'); the root is split out so the
// historical arm can name a date without rebuilding the URL.
const FX_CDN_ROOT = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';
const FX_BASE_URL = `${FX_CDN_ROOT}@latest/v1/currencies`;
const FX_TIMEOUT_MS = Number(process.env.FX_REQUEST_TIMEOUT_MS || 2000);

/**
 * Fetches rates from the GitHub fallback API; used by currencyAmountConversion.js.
 * @param {string|null} targetCode - Target currency code, or null for every rate
 * @returns {Promise<Object>} - { rate, source, fetchedAt } or { rates, source, fetchedAt }
 * @throws {Error} - On a network or API error
 */
export async function fetchFromGitHubFallback(baseCode, targetCode) {
  if (!baseCode) {
    throw new Error('Base currency code is required');
  }
  if (typeof baseCode !== 'string') {
    throw new Error('Base currency code must be a string');
  }
  if (targetCode !== null && typeof targetCode !== 'string') {
    throw new Error('Target currency code must be a string or null');
  }

  const baseLower = baseCode.toLowerCase();
  const url = `${FX_BASE_URL}/${baseLower}.json`;

  const response = await axios.get(url, { timeout: FX_TIMEOUT_MS });

  if (!response.data || !response.data[baseLower]) {
    throw new Error('GitHub API returned invalid response');
  }

  // fetchedAt takes the provider's snapshot date when present, not the request time.
  const providerUpdated = response.data?.date;
  const fetchedAt = providerUpdated ? new Date(providerUpdated) : new Date();

  if (!targetCode) {
    const rates = response.data[baseLower];
    return {
      rates,
      source: 'github-fallback',
      fetchedAt,
    };
  }

  const targetLower = targetCode.toLowerCase();
  const rate = response.data[baseLower][targetLower];

  if (!rate || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid rate for ${targetCode} from GitHub API`);
  }

  console.log(`[FX] GitHub fallback ${baseLower} -> ${targetLower}: ${rate}`);
  return {
    rate: Number(rate),
    source: 'github-fallback',
    fetchedAt,
  };
}

/**
 * Every rate for a base currency in the standard format of the FX global state.
 * @param {Object} options - Unused; kept so every provider exposes the same signature
 * @returns {Promise<Object|null>} - { rates: { target: { rate, source, fetchedAt } }, source, fetchedAt } or null
 */
export async function fetchAllRates(baseCurrency, options = {}) {
  try {
    const result = await fetchFromGitHubFallback(baseCurrency, null);

    if (!result || !result.rates || typeof result.rates !== 'object') {
      return null;
    }

    const rates = {};
    for (const [target, rate] of Object.entries(result.rates)) {
      if (typeof rate === 'number' && rate > 0) {
        rates[target.toLowerCase()] = {
          rate,
          source: result.source || 'github-fallback',
          fetchedAt: result.fetchedAt || new Date(),
        };
      }
    }

    return {
      rates,
      source: 'github-fallback',
      fetchedAt: result.fetchedAt || new Date(),
    };
  } catch (error) {
    console.warn('⚠️ GitHub fallback fetchAllRates failed:', error.message);
    return null;
  }
}

/**
 * Validates a calendar day, 'YYYY-MM-DD'.
 * A day is a string and never a Date: reading a Date in UTC at an entry point silently shifts
 * the day for a user west of Greenwich.
 */
function isCalendarDay(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

 // Rejects a well-formed but impossible day such as '2026-02-31'.
 const parsed = new Date(`${value}T00:00:00.000Z`);

 return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Every rate this CDN publishes for a base currency on a past day. The date must be a business day
 * already resolved upstream (on a weekend the CDN fabricates figures). Last arm of the cascade, so
 * it throws instead of returning null and the resolver can say which arm failed.
 *
 * @param {string} baseCurrency - Base currency code, e.g. 'usd' (case-insensitive)
 * @param {string} date - The effective day, 'YYYY-MM-DD'
 * @param {Object} [options] - Time budget
 * @param {number} [options.deadlineAt] - Absolute epoch ms the whole cascade may not pass
 * @param {number} [options.timeoutMs] - Per-call timeout, defaults to FX_REQUEST_TIMEOUT_MS
 * @returns {Promise<{rates: Object, source: string, requestedDate: string, effectiveDate: string, fetchedAt: Date}>}
 * @throws {Error} - On an invalid base or day, an exceeded deadline, network failure or a malformed payload
 */
export async function fetchRatesForDate(baseCurrency, date, options = {}) {
 const baseLower = typeof baseCurrency === 'string' ? baseCurrency.toLowerCase() : '';

 if (!baseLower) {
  throw new Error('GitHub fallback historical: base currency code is required');
 }

 if (!isCalendarDay(date)) {
  throw new Error(`GitHub fallback historical: invalid day requested: ${date}`);
 }

 const callTimeout = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : FX_TIMEOUT_MS;
 let timeoutMs = callTimeout;

 // The remaining cascade budget caps this call so the last arm cannot spend a full timeout
 // after the earlier arms have used the ceiling.
 if (Number.isFinite(options.deadlineAt)) {
  const remainingMs = options.deadlineAt - Date.now();

  if (remainingMs <= 0) {
   throw new Error(`GitHub fallback historical aborted for ${baseLower} on ${date}: cascade deadline reached`);
  }

  timeoutMs = Math.min(callTimeout, remainingMs);
 }

 const url = `${FX_CDN_ROOT}@${date}/v1/currencies/${baseLower}.json`;

 const response = await axios.get(url, { timeout: timeoutMs });

 if (!response.data || !response.data[baseLower]) {
  throw new Error(`GitHub fallback historical returned no ${baseLower} block for ${date}`);
 }

 // A payload date that differs from the one asked for is a different snapshot and must not pass
 // as this day's rate.
 const answeredDate = typeof response.data.date === 'string' ? response.data.date.slice(0, 10) : null;

 if (answeredDate && answeredDate !== date) {
  throw new Error(`GitHub fallback historical asked ${date} for ${baseLower} and was answered ${answeredDate}`);
 }

 const rates = {};
 const fetchedAt = new Date();

 for (const [target, rate] of Object.entries(response.data[baseLower])) {
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
   rates[target.toLowerCase()] = {
    rate,
    source: 'github-fallback',
    effectiveDate: date,
    fetchedAt,
   };
  }
 }

 if (Object.keys(rates).length === 0) {
  throw new Error(`GitHub fallback historical returned no usable ${baseLower} rate for ${date}`);
 }

 console.log(`[FX] GitHub fallback historical ${baseLower} for ${date}: ${Object.keys(rates).length} rates`);

 return {
  rates,
  source: 'github-fallback',
  requestedDate: date,
  effectiveDate: date,
  fetchedAt,
 };
}
