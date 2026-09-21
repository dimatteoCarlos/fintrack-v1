// Write path for the plan itself: create a pocket, overwrite its name, note, target and desired date.

import { pool } from '../../../../db/config/configDB.js';
import {
 MINIMUM_AMOUNT,
 isFiniteMoney,
 isWithinAmountRange,
 toAmount,
} from '../../budget_services/core/money.js';
import { getFreedCashByAccount } from '../db/accountAllocationRepository.js';
// The converter every write path uses; migration 014 records what skipping it
// costs: 50000 cop stored as 50000 usd, an error the schema cannot detect.
import { currencyAmountConversion } from '../../fx_services/conversion/currencyAmountConversion.js';
import { getCurrencyId } from '../../../../utils/currencyLookup.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../config/fintrackConfig.js';
import {
 insertPocket,
 updatePocket,
 deletePocket,
 getPocketForUser,
} from '../db/pocketRepository.js';

const forbidden = (message) =>
 Object.assign(new Error(message), { status: 403 });

const badRequest = (message) =>
 Object.assign(new Error(message), { status: 400 });

/**
 * Validate an amount and return it at the column's scale; the single choke point of the write path.
 * Zero is rejected, unlike the budget module: the column CHECKs target_amount > 0.
 *
 * @param {string} field - named in the message, so the caller knows what to fix
 * @returns {number} the amount rounded to the column's scale
 */
const normalizeAmount = (value, field) => {
 if (!isFiniteMoney(value)) {
  throw badRequest(`${field} must be a number.`);
 }

 if (!isWithinAmountRange(value)) {
  throw badRequest(`${field} exceeds the maximum storable amount.`);
 }

 const normalized = toAmount(value);

 // A sub-cent amount looks positive but stores as 0.00, which the CHECK refuses
 // with a constraint name nobody can act on; naming the minimum says what to fix.
 if (normalized <= 0) {
  throw badRequest(
   `${field} must be at least ${MINIMUM_AMOUNT} in the accounting currency.`,
  );
 }

 return normalized;
};

/**
 * Convert a typed figure into the accounting currency and keep the proof.
 * Converted before normalizing: rounding the origin figure first would rate an amount never typed.
 * Identity conversion when the codes match: no rate lookup, but it still records what it did.
 *
 * @param {import('pg').PoolClient|import('pg').Pool} db - the client of a
 *  transaction in flight, so a currency lookup shares its snapshot
 */
const convertToAccountingCurrency = async (db, amount, currencyCode, field) => {
 const converted = await currencyAmountConversion(
  amount,
  currencyCode,
  ACCOUNTING_CURRENCY_CODE,
 );

 return {
  amount: normalizeAmount(converted.amount.toNumber(), field),
  originalAmount: normalizeAmount(amount, field),
  originalCurrencyId: await getCurrencyId(db, currencyCode),
  exchangeRate: converted.rate,
  exchangeRateSource: converted.source,
  exchangeRateTimestamp: converted.fetchedAt,
 };
};

/**
 * Create a pocket.
 * No money and no source account: it lands at allocated 0, so a pocket never acts as an account.
 *
 * @returns {Promise<number>} the new pocket id
 */
async function createPocket(userId, body) {
 const client = await pool.connect();

 try {
  await client.query('BEGIN');

  const accountingCurrencyId = await getCurrencyId(
   client,
   ACCOUNTING_CURRENCY_CODE,
  );

  const converted = await convertToAccountingCurrency(
   client,
   body.targetAmount,
   body.currency,
   'targetAmount',
  );

  const pocketId = await insertPocket(client, userId, {
   name: body.name,
   note: body.note ?? null,
   targetAmount: converted.amount,
   // The accounting currency, the unit target_amount is expressed in; never the
   // typed one, which the original* and exchange-rate fields record as audit metadata.
   currencyId: accountingCurrencyId,
   desiredDate: body.desiredDate,
   originalTarget: converted.originalAmount,
   originalCurrencyId: converted.originalCurrencyId,
   exchangeRate: converted.exchangeRate,
   exchangeRateSource: converted.exchangeRateSource,
   exchangeRateTimestamp: converted.exchangeRateTimestamp,
   exchangeRateTargetCurrencyId: accountingCurrencyId,
  });

  await client.query('COMMIT');

  return pocketId;
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {
  client.release();
 }
}

/**
 * Overwrite the plan of one pocket.
 * Target and date are overwritten (no history) and travel in one request, so a new target never
 * pairs with the old deadline. The pocket's currency is not editable (it would restate allocations).
 *
 * @throws {Error & {status: 403}} when the pocket is missing or not the caller's
 */
async function editPocket(userId, pocketId, body) {
 const client = await pool.connect();

 try {
  await client.query('BEGIN');

  // Ownership is proven by reading the row under the caller's user_id; the update
  // repeats that condition rather than trusting this read.
  const existing = await getPocketForUser(client, userId, pocketId);

  if (existing === null) {
   throw forbidden('Pocket not found or not owned by the authenticated user.');
  }

  const fields = {
   name: body.name,
   noteWasSent: Object.prototype.hasOwnProperty.call(body, 'note'),
   // null clears the note; an absent key leaves it alone. Collapsing the two would
   // make removing a note inexpressible.
   note: body.note ?? null,
   desiredDate: body.desiredDate,
  };

  if (body.targetAmount !== undefined) {
   const converted = await convertToAccountingCurrency(
    client,
    body.targetAmount,
    body.currency,
    'targetAmount',
   );

   fields.targetAmount = converted.amount;
   fields.originalTarget = converted.originalAmount;
   fields.originalCurrencyId = converted.originalCurrencyId;
   fields.exchangeRate = converted.exchangeRate;
   fields.exchangeRateSource = converted.exchangeRateSource;
   fields.exchangeRateTimestamp = converted.exchangeRateTimestamp;
  }

  const updated = await updatePocket(client, userId, pocketId, fields);

  if (!updated) {
   throw forbidden('Pocket not found or not owned by the authenticated user.');
  }

  await client.query('COMMIT');
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {
  client.release();
 }
}

/**
 * Delete a pocket at any net and answer with what each account gets back.
 * Never refused for a non-zero net: an allocation never moved money, so the cash returns to unassigned.
 * Freed figures are read before the delete, inside the transaction, because the ledger cascades away.
 *
 * @throws {Error & {status: 403}} when the pocket is missing or not the caller's
 */
async function removePocket(userId, pocketId) {
 const client = await pool.connect();

 try {
  await client.query('BEGIN');

  const existing = await getPocketForUser(client, userId, pocketId);

  if (existing === null) {
   throw forbidden('Pocket not found or not owned by the authenticated user.');
  }

  const freed = await getFreedCashByAccount(client, userId, pocketId);

  const deleted = await deletePocket(client, userId, pocketId);

  if (!deleted) {
   throw forbidden('Pocket not found or not owned by the authenticated user.');
  }

  await client.query('COMMIT');

  return {
   pocketId,
   name: existing.name,
   freed: freed.map((row) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    freedCash: toAmount(row.freedCash),
   })),
  };
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {
  client.release();
 }
}

export const pocketWriteService = {
 createPocket,
 editPocket,
 removePocket,
};
