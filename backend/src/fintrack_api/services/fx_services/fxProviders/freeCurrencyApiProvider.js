// FreeCurrencyAPI provider (https://freecurrencyapi.com): one rate, or every rate when the target is null.
import axios from 'axios';

/**
 * Fetches rates from FreeCurrencyAPI; used by currencyAmountConversion.js and fxProviderOrchestrator.js.
 * @param {string|null} targetCode - Target currency code, or null for every rate
 * @returns {Promise<Object>} - { rate, source, fetchedAt, providerUpdatedAt, providerDay } or, when the target is null, { rates, ... }
 * @throws {Error} - On a network or API error
 */

const FX_BASE_URL = 'https://api.freecurrencyapi.com/v1/latest';

export async function fetchFromFreeCurrencyAPI(baseCode, targetCode) {

// Read inside the function to avoid ESM load-order issues.
const FX_API_KEY = process.env.FREE_CURRENCY_API_KEY;
const FX_TIMEOUT_MS = Number(process.env.FX_REQUEST_TIMEOUT_MS || 2000);

  if (!FX_API_KEY) {
    throw new Error('Missing FREE_CURRENCY_API_KEY');
  }

  if (!baseCode ) {
    throw new Error('Base currency code is required');
  }

  if (typeof baseCode !== 'string' ) {
    throw new Error('Base currency code must be strings');
   }

  if (targetCode  !== null && typeof targetCode  !== 'string') {
    throw new Error('Target currency code must be a string or null');
  }

  const base = baseCode.toUpperCase();
  const url = `${FX_BASE_URL}?apikey=${FX_API_KEY}&base_currency=${base}`;

  const response = await axios.get(url, { timeout: FX_TIMEOUT_MS });

  if (!response.data || !response.data.data) {
    throw new Error('FreeCurrencyAPI returned invalid response');
  }
  console.log('data:', response.data);

const providerUpdated = response.data.meta?.last_updated_at;
// last_updated_at is when the provider published; fetchedAt is when this installation asked.
// Conflating them made the cache age from the publication instant and refresh early.
const providerUpdatedAt = providerUpdated ? new Date(providerUpdated) : null;
// Published once a day, so the UTC day of that instant is the day it covers.
const providerDay = providerUpdatedAt
  ? providerUpdatedAt.toISOString().slice(0, 10)
  : null;
const fetchedAt = new Date();

  if (!targetCode ) {
   const normalizedRates = {};
    for (const [key, value] of Object.entries(response.data.data)) {
     normalizedRates[key.toLowerCase()] = value;
    }
   return {
    rates: normalizedRates,
    source: 'freecurrencyapi',
    fetchedAt,
    providerUpdatedAt,
    providerDay,
    };
   }
 const target = targetCode.toUpperCase();
 const rate = response.data.data[target];

  if (!rate || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid rate for ${target} from FreeCurrencyAPI`);
  }
 
  console.log(`[FX] FreeCurrencyAPI ${base} -> ${target}: ${rate}`);

  return {
    rate: Number(rate),
    source: 'freecurrencyapi',
    fetchedAt,
    providerUpdatedAt,
    providerDay,
  };
}

/**
 * Every rate for a base currency in the standard format of the FX global state.
 * @returns {Promise<Object|null>} - { rates: { target: { rate, source, fetchedAt, ... } }, source, fetchedAt, ... } or null
 */
export async function fetchAllRates(baseCurrency) {
  try {
    const result = await fetchFromFreeCurrencyAPI(baseCurrency, null);

    if (!result || !result.rates || typeof result.rates !== 'object') {
      return null;
    }

    const rates = {};
    for (const [target, rate] of Object.entries(result.rates)) {
      if (typeof rate === 'number' && rate > 0) {
        rates[target.toLowerCase()] = {
          rate,
          source: result.source || 'freecurrencyapi',
          fetchedAt: result.fetchedAt || new Date(),
          providerUpdatedAt: result.providerUpdatedAt || null,
          providerDay: result.providerDay || null,
        };
      }
    }

    return {
      rates,
      source: 'freecurrencyapi',
      fetchedAt: result.fetchedAt || new Date(),
      providerUpdatedAt: result.providerUpdatedAt || null,
      providerDay: result.providerDay || null,
    };
  } catch (error) {
    console.warn('⚠️ FreeCurrencyAPI fetchAllRates failed:', error.message);
    return null;
  }
}
