// Scale and rounding mode for every monetary figure. Calculations stay exact; rounding happens
// only at this module's boundaries, so the API, CSV export and totals agree on "two decimals".

import Decimal from 'decimal.js';

// A private constructor, not the shared Decimal: fx_services imports decimal.js
// too, so a global Decimal.set() would change this module's rounding.
const Money = Decimal.clone({
 precision: 34,
 rounding: Decimal.ROUND_HALF_UP,
});

// Minor-unit exponent. The app is USD-only (ACCOUNTING_CURRENCY_CODE); JPY is 0
// and KWD is 3, so this must become per-currency to support them.
const AMOUNT_SCALE = 2;

// executionPercentage is a ratio, not money. Its own constant so it can diverge
// without touching amounts.
const RATE_SCALE = 2;

// Matches Postgres numeric (half away from zero); decimal.js HALF_UP does the same for negatives,
// which remainingBudget needs when overspent. Aligned modes keep a missed rounding point harmless.
const ROUNDING = Money.ROUND_HALF_UP;

// Largest value DECIMAL(15,2) holds: 13 integer digits plus the scale. Past this a
// value has no canonical form (clamping would change what the caller asked for),
// so callers reject instead of normalizing.
const MAX_AMOUNT = new Money('9999999999999.99');

/**
 * The smallest expressible amount: one minor unit, derived from AMOUNT_SCALE. Holds only
 * because the five seeded currencies (usd, eur, cop, ves, mxn) are all scale 2: JPY (0)
 * would let 0.5 through and KWD (3) would reject a valid 0.001.
 */
export const MINIMUM_AMOUNT = new Money(`1e-${AMOUNT_SCALE}`).toNumber();

/**
 * Parse without throwing; null when the value is not a finite number. Decimal
 * rejects null, booleans and unparseable strings by exception, which is the
 * wrong shape for a predicate.
 */
const toDecimalOrNull = (value) => {
 try {
  const amount = new Money(value);
  return amount.isFinite() ? amount : null;
 } catch {
  return null;
 }
};

/**
 * Build an exact Decimal; throws TypeError for a non-finite value. Accepts the NUMERIC
 * string pg returns, so a driver value is never degraded through parseFloat.
 */
export function money(value) {
 const amount = toDecimalOrNull(value);

 if (amount === null) {
  throw new TypeError(`money: expected a finite numeric value, received ${String(value)}`);
 }

 return amount;
}

/**
 * Whether a value can become an amount. Never throws: the domain validators use it
 * in place of `typeof x === 'number'`, which would reject the Decimals the
 * calculator hands over.
 */
export function isFiniteMoney(value) {
 return toDecimalOrNull(value) !== null;
}

/**
 * Whether a value still fits the amount columns once rounded to scale.
 *
 * Tested after rounding, not before: 9999999999999.994 is over the limit as
 * written but stores exactly, and rejecting it would be arbitrary.
 */
export function isWithinAmountRange(value) {
 const amount = toDecimalOrNull(value);

 if (amount === null) {
  return false;
 }

 return amount.toDecimalPlaces(AMOUNT_SCALE, ROUNDING).abs().lessThanOrEqualTo(MAX_AMOUNT);
}

/**
 * An amount as the API reports it: a plain number at 2 decimals.
 */
export function toAmount(value) {
 return money(value).toDecimalPlaces(AMOUNT_SCALE, ROUNDING).toNumber();
}

/**
 * A rate as the API reports it. Same scale as an amount today, different
 * meaning: it never enters a sum, so it is rounded only so the response and the
 * export agree.
 */
export function toRate(value) {
 return money(value).toDecimalPlaces(RATE_SCALE, ROUNDING).toNumber();
}

/**
 * An amount as fixed-point text, trailing zeros kept.
 *
 * The CSV needs "250.50" where toAmount gives 250.5. Formatting lives here so
 * the export does not carry its own copy of the scale.
 */
export function toAmountString(value) {
 return money(value).toFixed(AMOUNT_SCALE, ROUNDING);
}