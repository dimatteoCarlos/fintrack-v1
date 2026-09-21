import { getCurrencyId } from '../../currencyLookup.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../fintrack_api/config/fintrackConfig.js';

/**
 * Build the FX metadata object for one transaction. With no options it describes
 * an identity (1:1) conversion; options override it for a real conversion.
 *
 * @param {number} originalAmount - amount in the original currency
 * @param {object} pool - used to resolve the accounting currency id
 * @param {object} options
 * @param {number} options.exchangeRate - default 1.0
 * @param {string} options.exchangeRateSource - default 'identity'
 * @param {Date} options.exchangeRateTimestamp - default: now
 * @returns {Promise<Object>} FX metadata object
 */
export async function buildFxMetadata(
  originalAmount,
  originalCurrencyId,
  pool,
  options = {}
) {
  const {
    exchangeRate = 1.0,
    exchangeRateSource = 'identity',
    exchangeRateTimestamp = new Date(),
  } = options;

  const accountingCurrencyId = await getCurrencyId(pool, ACCOUNTING_CURRENCY_CODE);
  
  return {
    original_amount: originalAmount,
    original_currency_id: originalCurrencyId,
    exchange_rate: exchangeRate,
    exchange_rate_source: exchangeRateSource,
    exchange_rate_timestamp: exchangeRateTimestamp,
    exchange_rate_target_currency_id: accountingCurrencyId,
  };
}