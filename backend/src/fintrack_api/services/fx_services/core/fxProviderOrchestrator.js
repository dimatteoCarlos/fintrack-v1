// Walks the provider cascade to fetch every supported rate, filling gaps in priority order.

import {
  FX_CACHE_TTL_MS,
  FX_GITHUB_TTL_MS,
  FX_STATIC_FALLBACK_TTL_MS,
  SUPPORTED_CURRENCIES,
} from './fxConfig.js';

import * as banrep from '../fxProviders/banrepTrmProvider.js';
import * as cotizave from '../fxProviders/cotizaveApiProvider.js';
import * as exchangeRate from '../fxProviders/exchangeRateApiProvider.js';
import * as freeCurrency from '../fxProviders/freeCurrencyApiProvider.js';
import * as github from '../fxProviders/githubFallbackProvider.js';
import * as staticFallback from '../fxProviders/getFallbackRate.js';

// Priority order. The first two are authoritative single-currency sources (COP,
// VES); the rest are aggregators.
const PROVIDERS = [
  { name: 'banrep-trm', fn: banrep.fetchAllRates, ttl: FX_CACHE_TTL_MS },
  { name: 'cotizave', fn: cotizave.fetchAllRates, ttl: FX_CACHE_TTL_MS },
  { name: 'exchange-rate-api', fn: exchangeRate.fetchAllRates, ttl: FX_CACHE_TTL_MS },
  { name: 'free-currency-api', fn: freeCurrency.fetchAllRates, ttl: FX_CACHE_TTL_MS },
  { name: 'github-fallback', fn: github.fetchAllRates, ttl: FX_GITHUB_TTL_MS },
  { name: 'static-fallback', fn: staticFallback.fetchAllRates, ttl: FX_STATIC_FALLBACK_TTL_MS },
];

/**
 * @param {Object} options - Passed to each provider (e.g., for the static fallback)
 * @returns {Promise<{ rates: Object, oldestFetchedAt: Date, stateTTL: number }>}
 *   oldestFetchedAt is the MIN(fetchedAt) across all currencies except the base.
 * @throws {Error} - If any currency remains missing after all providers
 */
export async function fetchRatesFromProviders(
  baseCurrency,
  supportedCurrencies = SUPPORTED_CURRENCIES,
  options = {}
) {
  // The base currency is injected locally at rate 1, never fetched.
  const now = new Date();
  const rates = {
    [baseCurrency]: {
      rate: 1,
      source: 'system',
      fetchedAt: now,
    },
  };

  const missing = new Set(supportedCurrencies.filter(c => c !== baseCurrency));

  let stateTTL = FX_CACHE_TTL_MS;

  let oldestFetchedAt = null;

  for (const provider of PROVIDERS) {
    if (missing.size === 0) break;

    try {
      const result = await provider.fn(baseCurrency, options);

      if (!result || !result.rates || typeof result.rates !== 'object') {
        continue;
      }

      // Fill only missing currencies, so a higher-priority rate is never overwritten.
      let providerUsed = false;
      for (const [code, data] of Object.entries(result.rates)) {
        const c = code.toLowerCase();
        if (c === baseCurrency) continue;
        if (missing.has(c) && !rates[c]) {
          rates[c] = {
            rate: data.rate,
            source: data.source || provider.name,
            fetchedAt: data.fetchedAt || new Date(),
            // Rebuilt field by field, so anything not named here is dropped.
            providerUpdatedAt: data.providerUpdatedAt || null,
            // Present only for a provider that publishes on a daily calendar.
            // Cotizave quotes a market continuously and states no day, so its
            // rate never becomes a daily observation.
            providerDay: data.providerDay || null,
          };
          missing.delete(c);
          providerUsed = true;

          const fetchedTime = new Date(rates[c].fetchedAt).getTime();
          if (oldestFetchedAt === null || fetchedTime < oldestFetchedAt) {
            oldestFetchedAt = fetchedTime;
          }
        }
      }

      // The state expires with the shortest TTL among the providers actually used.
      if (providerUsed && provider.ttl < stateTTL) {
        stateTTL = provider.ttl;
      }
    } catch (error) {
      console.warn(`⚠️ Provider ${provider.name} failed:`, error.message);
    }
  }

  if (missing.size > 0) {
    throw new Error(
      `Fallback data incomplete. Missing currencies: ${[...missing].join(', ')}`
    );
  }

  // Only the base currency existed, so there is no fetch time to report.
  if (oldestFetchedAt === null) {
    oldestFetchedAt = now.getTime();
  }

  return {
    rates,
    oldestFetchedAt: new Date(oldestFetchedAt),
    stateTTL,
  };
}
