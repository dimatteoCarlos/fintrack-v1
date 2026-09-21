/** In-memory currency_id <-> currency_code cache for synchronous lookups; loaded once at startup. */
import { pool } from "../../../../db/config/configDB.js";
// Map<currency_code (lowercase), currency_id>
let currenciesByCode = null;

// Map<currency_id, currency_code (lowercase)>
let currenciesById = null;
let isCurrencyLoaded = false;

/** Load all currencies into memory; must run at initialization before the sync accessors are used. */
export async function loadCurrencyCatalog(client = pool) {
  const res = await client.query('SELECT currency_id, currency_code FROM currencies');

  currenciesByCode = new Map();
  currenciesById = new Map();

  for (const row of res.rows) {
   const currencyCode = row.currency_code.toLowerCase();
   
   currenciesByCode.set(currencyCode, row.currency_id);

   currenciesById.set(row.currency_id, currencyCode);
  }

  isCurrencyLoaded = true;
  console.log(`✅ Currency catalog loaded: ${currenciesByCode.size} currencies`);
}

/**
 * Synchronous currency_id lookup by code (case-insensitive).
 * @throws {Error} If the catalog is not loaded or the code is unknown
 */
export function getCurrencyIdSync(currencyCode) {
  if (!isCurrencyLoaded) {
    throw new Error('Currency catalog not loaded. Call loadCurrencyCatalog() first.');
  }
  
  const normalizedCode = currencyCode.toLowerCase();
  const currencyId = currenciesByCode.get(normalizedCode);
  if (currencyId === undefined) {
    throw new Error(`Currency code not found: ${currencyCode}`);
  }
  return currencyId;
}

/**
 * Synchronous currency code lookup by ID, lowercase.
 * @throws {Error} If the catalog is not loaded or the ID is unknown
 */

export function getCurrencyCodeSync(currencyId) {
  if (!isCurrencyLoaded) {
    throw new Error('Currency catalog not loaded. Call loadCurrencyCatalog() first.');
  }
  const currencyCode = currenciesById.get(currencyId);
  if (currencyCode === undefined) {
    throw new Error(`Currency ID not found: ${currencyId}`);
  }
  return currencyCode;
}

export function isCurrencyCatalogLoaded() {
  return isCurrencyLoaded;
}
