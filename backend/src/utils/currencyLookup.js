// Currency id/code lookups: in-memory catalog first, database as fallback.

import { pool } from '../db/config/configDB.js';

import { isCurrencyCatalogLoaded ,  getCurrencyIdSync, getCurrencyCodeSync} from '../fintrack_api/services/fx_services/currency_catalog/loadCurrencyCatalog.js';

/**
 * Get a currency ID from its code, from the in-memory catalog when loaded,
 * otherwise from the database.
 * @param {object} clientOrPool - Optional database client (for transactions)
 * @param {string} currencyCode - Currency code (e.g., 'usd')
 * @throws {Error} If currency not found
 */

export async function getCurrencyId(clientOrPool = null, currencyCode) {
  if (isCurrencyCatalogLoaded()) {
    try {
      return getCurrencyIdSync(currencyCode);
    } catch (err) {
      console.warn(`Currency ${currencyCode} not in catalog: ${err.message}. Falling back to DB.`);
    }
  }

  const db = clientOrPool || pool;
  const result = await db.query(
    'SELECT currency_id FROM currencies WHERE currency_code = $1',
    [currencyCode]
  );
  if (result.rows.length === 0) {
    throw new Error(`Currency code not found: ${currencyCode}`);
  }
  return result.rows[0].currency_id;
}
/**
 * Get a currency code (lowercase) from its ID, from the in-memory catalog when
 * loaded, otherwise from the database.
 * @param {object} clientOrPool - Optional database client (for transactions)
 * @throws {Error} If currency ID not found
 */
export async function getCurrencyCode(clientOrPool = null, currencyId) {
  if (isCurrencyCatalogLoaded()) {
    try {
      return getCurrencyCodeSync(currencyId);
    } catch (err) {
      console.warn(`Currency ID ${currencyId} not in catalog: ${err.message}. Falling back to DB.`);
    }
  }

  const db = clientOrPool || pool;
  const result = await db.query(
    'SELECT currency_code FROM currencies WHERE currency_id = $1',
    [currencyId]
  );
  if (result.rows.length === 0) {
    throw new Error(`Currency ID not found: ${currencyId}`);
  }
  return result.rows[0].currency_code;
}

// Sync versions re-exported for direct catalog access.
export { getCurrencyIdSync, getCurrencyCodeSync };