import pc from 'picocolors';
import { createError, handlePostgresError } from '../../errorHandling.js';
import { getCurrencyId } from '../../currencyLookup.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../fintrack_api/config/fintrackConfig.js';
import { RTA_ANNULMENT_TARGET_PREFIX } from './annulmentRowIdentity.js';
import {
  DEFAULT_EXCHANGE_RATE,
  DEFAULT_EXCHANGE_RATE_SOURCE,
} from '../../../fintrack_api/services/fx_services/core/fxConfig.js';

// Re-exported so the overview repositories that still import the prefix from here keep working.
export { RTA_ANNULMENT_TARGET_PREFIX } from './annulmentRowIdentity.js';

/*
 * RTA (Reverse Target Account): undoes the financial impact a deleted "Target" account had on other
 * accounts. Example: a target whose original movements were Slack -> Client A (+100 profit) and
 * Client B -> Slack (-50 loss) is undone by Client A -> Slack (-100) and Slack -> Client B (+50).
 */
// The overview repositories (investment, monthly, transaction) filter on the prefix defined in
// annulmentRowIdentity.js. Changing it breaks them silently: annulment rows would count as ordinary
// activity, and on profit and loss a single leg would enter the realised total as a gain.

// Which leg of the annulment pair a description is written for. The comparison below is exact, so a
// misspelled literal would fall through to the counterpart branch and mislabel the row.
const PERSPECTIVE_AFFECTED = 'affected';
const PERSPECTIVE_COUNTERPART = 'counterpart';

/**
 * Builds the description of one annulment leg, recorded as a profit-and-loss movement.
 * @param {boolean} isProfit - True when the adjustment credits the affected account (adjustment > 0).
 * @param {number} amount - Absolute value of the adjustment.
 * @param {string} perspective - PERSPECTIVE_AFFECTED or PERSPECTIVE_COUNTERPART.
 */
function buildAnnulmentDescription(
  isProfit,
  amount,
  currencyCode,
  perspective,
  affectedAccountName,
  targetAccountName,
) {
  // The affected leg cancels the NET prior loss or gain the target caused; the wording names that prior
  // effect, not this leg's own deposit or withdraw type.
  const priorNetEffect = isProfit ? 'net loss' : 'net gain';
  const sign = isProfit ? '+' : '-';
  const prefix = `${RTA_ANNULMENT_TARGET_PREFIX}${targetAccountName}).`;
  return perspective === PERSPECTIVE_AFFECTED
    ? `${prefix}Correction in ${affectedAccountName}: ${sign}${amount} ${currencyCode}, canceling the prior ${priorNetEffect} caused by ${targetAccountName}. For deletion of ${targetAccountName} account.`
    : `${prefix}Counterpart Adjustment: ${isProfit ? '-' : '+'}${amount} ${currencyCode} from ${affectedAccountName}. For deletion of ${targetAccountName} account.`; // The Slack account registers the opposite sign
}
/**
 * Records the two entries (affected account and Slack account) that annul a target account's financial
 * impact, within the caller's transaction.
 * @param {object} client - The active transactional PostgreSQL client.
 * @returns {Promise<object[]>} The two inserted transaction records, affected account first.
 */
export const recordAnnulmentTransaction = async (client, annulmentData) => {
  const {
    userId,
    affectedAccountId,
    affectedAccountName,
    slackAccountId,
    adjustmentAmount, // The signed value of the net impact (e.g.-50 or +120)
    currencyId,
    currencyCode,
    targetAccountName,
    pnlMovementTypeId,
    depositTypeId,
    withdrawTypeId,
    transactionDate,
  } = annulmentData;

  // A positive adjustment credits the affected account to cancel a prior net loss; a negative one
  // cancels a prior net gain.
  const isProfit = adjustmentAmount > 0;
  const absoluteAmount = Math.abs(adjustmentAmount);

  // FX provenance is set explicitly: the conversion is a no-op, but the column defaults claim
  // original_amount 0 and original_currency_id 1, which is false for most adjustments.
  // getCurrencyId queries via this client when the catalog is not loaded, so scripts work without a boot.
  const accountingCurrencyId = await getCurrencyId(
    client,
    ACCOUNTING_CURRENCY_CODE,
  );
  const exchangeRateTimestamp = new Date();

  // Double entry: if the affected account gains, Slack loses (source = Slack, destination = affected).
  const sourceAccountId = isProfit ? slackAccountId : affectedAccountId;
  const destinationAccountId = isProfit ? affectedAccountId : slackAccountId;

  const affectedTransactionTypeId = isProfit ? depositTypeId : withdrawTypeId;
  const slackTransactionTypeId = isProfit ? withdrawTypeId : depositTypeId;

  const affectedTransactionOption = {
    userId,
    description: buildAnnulmentDescription(
      isProfit,
      absoluteAmount,
      currencyCode,
      PERSPECTIVE_AFFECTED,
      affectedAccountName,
      targetAccountName,
    ),
    movement_type_id: pnlMovementTypeId,
    status: 'complete',
    amount: adjustmentAmount, // Signed: + if deposit, - if withdraw
    currency_id: currencyId,
    account_id: affectedAccountId,
    source_account_id: sourceAccountId,
    transaction_type_id: affectedTransactionTypeId,
    destination_account_id: destinationAccountId,
    transaction_actual_date: transactionDate,
    // Placeholder: readers derive the balance from the ledger. The key stays because the insert
    // passes Object.values, so its position is the twelfth bind.
    account_balance: 0.0,
    // Key order is the bind order: keep these six last, in the order of the columns below.
    original_amount: adjustmentAmount,
    original_currency_id: currencyId,
    exchange_rate: DEFAULT_EXCHANGE_RATE,
    exchange_rate_source: DEFAULT_EXCHANGE_RATE_SOURCE,
    exchange_rate_timestamp: exchangeRateTimestamp,
    exchange_rate_target_currency_id: accountingCurrencyId,
  };

  const slackTransactionOption = {
    userId,
    description: buildAnnulmentDescription(
      isProfit,
      absoluteAmount,
      currencyCode,
      PERSPECTIVE_COUNTERPART,
      affectedAccountName,
      targetAccountName,
    ),
    movement_type_id: pnlMovementTypeId,
    status: 'complete',
    amount: -adjustmentAmount, // Opposite sign to the affected entry
    currency_id: currencyId,
    account_id: slackAccountId,
    source_account_id: sourceAccountId,
    transaction_type_id: slackTransactionTypeId,
    destination_account_id: destinationAccountId,
    transaction_actual_date: transactionDate,
    // Same placeholder and bind-order rules as the affected entry above.
    account_balance: 0.0,
    original_amount: -adjustmentAmount,
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
    transaction_actual_date, account_balance_after_tr,
    original_amount, original_currency_id, exchange_rate, exchange_rate_source,
    exchange_rate_timestamp, exchange_rate_target_currency_id
   )
   VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18)
   RETURNING transaction_id, account_id, amount;
  `;

  try {
    console.log(
      pc.yellow(
        `RTA: Recording adjustment for affected account ${affectedAccountId}`,
      ),
    );

    // Both legs or neither, in the caller's transaction. The affected account can itself be the compensation
    // account, so both rows land on it, equal and opposite. Before migration 031 it is typed bank and the
    // Overview bank balance has no annulment filter: the figure is right only because they cancel.
    const [resultInsertAffectedAccount, resultInsertSlackAccount] =
      await Promise.all([
        client.query(insertQuery, Object.values(affectedTransactionOption)),

        client.query(insertQuery, Object.values(slackTransactionOption)),
      ]);

    const insertedTransactions = [
      resultInsertAffectedAccount.rows[0],
      resultInsertSlackAccount.rows[0],
    ];

    console.log('insertedTransactions', insertedTransactions);

    return insertedTransactions;
  } catch (error) {
    // Rethrown as a standard error so the caller's transaction rolls back.
    const messageError = `Error recording RTA annulment transactions for account ${affectedAccountId}.`;
    console.error(pc.red(messageError), error);

    if (error instanceof Error) {
      if (
        error.code &&
        (error.code.startsWith('23') || error.code.startsWith('22'))
      ) {
        // PostgreSQL codes 23xxx, 22xxx
        const { code, message } = handlePostgresError(error);
        throw createError(code, message);
      } else {
        throw createError(500, `RTA Annulment failed: ${error.message}`);
      }
    } else {
      throw createError(
        500,
        `Unexpected error during RTA annulment: ${String(error)}`,
      );
    }
  }
};
