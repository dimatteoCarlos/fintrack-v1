// ExchangeRate-API provider (https://exchangerate-api.com): one rate, or every rate when the target is null.

import axios from 'axios';

const FX_API_KEY = process.env.EXCHANGE_RATE_API_KEY;
const FX_TIMEOUT_MS = Number(process.env.FX_REQUEST_TIMEOUT_MS || 2000);

const FX_BASE_URL = 'https://v6.exchangerate-api.com/v6';

/**
 * Fetches rates from ExchangeRate-API; used by currencyAmountConversion.js.
 * @param {string} fromCurrencyCode - Base currency code
 * @param {string|null} toCurrencyCode - Target currency code, or null for every rate
 * @returns {Promise<Object>} - { rate, source, fetchedAt, providerUpdatedAt, providerDay } or, when the target is null, { rates, ... }
 * @throws {Error} - On a network or API error
 */

export async function fetchFromExchangeRateAPI(fromCurrencyCode, toCurrencyCode ) {

  if (!FX_API_KEY) {
  throw new Error(
    'Missing EXCHANGE_RATE_API_KEY'
  );
}
  if (!fromCurrencyCode ) {
    throw new Error(
      'Base currency code is required'
    );
  }
  if (typeof fromCurrencyCode !== 'string') {
  throw new Error('Base currency code must be a string');
}
if (toCurrencyCode  !== null && typeof toCurrencyCode  !== 'string') {
  throw new Error('Target currency code must be a string or null');
}

  const base = fromCurrencyCode.toUpperCase();

  const url = `${FX_BASE_URL}/${FX_API_KEY}/latest/${base}`;

  const response = await axios.get(url, { timeout: FX_TIMEOUT_MS });

  if (!response.data || response.data.result !== 'success') {
    throw new Error('ExchangeRate-API returned invalid response');
  }
if (!toCurrencyCode ) {
return {
   rates: response.data.conversion_rates,
   source: 'exchange-rate-api',
// fetchedAt is when this installation asked and the cache ages from it; time_last_update_unix is
// when the provider published, so it travels apart as providerUpdatedAt.
   fetchedAt: new Date(),
   providerUpdatedAt: response.data.time_last_update_unix
     ? new Date(response.data.time_last_update_unix * 1000)
     : null,
   providerDay: response.data.time_last_update_unix
     ? new Date(response.data.time_last_update_unix * 1000)
         .toISOString()
         .slice(0, 10)
     : null,
    };
  }
  const target = toCurrencyCode.toUpperCase();
  const rate = response.data.conversion_rates[target];

  if (
    !rate ||
    typeof rate !== 'number' ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    throw new Error(`Invalid rate for ${target} from ExchangeRate-API`);
  }

  console.log(`[FX] ExchangeRateAPI ${base} -> ${target}`);
  return {
    rate: Number(rate),
    source: 'exchange-rate-api',
    fetchedAt: new Date(),
    providerUpdatedAt: response.data.time_last_update_unix
      ? new Date(response.data.time_last_update_unix * 1000)
      : null,
// Published once a day at 00:00 UTC, so the UTC day of that instant is the day it covers.
    providerDay: response.data.time_last_update_unix
      ? new Date(response.data.time_last_update_unix * 1000)
          .toISOString()
          .slice(0, 10)
      : null,
  };
};

/**
 * Every rate for a base currency in the standard format of the FX global state.
 * @returns {Promise<Object|null>} - { rates: { target: { rate, source, fetchedAt, ... } }, source, fetchedAt, ... } or null
 */
export async function fetchAllRates(baseCurrency) {
  try {
    const result = await fetchFromExchangeRateAPI(baseCurrency, null);

    if (!result || !result.rates || typeof result.rates !== 'object') {
      return null;
    }

    const rates = {};
    for (const [target, rate] of Object.entries(result.rates)) {
      if (typeof rate === 'number' && rate > 0) {
        rates[target.toLowerCase()] = {
          rate,
          source: result.source || 'exchange-rate-api',
          fetchedAt: result.fetchedAt || new Date(),
          providerUpdatedAt: result.providerUpdatedAt || null,
          providerDay: result.providerDay || null,
        };
      }
    }

    return {
      rates,
      source: 'exchange-rate-api',
      fetchedAt: result.fetchedAt || new Date(),
      providerUpdatedAt: result.providerUpdatedAt || null,
      providerDay: result.providerDay || null,
    };
  } catch (error) {
    console.warn('⚠️ ExchangeRate-API fetchAllRates failed:', error.message);
    return null;
  }
}
