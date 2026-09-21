// Every currency list the interface reads; `constants.ts` re-exports it.
// SUPPORTED_CURRENCIES must match backend fx_services/core/fxConfig.js: the API refuses
// any code missing there even if this file offers it.
import { CurrencyType, DropdownOptionType } from '../types/types';

export const SUPPORTED_CURRENCIES: CurrencyType[] = [
 'usd',
 'eur',
 'cop',
 'ves',
 'mxn',
 'jpy',
];

// Cycle order of the currency badge toggle. Deliberately not the order of
// SUPPORTED_CURRENCIES: the two most used currencies sit next to each other.
export const CURRENCY_CYCLE: CurrencyType[] = [
 'usd',
 'cop',
 'eur',
 'ves',
 'mxn',
 'jpy',
];

// The locale each currency is formatted under: a locale, not a currency code.
export const CURRENCY_OPTIONS: Record<CurrencyType, string> = {
 usd: 'en-US',
 eur: 'en-US',
 cop: 'es-CO',
 ves: 'es-VE',
 mxn: 'es-MX',
 // The yen has no minor unit and 'ja-JP' already formats 1234.5 without decimals,
 // so this entry needs no special case.
 jpy: 'ja-JP',
};

// Decimal places per ISO 4217. Written out because browser Intl disagrees with
// it: Chromium reports 0 for the peso (its cash digits), Node reports 2.
export const CURRENCY_MINOR_UNITS: Record<CurrencyType, number> = {
 usd: 2,
 eur: 2,
 cop: 2,
 ves: 2,
 mxn: 2,
 jpy: 0,
};

const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });

// Generated from SUPPORTED_CURRENCIES rather than written out, so a currency
// added to that list reaches every dropdown without a second edit.
export const SELECT_CURRENCY_OPTIONS: DropdownOptionType<CurrencyType>[] =
 SUPPORTED_CURRENCIES.map((code) => ({
  value: code,
  label: `${code.toUpperCase()} - ${currencyNames.of(code.toUpperCase())}`,
 }));

// The currency the interface renders in when the owner has expressed no choice.
// Read from the environment so it can follow the backend's own accounting
// currency without a code change.
const declaredCurrency = String(
 import.meta.env.VITE_ACCOUNTING_CURRENCY_CODE ?? '',
).toLowerCase();

// The cast cannot check the value, so it is checked here: a key missing from CURRENCY_OPTIONS
// ('USD' by case, 'gbp' unsupported) makes formatters fall back to the machine locale silently.
export const DEFAULT_CURRENCY = (
 SUPPORTED_CURRENCIES.includes(declaredCurrency as CurrencyType)
  ? declaredCurrency
  : 'usd'
) as CurrencyType;
