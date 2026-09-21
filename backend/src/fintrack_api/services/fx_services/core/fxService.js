// Global in-memory FX state: database load, provider refresh and freshness checks.

import { getCurrencyId } from '../../../../utils/currencyLookup.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';
import {
  SUPPORTED_CURRENCIES,
  FX_CACHE_TTL_MS,
} from './fxConfig.js';

import {
  getAllRatesFromDB,
  upsertRatesBatch,
} from '../db/fxDBaccess.js';
import { persistQueriedRange } from '../db/dailyRateDBaccess.js';
import { fetchRatesFromProviders } from './fxProviderOrchestrator.js';

/**
 * In-memory FX state shared by all requests.
 *
 * @property {Object|null} rates - { 'eur': { rate, source, fetchedAt }, ... }
 * @property {Date|null} oldestFetchedAt - MIN(fetchedAt) across all currencies (excluding base)
 * @property {number|null} stateTTL - Time-to-live in milliseconds (22h, 0.5h, or 0.25h)
 * @property {Promise|null} refreshPromise - The in-flight refresh, so concurrent callers share one
 */
export const fxState = {
  baseCurrency: null,
  rates: null,
  oldestFetchedAt: null,
  stateTTL: null,
  refreshPromise: null,
};

function isFXStateComplete() {
  if (!fxState.rates) return false;
  
  const currencies = fxState.baseCurrency
    ? SUPPORTED_CURRENCIES
    : SUPPORTED_CURRENCIES.filter(c => c !== fxState.baseCurrency);

  return currencies.every(c => fxState.rates[c] !== undefined);
}

function isFXStateExpired() {
  if (!fxState.oldestFetchedAt || !fxState.stateTTL) return true;

  const age = Date.now() - new Date(fxState.oldestFetchedAt).getTime();
  return age > fxState.stateTTL;
}

export function isFXStateValid() {
  return isFXStateComplete() && !isFXStateExpired();
}

/**
 * Loads FX state from the database into memory.
 * @returns {Promise<boolean>} - True if loaded (it may still be expired)
 */
export async function loadFXStateFromDB() {
  try {
    const baseCurrency = fxState.baseCurrency || ACCOUNTING_CURRENCY_CODE;

    const baseId = await getCurrencyId(null, baseCurrency);

    if (!baseId) return false;

    const rates = await getAllRatesFromDB(SUPPORTED_CURRENCIES, baseId);

    if (!rates || Object.keys(rates).length === 0) return false;

    let oldest = null;
    for (const [code, data] of Object.entries(rates)) {
      if (code === baseCurrency) continue;
      const time = new Date(data.fetchedAt).getTime();
      if (oldest === null || time < oldest) oldest = time;
    }

    fxState.baseCurrency = baseCurrency;
    fxState.rates = rates;
    fxState.oldestFetchedAt = oldest ? new Date(oldest) : new Date();
    fxState.stateTTL = null; // unknown until the next refresh

    // A loaded state has no provider TTL; use the default one if it is already valid.
    if (isFXStateValid()) {
      fxState.stateTTL = FX_CACHE_TTL_MS;
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to load FX state from DB:', error.message);
    return false;
  }
}

/**
 * Fetches fresh rates through the provider cascade, persists them and updates fxState.
 * @throws {Error} - If the cascade fails to obtain all currencies
 */
export async function refreshFXState() {
  const baseCurrency = fxState.baseCurrency || ACCOUNTING_CURRENCY_CODE;

  const result = await fetchRatesFromProviders(baseCurrency, SUPPORTED_CURRENCIES);

  const baseId = await getCurrencyId(null, baseCurrency);
  if (!baseId) throw new Error(`Base currency ${baseCurrency} not found`);

  const batch = Object.entries(result.rates)
    .filter(([code]) => code !== baseCurrency)
    .map(([code, data]) => ({
      targetCode: code,
      rate: data.rate,
      source: data.source,
      fetchedAt: data.fetchedAt,
      providerUpdatedAt: data.providerUpdatedAt || null,
      providerDay: data.providerDay || null,
    }));

  await upsertRatesBatch(batch, baseId);

  await recordLiveRatesAsDailyObservations(batch, baseId);

  fxState.baseCurrency = baseCurrency;
  fxState.rates = result.rates;
  fxState.oldestFetchedAt = result.oldestFetchedAt;
  fxState.stateTTL = result.stateTTL;
}

/**
 * Records the live refresh as today's observation in the historical store too, so a movement dated
 * today does not miss and buy the same rate again. Skipped without providerDay: inventing a day is
 * what the store refuses. Coverage is written with it (persistQueriedRange), else the row is unproven.
 *
 * @param {Array<Object>} batch - What upsertRatesBatch was just given.
 * @returns {Promise<void>} Never rejects.
 */
async function recordLiveRatesAsDailyObservations(batch, baseCurrencyId) {
  for (const item of batch) {
    if (!item.providerDay) continue;

    try {
      const targetCurrencyId = await getCurrencyId(null, item.targetCode);
      if (!targetCurrencyId) continue;

      await persistQueriedRange({
        rateRows: [
          {
            rateDate: item.providerDay,
            rate: String(item.rate),
            source: item.source,
          },
        ],
        baseCurrencyId,
        targetCurrencyId,
        from: item.providerDay,
        to: item.providerDay,
      });
    } catch (error) {
      // The live rate is already stored and served; history is an optimisation, so
      // its failure must not fail a refresh that otherwise succeeded.
      console.warn(
        `FX history: ${item.targetCode} not recorded — ${error.message}`,
      );
    }
  }
}

/**
 * Loads from the DB or refreshes from providers when fxState is missing or stale;
 * concurrent callers share one refresh.
 * @returns {Promise<void>}
 */
export async function ensureFXStateIsFresh() {
  if (fxState.rates === null) {
    const loaded = await loadFXStateFromDB();
    if (loaded && isFXStateValid()) {
      return;
    }
  }

  if (!isFXStateValid()) {
    if (fxState.refreshPromise) {
      await fxState.refreshPromise;
      return;
    }

    fxState.refreshPromise = refreshFXState();
    try {
      await fxState.refreshPromise;
    } finally {
      fxState.refreshPromise = null;
    }
  }
}
