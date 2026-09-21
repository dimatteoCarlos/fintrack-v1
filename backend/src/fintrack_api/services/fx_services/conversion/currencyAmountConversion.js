// Amount conversion from the global FX state (undated) or the historical cascade (dated).

import Decimal from 'decimal.js';

import { fxRateDecimal } from '../utils/fxRateDecimal.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';
import { ensureFXStateIsFresh, fxState } from '../core/fxService.js';
import { resolveHistoricalRate } from '../core/historicalRateResolver.js';

// Total time budget for a dated conversion across every currency it resolves; the
// same ceiling the resolver applies to a single one.
const HISTORICAL_BUDGET_MS = Number(process.env.FX_HISTORICAL_BUDGET_MS || 5000);

/**
 * The calendar day a value names as 'YYYY-MM-DD', or null. Only the identity case
 * needs it; every other path gets its day from the source that supplied the rate.
 */
function toCalendarDay(value) {
  if (typeof value === 'string') {
    const trimmed = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Converts an amount between currencies; every source rate is 1 USD = X currency. Without
 * asOfDate it uses fxState (after ensureFXStateIsFresh); with one it uses the historical cascade
 * and never touches fxState or its TTL. The caller decides whether a date is "today" (no timezone here).
 *
 * @param {Date|string|null} [asOfDate=null] - The day to value the amount on.
 * @param {string} [timeZone='UTC'] - IANA zone the day boundary is read on, passed
 *   to the historical cascade; UTC preserves the behaviour of callers that omit it.
 * @returns {Promise<{amount: Decimal, rate: number, quote: {currency: string, rate: number}, source: string, fetchedAt: Date, effectiveDate: string|null}>}
 *   source is what belongs in exchange_rate_source: the bare provider name on the
 *   current path, provider@effectiveDate on the historical one. effectiveDate is
 *   null on the current path.
 *
 *   rate is the conversion's own multiplier (convertedAmount = amount * rate).
 *   quote is the market figure it came from, always 1 accounting unit = quote.rate
 *   of quote.currency. Only the quote is legible: a peso-to-dollar rate of 0.00031
 *   rounds to zero in a display while the quote is 3202.79, and a cross
 *   conversion's rate is two quotes composed, so a client cannot derive one from
 *   the other.
 */
export async function currencyAmountConversion(
  amount,
  fromCurrency,
  toCurrency = ACCOUNTING_CURRENCY_CODE,
  asOfDate = null,
  timeZone = 'UTC',
) {
  const from = fromCurrency.toLowerCase();
  const to = toCurrency.toLowerCase();

  if (from === to) {
    // A currency against itself is 1 on every day, so the requested day is the day
    // it was in force; no source is consulted.
    const day = asOfDate ? toCalendarDay(asOfDate) : null;

    return {
      amount: fxRateDecimal(amount, 1),
      rate: 1,
      quote: { currency: from, rate: 1 },
      source: day ? `identity@${day}` : 'identity',
      fetchedAt: new Date(),
      effectiveDate: day,
      provider: 'identity',
    };
  }

  // Only the current path needs fresh global state; the historical path must not
  // touch it, so the check sits inside this branch.
  if (!asOfDate) {
    await ensureFXStateIsFresh();
  }

  // One deadline for the whole cascade: a cross conversion resolves two currencies
  // and would otherwise give each a full budget, doubling the possible wait.
  const deadlineAt = asOfDate ? Date.now() + HISTORICAL_BUDGET_MS : null;

  /**
   * The quote for one currency against the accounting currency, from whichever
   * source this call uses.
   * @returns {Promise<{rate: string|number, source: string, fetchedAt: Date, effectiveDate: string|null}>}
   */
  const quoteFor = async (currency) => {
    if (!asOfDate) {
      const data = fxState.rates?.[currency];

      if (!data) {
        throw new Error(`Rate for ${currency} not available in FX state.`);
      }

      return {
        rate: data.rate,
        source: data.source || 'system',
        fetchedAt: data.fetchedAt || new Date(),
        effectiveDate: null,
      };
    }

    const resolved = await resolveHistoricalRate(currency, asOfDate, {
      budgetMs: deadlineAt - Date.now(),
      timeZone,
    });

    return {
      rate: resolved.rate,
      source: resolved.provenance,
      // When the rate was read, not now: a rate in force on 29 August was fetched
      // the day the store got it, and back-dated rows persist this as
      // exchange_rate_timestamp. new Date() is only the fallback.
      fetchedAt: resolved.fetchedAt || new Date(),
      effectiveDate: resolved.effectiveDate,
    };
  };

  // The undated path keeps float arithmetic bit for bit: a Decimal reciprocal would
  // move the converted amount in its 17th digit for existing callers. The dated
  // path uses Decimal so a cross conversion does not round on the way to the amount.
  const reciprocalOf = (rate) => (asOfDate ? new Decimal(1).div(rate) : 1 / rate);

  const composed = (fromRate, toRate) =>
    asOfDate
      ? new Decimal(1).div(fromRate).times(toRate)
      : (1 / fromRate) * toRate;

  // Only the currencies a case needs are quoted, so a conversion against the
  // accounting currency never pays for a second resolution.
  let effectiveRate;
  let sourceData;

  // The market figure behind the conversion, as the source states it: 1 accounting
  // unit = quotedRate of quotedCurrency (the foreign side of the pair).
  let quotedCurrency;
  let quotedRate;

  if (from !== ACCOUNTING_CURRENCY_CODE && to === ACCOUNTING_CURRENCY_CODE) {
    // The source rate is 1 USD = X fromCurrency, so the conversion takes its inverse.
    sourceData = await quoteFor(from);
    effectiveRate = reciprocalOf(sourceData.rate);
    quotedCurrency = from;
    quotedRate = sourceData.rate;
  }

  else if (
    from === ACCOUNTING_CURRENCY_CODE &&
    to !== ACCOUNTING_CURRENCY_CODE
  ) {
    // The source rate is already 1 USD = X toCurrency, so it is used directly.
    sourceData = await quoteFor(to);
    effectiveRate = asOfDate ? new Decimal(sourceData.rate) : sourceData.rate;
    quotedCurrency = to;
    quotedRate = sourceData.rate;
  }

  else {
    // Cross conversion between two non-accounting currencies:
    // amount * (1 / fromRate) * toRate.
    const fromQuote = await quoteFor(from);
    const toQuote = await quoteFor(to);

    effectiveRate = composed(fromQuote.rate, toQuote.rate);

    // The side the amount is entered in; the other would quote a currency the
    // reader never typed.
    quotedCurrency = from;
    quotedRate = fromQuote.rate;

    // Both legs are named when their effective days differ, so a cross conversion
    // valued from two days is not recorded as if one day supplied it.
    sourceData =
      fromQuote.effectiveDate && fromQuote.effectiveDate !== toQuote.effectiveDate
        ? { ...fromQuote, source: `${fromQuote.source}+${toQuote.source}` }
        : fromQuote;
  }
  // On the dated path the rate is already a Decimal, so a cross conversion's
  // reciprocal never passes through a float.
  const convertedAmount = fxRateDecimal(amount, effectiveRate);

  return {
    amount: convertedAmount,
    // The effective rate of the conversion, not the raw quote it came from.
    rate: typeof effectiveRate === 'number' ? effectiveRate : effectiveRate.toNumber(),
    quote: { currency: quotedCurrency, rate: Number(quotedRate) },
    source: sourceData.source || 'system',
    fetchedAt: sourceData.fetchedAt || new Date(),
    // null on the current path: today's rate has no effective day of its own.
    effectiveDate: sourceData.effectiveDate,
  };
}
