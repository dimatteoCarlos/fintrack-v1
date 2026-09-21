import pc from 'picocolors';
import { createError, handlePostgresError } from '../../errorHandling.js';
import { getCurrencyId } from '../../currencyLookup.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../fintrack_api/config/fintrackConfig.js';
import {
  DEFAULT_EXCHANGE_RATE,
  DEFAULT_EXCHANGE_RATE_SOURCE,
} from '../../../fintrack_api/services/fx_services/core/fxConfig.js';
import {
  BALANCE_REVERSAL_MOVEMENT_TYPE_ID,
  BALANCE_REVERSAL_TRANSACTION_TYPE_ID,
} from '../accountDataRetrieval/derivedBalance.js';

/*
 * Reverse-and-close write half: two legs (target, compensation account), both movement type 11 with one
 * reversal_of_account_id, keyed to account_registry because that row outlives the user_accounts delete.
 * Gap: the investment card's `realized` CTE ignores type 11 and wrongly shows UNRECONCILED_BALANCE_NOTICE.
 */

const buildTargetDescription = (amount, currencyCode, counterpartAccountName) =>
  `Balance reversal: ${amount} ${currencyCode} moved to "${counterpartAccountName}" so this account could be closed at zero.`;

const buildCounterpartDescription = (amount, currencyCode, targetAccountName) =>
  `Balance reversal: ${amount} ${currencyCode} received from "${targetAccountName}", which was closed.`;

/**
 * @param {object} client - The active transactional PostgreSQL client, never the pool: this runs inside
 *   the close's own transaction, and the state "reversed, not closed" must not be reachable.
 * @param {object} reversalData
 * @param {number} reversalData.targetAccountId - The account being closed; also written to
 *   reversal_of_account_id on BOTH legs.
 * @param {number} reversalData.counterpartAccountId - The compensation account, resolved by the caller
 *   through checkAndInsertAccount (identified by account_type 'boundary', not by name alone).
 * @param {number} reversalData.balance - The target's derived balance before the reversal, signed. Zero
 *   must never reach this function: it would write two zero-amount legs that neutralise nothing.
 * @param {number} reversalData.currencyId - The CLOSING account's currency, stamped on both legs; the
 *   compensation account's own currency is not read.
 * @returns {Promise<object[]>} The two inserted transaction records, target leg first.
 */
export const recordBalanceReversal = async (client, reversalData) => {
  const {
    userId,
    targetAccountId,
    targetAccountName,
    counterpartAccountId,
    counterpartAccountName,
    balance,
    currencyId,
    currencyCode,
    transactionDate,
  } = reversalData;

  // Two separate refusals: `!balance` is also true for NaN, undefined and null, which would report a
  // balance that never arrived as an account already at zero.
  if (!Number.isFinite(balance)) {
    throw createError(
      500,
      `Balance reversal refused for account ${targetAccountId}: the balance arrived as ${balance}, which is not a number. Nothing was written.`,
    );
  }

  // Refused, not a no-op: a caller reaching here with zero has misread the account's state, and an
  // empty pair would let the close proceed on that misreading.
  if (balance === 0) {
    throw createError(
      400,
      `Balance reversal refused for account ${targetAccountId}: the balance is already zero.`,
    );
  }

  const isTargetPositive = balance > 0;
  const absoluteAmount = Math.abs(balance);

  // FX provenance is explicit: the conversion is a no-op, but the column defaults claim original_amount 0
  // and original_currency_id 1, false for most balances. getCurrencyId queries this client when the
  // catalog is not loaded, so hand-run scripts work without a boot.
  const accountingCurrencyId = await getCurrencyId(
    client,
    ACCOUNTING_CURRENCY_CODE,
  );
  const exchangeRateTimestamp = new Date();

  // The target's leg negates its balance and the compensation account carries the opposite amount, so
  // the ledger still sums to zero. Net worth stays unchanged only because the compensation account is
  // excluded from net worth and every aggregate balance, a rule in the queries rather than in these amounts.
  const targetAmount = -balance;
  const counterpartAmount = balance;

  const sourceAccountId = isTargetPositive
    ? targetAccountId
    : counterpartAccountId;
  const destinationAccountId = isTargetPositive
    ? counterpartAccountId
    : targetAccountId;

  const targetTransactionOption = {
    userId,
    description: buildTargetDescription(
      absoluteAmount,
      currencyCode,
      counterpartAccountName,
    ),
    movement_type_id: BALANCE_REVERSAL_MOVEMENT_TYPE_ID,
    status: 'complete',
    amount: targetAmount,
    currency_id: currencyId,
    account_id: targetAccountId,
    source_account_id: sourceAccountId,
    transaction_type_id: BALANCE_REVERSAL_TRANSACTION_TYPE_ID,
    destination_account_id: destinationAccountId,
    transaction_actual_date: transactionDate,
    // Placeholder: consumers derive the balance from the ledger.
    account_balance: 0.0,
    // Identity of the operation, on both legs: the account whose position was neutralised, which is the
    // target even on the compensation account's leg.
    reversal_of_account_id: targetAccountId,
    // Key order is the bind order (the insert passes Object.values): keep these six last, in column order.
    original_amount: targetAmount,
    original_currency_id: currencyId,
    exchange_rate: DEFAULT_EXCHANGE_RATE,
    exchange_rate_source: DEFAULT_EXCHANGE_RATE_SOURCE,
    exchange_rate_timestamp: exchangeRateTimestamp,
    exchange_rate_target_currency_id: accountingCurrencyId,
  };

  const counterpartTransactionOption = {
    userId,
    description: buildCounterpartDescription(
      absoluteAmount,
      currencyCode,
      targetAccountName,
    ),
    movement_type_id: BALANCE_REVERSAL_MOVEMENT_TYPE_ID,
    status: 'complete',
    amount: counterpartAmount,
    currency_id: currencyId,
    account_id: counterpartAccountId,
    source_account_id: sourceAccountId,
    transaction_type_id: BALANCE_REVERSAL_TRANSACTION_TYPE_ID,
    destination_account_id: destinationAccountId,
    transaction_actual_date: transactionDate,
    account_balance: 0.0,
    reversal_of_account_id: targetAccountId,
    // Same bind-order rule as the target leg above.
    original_amount: counterpartAmount,
    original_currency_id: currencyId,
    exchange_rate: DEFAULT_EXCHANGE_RATE,
    exchange_rate_source: DEFAULT_EXCHANGE_RATE_SOURCE,
    exchange_rate_timestamp: exchangeRateTimestamp,
    exchange_rate_target_currency_id: accountingCurrencyId,
  };

  const insertQuery = `
   INSERT INTO transactions(
    user_id, description, movement_type_id, status, amount, currency_id,
    account_id, source_account_id, transaction_type_id, destination_account_id,
    transaction_actual_date, account_balance_after_tr, reversal_of_account_id,
    original_amount, original_currency_id, exchange_rate, exchange_rate_source,
    exchange_rate_timestamp, exchange_rate_target_currency_id
   )
   VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
    $14, $15, $16, $17, $18, $19)
   RETURNING transaction_id, account_id, amount, reversal_of_account_id;
  `;

  try {
    console.log(
      pc.yellow(
        `CLOSE: reversing balance ${balance} on account ${targetAccountId} against ${counterpartAccountId}`,
      ),
    );

    // Sequential rather than Promise.all: both legs share one pg client, which serialises concurrent
    // queries anyway, and interleaving them makes it unclear which leg failed.
    const targetResult = await client.query(
      insertQuery,
      Object.values(targetTransactionOption),
    );
    const counterpartResult = await client.query(
      insertQuery,
      Object.values(counterpartTransactionOption),
    );

    return [targetResult.rows[0], counterpartResult.rows[0]];
  } catch (error) {
    const messageError = `Error recording balance reversal for account ${targetAccountId}.`;
    console.error(pc.red(messageError), error);

    if (
      error.code &&
      (error.code.startsWith('23') || error.code.startsWith('22'))
    ) {
      const { code, message } = handlePostgresError(error);
      throw createError(code, message);
    }

    throw createError(500, messageError);
  }
};

export default recordBalanceReversal;
