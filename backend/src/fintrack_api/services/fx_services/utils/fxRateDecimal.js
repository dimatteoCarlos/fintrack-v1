import Decimal from 'decimal.js';

/**
 * Multiplies an amount by a rate with Decimal.js to avoid floating-point error.
 * @returns {Decimal} A Decimal rather than a number, so callers keep the precision
 */
export function fxRateDecimal(amount, rate) {
  return new Decimal(amount).times(rate);
}