import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';
export const DEFAULT_EXCHANGE_RATE = 1.0;
export const DEFAULT_EXCHANGE_RATE_SOURCE = 'identity';

const FX_CACHE_TTL_HOURS = parseInt(process.env.FX_CACHE_TTL_HOURS || '22', 10);

const FX_CACHE_TTL_MS = FX_CACHE_TTL_HOURS * 60 * 60 * 1000;

const FX_GITHUB_TTL_HOURS = parseFloat(process.env.FX_GITHUB_TTL_HOURS || '0.5');

const FX_GITHUB_TTL_MS = FX_GITHUB_TTL_HOURS * 60 * 60 * 1000;

const FX_STATIC_FALLBACK_TTL_HOURS = parseFloat(
 process.env.FX_STATIC_FALLBACK_TTL_HOURS || '0.25', 10,);

const FX_STATIC_FALLBACK_TTL_MS = FX_STATIC_FALLBACK_TTL_HOURS * 60 * 60 * 1000;

export {
 ACCOUNTING_CURRENCY_CODE,   
 FX_CACHE_TTL_HOURS,
 FX_CACHE_TTL_MS,
 FX_GITHUB_TTL_HOURS,
 FX_GITHUB_TTL_MS,
 FX_STATIC_FALLBACK_TTL_HOURS,
 FX_STATIC_FALLBACK_TTL_MS,
};

// The currencies the API accepts. Request validators read this list, so it, not
// the currencies table, decides what a caller may name. Every code here needs a
// row in currencies and an entry in fixedRates.
export const SUPPORTED_CURRENCIES = ['usd', 'eur', 'cop', 'ves', 'mxn', 'jpy'];

// The currency an official national source publishes for. Its historical arm stores one row per
// validity, which sets the business-day calendar every other currency reads.
export const OFFICIAL_TRM_CURRENCY = 'cop';

// The currency the Banco Central de Venezuela publishes for. Its arm asserts coverage over a span, which
// lets a bolivar movement dated on a weekend resolve; the CDN arm answers one day and cannot.
export const OFFICIAL_BCV_CURRENCY = 'ves';

export const BCV_RATE_SOURCE = 'bcv';

// The name the CDN arm stores its observations under. It is the arm of last resort, answering a single
// day with a cross recomputed from the accounting currency. The resolver and the historical store both
// read this name, so it is defined once here.
export const FALLBACK_RATE_SOURCE = 'github-fallback';
