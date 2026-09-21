// Currency endpoints: currencyConvert (conversion for the frontend preview) and getAllRates (rate listing).

import { currencyAmountConversion } from '../services/fx_services/conversion/currencyAmountConversion.js';

import { getCurrencyId } from '../../utils/currencyLookup.js';

import { ACCOUNTING_CURRENCY_CODE } from '../config/fintrackConfig.js';

import {
  ensureFXStateIsFresh,
  fxState,
} from '../services/fx_services/core/fxService.js';

import { createError } from '../../utils/errorHandling.js';
import {
  isCalendarDate,
  todayInZone,
} from '../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';
import { getAuthenticatedUserId } from '../../utils/authUtils/getAuthenticatedUserId.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { pool } from '../../db/config/configDB.js';

/**
 * Refuse an unsupported currency code as a 400. getCurrencyId throws a plain Error (a 500), so the
 * narrowing happens here. The errorCode is shared with the resolver; details names which side.
 *
 * @param {string} side - 'fromCurrency' or 'toCurrency'.
 * @throws {Error} 400 UNSUPPORTED_FX_CURRENCY
 */
async function assertCurrencySupported(code, side) {
  try {
    if (await getCurrencyId(null, code)) return;
  } catch {
    // Not found. Refused below, with the status and the code the client needs.
  }

  throw createError(400, `unsupported currency code: ${code}`, {
    errorCode: 'UNSUPPORTED_FX_CURRENCY',
    details: { currency: String(code), side },
  });
}

// POST: convert a specific amount.
export async function currencyConvert(req, res, next) {
  try {
    const {
      amount,
      fromCurrency,
      toCurrency = ACCOUNTING_CURRENCY_CODE,
      day,
    } = req.body;

    // Raised with an errorCode like every other refusal on this path, so a caller need
    // not parse English to tell one 400 from another.
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw createError(400, 'amount must be a positive number', {
        errorCode: 'INVALID_FX_AMOUNT',
        details: { amount: String(amount) },
      });
    }

    await assertCurrencySupported(fromCurrency, 'fromCurrency');
    await assertCurrencySupported(toCurrency, 'toCurrency');

    // Omitted means today. The current-month rule is not applied: it governs recording an
    // operation, while this only looks up a rate and writes nothing.
    const requestedDay = typeof day === 'string' ? day.trim() : '';

    if (requestedDay !== '' && !isCalendarDate(requestedDay)) {
      throw createError(400, `day must be a calendar day, YYYY-MM-DD`, {
        errorCode: 'INVALID_FX_DATE',
        details: { expectedFormat: 'YYYY-MM-DD' },
      });
    }

    // Today (owner's zone) takes the live rate, an earlier day the rate in force on it; keep in sync
    // with transactionController so preview and write agree. UTC is the fallback: a missing
    // claim is the token middleware's error to raise.
    const ownerId = getAuthenticatedUserId(req);
    const timeZone = ownerId ? await getUserTimeZone(pool, ownerId) : 'UTC';
    const todayForOwner = todayInZone(timeZone);

    const asOfDay =
      requestedDay !== '' && requestedDay < todayForOwner ? requestedDay : null;

    const conversion = await currencyAmountConversion(
      numericAmount,
      fromCurrency,
      toCurrency,
      asOfDay,
      // The same zone asOfDay was decided on, so the resolver's future guard and
      // this handler's routing agree on which day it is.
      timeZone,
    );

    // effectiveDate is the day whose rate answered, which may differ from the day asked (a
    // Saturday uses Friday's quote); null on the undated path.
    res.json({
      convertedAmount: conversion.amount.toNumber(), // amount is a Decimal.js object
      rate: conversion.rate,
      // The market figure behind the rate, as every source publishes it: 1 accounting
      // unit = quote.rate of quote.currency. rate alone rounds to zero in a display for a
      // currency worth a fraction of an accounting unit.
      quote: conversion.quote,
      source: conversion.source,
      fetchedAt: conversion.fetchedAt,
      effectiveDate: conversion.effectiveDate ?? null,
    });
  } catch (error) {
    // Forwarded, not turned into a 500: the historical resolver's refusals already carry
    // their own status and stable code, which rebuilding here would demote and drop.
    console.error('Currency conversion error:', error);
    return next(error);
  }
}

/**
 * GET all exchange rates for the accounting base currency, from the cached global fxState.
 */
export async function getAllRates(req, res, next) {
  const base = req.query.base || ACCOUNTING_CURRENCY_CODE;

  try {
    await ensureFXStateIsFresh();

    const rates = {};
    for (const [currency, data] of Object.entries(fxState.rates || {})) {
      rates[currency] = currency === base ? 1 : data.rate;
    }

    res.json({
      base,
      rates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching rates:', error);
    res.status(500).json({
      error: error.message || 'FX subsystem unavailable',
    });
  }
}
