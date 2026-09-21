// Inserts one transaction row with its FX snapshot, on the given client or the shared pool.

import pc from 'picocolors';
import { pool } from '../../../db/config/configDB.js';
import { createError, handlePostgresError } from '../../errorHandling.js';
import { getCurrencyId } from '../../../utils/currencyLookup.js';

import { ACCOUNTING_CURRENCY_CODE } from '../../../fintrack_api/config/fintrackConfig.js';
import {
  DEFAULT_EXCHANGE_RATE,
  DEFAULT_EXCHANGE_RATE_SOURCE,
} from '../../../fintrack_api/services/fx_services/core/fxConfig.js';

export async function recordTransaction(clientOrPool = null, option) {
  const dbClient = clientOrPool || pool;
  // getCurrencyId queries this client when the catalog is not loaded, so a script run
  // without the server boot still resolves the id instead of throwing.
  const accountingCurrencyId = await getCurrencyId(
    dbClient,
    ACCOUNTING_CURRENCY_CODE,
  );

  try {
    const {
      userId,
      description,
      movement_type_id,
      status,
      amount,
      currency_id,
      account_id,
      source_account_id,
      transaction_type_id,
      destination_account_id,
      transaction_actual_date,
      // Set only on the leg that opens an account, so the balance derivation
      // can skip that row instead of guessing it from the money's direction.
      opening_for_account_id,
      original_amount,
      original_currency_id,
      exchange_rate,
      exchange_rate_source,
      exchange_rate_timestamp,
      exchange_rate_target_currency_id,
    } = option;

    const values = [
      userId,
      description,
      movement_type_id,
      status,
      amount,
      currency_id,
      account_id,
      source_account_id,
      transaction_type_id,
      destination_account_id,
      transaction_actual_date,
      // Running balance is not persisted (readers derive it, a stored value would go stale); 0.00 fits the
      // NOT NULL column. Callers still pass account_balance for user_accounts; it is ignored here.
      0.0,
      // NULL for ordinary rows and for a funding leg: both legs of an opening pair
      // share a destination, so only this column tells them apart.
      opening_for_account_id ?? null,
      // FX snapshot, defaulting to a no-conversion record
      original_amount ?? amount,
      original_currency_id ?? currency_id,
      exchange_rate ?? DEFAULT_EXCHANGE_RATE,
      exchange_rate_source ?? DEFAULT_EXCHANGE_RATE_SOURCE,
      exchange_rate_timestamp ?? new Date(),
      exchange_rate_target_currency_id ?? accountingCurrencyId,
    ];

    const transactionResult = await dbClient.query({
      text: `INSERT INTO transactions (user_id, description, movement_type_id, status, amount,currency_id, account_id, source_account_id,transaction_type_id,destination_account_id, transaction_actual_date, account_balance_after_tr, opening_for_account_id,
      original_amount, original_currency_id, exchange_rate, exchange_rate_source, exchange_rate_timestamp, exchange_rate_target_currency_id
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      values,
    });

    return transactionResult.rows[0];
  } catch (error) {
    const message = error.message || `Error when recording transaction.`;
    console.error(pc.redBright(message), 'from record transaction');
    // Throw an Error, not the handler's plain result object: callers run the catch
    // through handlePostgresError again, and that object's HTTP status on .code
    // matches no SQLSTATE case, turning a classified 400 into a 500.
    const { code, message: classified, errorCode, details } =
      handlePostgresError(error);
    throw createError(code, classified, { errorCode, details });
  }
}
