/**
 * Batch access to the current-rate table (exchange_rates).
 *
 * The currency catalog is preferred for speed and reloaded when missing, but
 * currencyLookup.js falls back to the database, so a failed reload does not break FX.
 */
import { pool } from '../../../../db/config/configDB.js';

import { getCurrencyId } from '../../../../utils/currencyLookup.js';

import { isCurrencyCatalogLoaded, loadCurrencyCatalog } from '../currency_catalog/loadCurrencyCatalog.js';

/** Reload the currency catalog if missing; failure only warns, since getCurrencyId falls back to the DB. */
async function ensureCurrencyCatalogLoaded() {
  if (!isCurrencyCatalogLoaded()) {
    console.warn('⚠️ Currency catalog not loaded. Attempting to reload...');
    try {
      await loadCurrencyCatalog();
      console.log('✅ Currency catalog reloaded successfully.');
    } catch (err) {
      console.warn(
        '⚠️ Failed to reload catalog. FX will fallback to database lookup via getCurrencyId().',
      );
    }
  }
}

/**
 * Resolve lowercase currency codes to IDs via the canonical currency lookup,
 * preserving order.
 */
async function resolveCurrencyIds(currencyCodes) {
  const ids = await Promise.all(
    currencyCodes.map((code) => getCurrencyId(null, code)),
  );

  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    const invalid = currencyCodes.filter(
      (_, i) => !Number.isInteger(ids[i]) || ids[i] <= 0,
    );
    throw new Error(
      `Invalid or missing currency IDs for: ${invalid.join(', ')}`,
    );
  }

  return ids;
}

/**
 * Read the current rates of several target currencies (lowercase codes) in one query.
 * @returns {Promise<Object>} - { currencyCode: { rate, source, fetchedAt, providerUpdatedAt } }
 */
export async function getAllRatesFromDB(currencyCodes, baseCurrencyId) {
  if (!currencyCodes?.length) {
    return {};
  }

  await ensureCurrencyCatalogLoaded();

  const targetIds = await resolveCurrencyIds(currencyCodes);

  const { rows } = await pool.query(
    `
    SELECT
      target_currency_id,
      exchange_rate,
      source,
      fetched_at,
      provider_updated_at
    FROM exchange_rates
    WHERE base_currency_id = $1
      AND target_currency_id = ANY($2::int[])
    `,
    [baseCurrencyId, targetIds],
  );

  // targetIds keeps the order of currencyCodes because resolveCurrencyIds maps positionally.
  const codeMap = {};
  targetIds.forEach((id, index) => {
    codeMap[id] = currencyCodes[index];
  });

  const rates = {};
  for (const row of rows) {
    const code = codeMap[row.target_currency_id];
    if (!code) continue;

    rates[code] = {
      rate: parseFloat(row.exchange_rate),
      source: row.source,
      fetchedAt: row.fetched_at,
      providerUpdatedAt: row.provider_updated_at,
    };
  }

  return rates;
}

/**
 * Upsert several exchange rates in one transaction, one row per (base, target) pair.
 * @param {Array<Object>} ratesBatch - { targetCode, rate, source, fetchedAt, providerUpdatedAt? }
 */
export async function upsertRatesBatch(ratesBatch, baseCurrencyId) {
  if (!ratesBatch?.length) {
    return;
  }

  await ensureCurrencyCatalogLoaded();

  const targetIds = await resolveCurrencyIds(
    ratesBatch.map((r) => r.targetCode),
  );

  const client = await pool.connect();
  let persistedCount = 0;

  try {
    await client.query('BEGIN');

    for (let i = 0; i < ratesBatch.length; i++) {
      const item = ratesBatch[i];
      const targetCurrencyId = targetIds[i];

      if (!Number.isFinite(item.rate) || item.rate <= 0) {
        console.warn(
          `⚠️ Skipping invalid rate for ${item.targetCode}: ${item.rate}`,
        );
        continue;
      }

      const fetchedAt =
        item.fetchedAt instanceof Date
          ? item.fetchedAt
          : new Date(item.fetchedAt);

      await client.query(
        `
        INSERT INTO exchange_rates (
          base_currency_id,
          target_currency_id,
          exchange_rate,
          source,
          fetched_at,
          provider_updated_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (base_currency_id, target_currency_id)
        DO UPDATE SET
          exchange_rate = EXCLUDED.exchange_rate,
          source = EXCLUDED.source,
          fetched_at = EXCLUDED.fetched_at,
          provider_updated_at = EXCLUDED.provider_updated_at

        `,
        [
          baseCurrencyId,
          targetCurrencyId,
          item.rate,
          item.source || 'unknown',
          fetchedAt,
          item.providerUpdatedAt || null,
        ],
      );

      persistedCount++;
    }

    await client.query('COMMIT');
    console.log(
      `💾 Batch persisted: ${persistedCount} rates (${ratesBatch.length - persistedCount} skipped)`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to persist rates batch:', error.message);
    throw error;
  } finally {
    client.release();
  }
}
