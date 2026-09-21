// Transfers between accounts (expense, income, debt, pocket, transfer, PnL) and
// lookup of a transaction by id with its FX metadata.
import pc from 'picocolors';
import { pool } from '../../db/config/configDB.js';
import { createError, handlePostgresError } from '../../utils/errorHandling.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import {
  getExpenseConfig,
  getIncomeConfig,
  getDebtConfig,
  getTransferConfig,
  getPnLConfig,
} from '../../utils/fintrackUtils/transactionManagement/movementInputHandler.js';
import { recordTransaction } from '../../utils/fintrackUtils/transactionManagement/recordTransaction.js';
import { formatDate } from '../../utils/helpers.js';
import { getCurrencyId } from '../../utils/currencyLookup.js';
import { LIVE_ACCOUNT } from '../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import {
  dayInZone,
  earliestDatableDay,
  isCalendarDate,
  todayInZone,
} from '../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';
import { currencyAmountConversion } from '../services/fx_services/conversion/currencyAmountConversion.js';
import {
  ACCOUNTING_CURRENCY_CODE,
  BACKDATING_WINDOW_MONTHS,
} from '../config/fintrackConfig.js';
// App-wide decimal scale and rounding; not budget-specific despite the path.
import {
  money,
  toAmountString,
} from '../services/budget_services/core/money.js';
import {
  accountLedgerCteForTransaction,
} from '../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';
import { lockAndDeriveBalances } from '../../utils/fintrackUtils/accountManagement/lockAndDeriveBalances.js';
import { setAccountBalanceFromLedger } from '../../utils/fintrackUtils/accountManagement/setAccountBalanceFromLedger.js';
// Compensation account opened on demand for a PnL entry: the app's own counterparty,
// not one the owner holds, so the date guard below excludes it from the opening floor.
const INTERNAL_COUNTERPARTY_NAME = 'slack';

const FX_DEBUG_ENABLED = true; // set false to silence FX debug logging

const fxDebug = (step, data) => {
  if (!FX_DEBUG_ENABLED) return;
  console.log(`🔍 [FX DEBUG] ${step}:`, JSON.stringify(data, null, 2));
};

// Looks an account up by owner plus account id, falling back to account name only
// when no id was sent. The name branch is transitional until every caller sends an id.
export const getAccountInfo = async (
  dbClient = pool,
  { accountId = null, accountName = null, accountTypeName, userId },
) => {
  // Not truthiness: an accountId of 0 is an invalid id, not an absent one, and must
  // not fall back silently to a name lookup.
  const byId = accountId !== null && accountId !== undefined && accountId !== '';

  // Names compare in lowercase. DO NOT DROP the by-id account type predicate: transformMovementType
  // derives the movement type from the DECLARED types; without it a body naming retired pocket_saving
  // would write a pocket movement on a bank account (untested). LIVE_ACCOUNT hides closed accounts.
  const accountQuery = byId
    ? `SELECT ua.* FROM user_accounts ua
      JOIN account_types act ON ua.account_type_id = act.account_type_id
      WHERE ua.user_id = $1 AND ua.account_id = $2 AND LOWER(act.account_type_name) = LOWER($3)
      ${LIVE_ACCOUNT}`
    : `SELECT ua.* FROM user_accounts ua
      JOIN account_types act ON ua.account_type_id = act.account_type_id
      WHERE ua.user_id = $1 AND LOWER(ua.account_name) = LOWER($2) AND LOWER(act.account_type_name) = LOWER($3)
      ${LIVE_ACCOUNT}`;

  const accountInfoResult = await dbClient.query({
    text: accountQuery,
    values: [userId, byId ? accountId : accountName, accountTypeName],
  });
  return accountInfoResult.rows[0];
};

export const getAccountTypes = async (clientOrPool = null) => {
  const dbClient = clientOrPool || pool;
  const accountTypeQuery = `SELECT * FROM account_types`;
  const accountTypeResult = await dbClient.query(accountTypeQuery);
  const accountTypeArr = accountTypeResult.rows;
  return accountTypeArr;
};

export const getTransactionTypes = async (clientOrPool = null) => {
  const db = clientOrPool || pool;
  const transactionTypeQuery = `SELECT * FROM transaction_types`;
  const transactionTypeResult = await db.query(transactionTypeQuery);
  const transactionTypeArr = transactionTypeResult.rows;
  return transactionTypeArr;
};

// A transfer to or from a pocket_saving account is recorded as a 'pocket' movement.
export function transformMovementType(
  movementName,
  sourceAccountTypeName,
  destinationAccountTypeName,
) {
  if (movementName === 'transfer') {
    if (destinationAccountTypeName === 'pocket_saving') return 'pocket';

    if (sourceAccountTypeName === 'pocket_saving') return 'pocket';
  }
  return movementName;
}

// Endpoint: /api/fintrack/transaction/transfer-between-accounts?movement=<name>
export const transferBetweenAccounts = async (req, res, next) => {
  console.log(pc.magentaBright('transferBetweenAccounts'));
  const client = await pool.connect();

  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const { movement } = req.query;
    const movementName = movement === 'debts' ? 'debt' : movement; //debt movement is called as debts in frontend
    if (!movementName) {
      const message = 'movement name is required';
      console.warn(pc.magentaBright(message));
      return res.status(400).json({ status: 400, message });
    }

    if (
      ![
        'expense',
        'income',
        'investment',
        'debt',
        'pocket',
        'transfer',
        'pnl',
      ].includes(movementName)
    ) {
      const message = `movement name " ${movementName} " is not correct`;
      console.warn(pc.magentaBright(message));
      return res.status(400).json({ status: 400, message });
    }

    const movement_typesResult = await pool.query(
      `SELECT * FROM movement_types`,
    );
    const movement_typesResultExist = movement_typesResult.rows.length > 0;

    if (!movement_typesResultExist) {
      const message = 'something went wrong with the movement_types table';
      console.warn(pc.magentaBright(message));
      return res.status(400).json({ status: 400, message });
    }
    const movement_types = movement_typesResult.rows;

    // PnL movements need a compensation account, named "slack", as the
    // transaction's counterparty.
    const checkAndInsertSlackAccount = async (dbClient = null, userId) => {
      const db = dbClient || pool;
      try {
        // Match name AND type: by name alone this would capture a user's own
        // account called 'slack' and post the compensation legs into it.
        const chekAccountResult = await db.query(
          `SELECT ua.*
             FROM user_accounts ua
             JOIN account_types act ON ua.account_type_id = act.account_type_id
            WHERE ua.account_name = $1
              AND ua.user_id = $2
              AND act.account_type_name = 'boundary'
              -- No closed_at test: no path closes the compensation account, and a
              -- miss here creates a second one.
              AND ua.deleted_at IS NULL
            ORDER BY ua.account_id ASC
            LIMIT 1`,
          ['slack', userId],
        );

        if (chekAccountResult.rows.length > 0) {
          console.log('slack account already exists');
          return chekAccountResult.rows[0];
        } else {
          // Typed 'boundary' since migration 031. Resolved by name, not a hardcoded
          // id, and it throws when the catalog row is absent: account_type_id is
          // nullable, so a missing type would insert an untyped account.
          const boundaryTypeResult = await db.query(
            "SELECT account_type_id FROM account_types WHERE account_type_name = 'boundary'",
          );
          if (boundaryTypeResult.rows.length === 0) {
            throw new Error(
              "Account type 'boundary' not found: the migration chain has not reached 031",
            );
          }
          // From the configured accounting currency, not a literal id: every other
          // creation path stores it, so a hardcoded id would diverge whenever
          // ACCOUNTING_CURRENCY_CODE is not the usd default.
          const accountingCurrencyId = await getCurrencyId(
            db,
            ACCOUNTING_CURRENCY_CODE,
          );
          const insertResult = await db.query(
            'INSERT INTO user_accounts (user_id,account_name,account_type_id,currency_id,account_starting_amount,account_balance,account_start_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [
              userId,
              'slack',
              boundaryTypeResult.rows[0].account_type_id,
              accountingCurrencyId,
              0,
              0,
              new Date(),
            ],
          );
          console.log(
            'slack account created successfully',
            'account:',
            insertResult.rows[0],
          );
          return insertResult.rows[0];
        }
      } catch (error) {
        // Rethrown so the main catch block performs the ROLLBACK.
        const message = 'Error creating slack account';
        console.error(message, error);

        throw new Error(
          'Error creating/checking slack account: ' + error.message,
        );
      }
    };

    // req.body fields common to every tracker movement, shaped per movementName
    // (e.g. expense: sourceAccountTypeName 'bank', destinationAccountTypeName
    // 'category_budget', withdraw/deposit).
    const {
      note,
      amount,
      currency: currencyCode,
      type: transactionTypeName, //for pnl and debt
      accountType,
      // No separate `date` field: transactionActualDate is the only day the request carries.
    } = req.body;
    console.log(
      { movementName: movementName },
      'type',
      transactionTypeName,
      accountType,
    );
    //Store original amount and currency (as sent by frontend)
    const originalAmountValue = parseFloat(amount);
    const originalCurrencyCode = currencyCode;

    fxDebug('Datos recibidos del frontend', {
      amountRaw: req.body.amount,
      currencyCodeRaw: req.body.currency,
      originalAmountValue,
      originalCurrencyCode,
    });

    if (isNaN(originalAmountValue) || originalAmountValue <= 0) {
      const message = 'Amount must be a positive number.';
      console.warn(pc.redBright(message));
      return res.status(400).json({ status: 400, message });
    }

    const originalCurrencyId = await getCurrencyId(pool, originalCurrencyCode);
    if (!originalCurrencyId) {
      const message = `Currency ${originalCurrencyCode} not found`;
      const err = new Error(message);
      err.status = 400;
      throw err;
    }

    const accountingCurrencyId = await getCurrencyId(
      pool,
      ACCOUNTING_CURRENCY_CODE,
    );
    const accountingCurrencyCode = ACCOUNTING_CURRENCY_CODE.toUpperCase();

    fxDebug('Comparación de monedas', {
      originalCurrencyCode,
      accountingCurrency: ACCOUNTING_CURRENCY_CODE,
      necesitaConversion: originalCurrencyCode !== ACCOUNTING_CURRENCY_CODE,
    });

    // Resolved before the FX conversion because the rate depends on the day. Only
    // checks that need no account row run here; the account-opening check stays
    // inside the transaction, since an HTTP rate call there would hold it open.
    const { transactionActualDate: actualDate } = req.body;

    const timeZone = await getUserTimeZone(pool, userId);
    const requestedDay = typeof actualDate === 'string' ? actualDate.trim() : '';
    const todayForOwner = todayInZone(timeZone);

    if (requestedDay !== '') {
      if (!isCalendarDate(requestedDay)) {
        throw createError(
          400,
          `transactionActualDate must be a calendar day, YYYY-MM-DD`,
        );
      }

      if (requestedDay > todayForOwner) {
        throw createError(
          422,
          `A movement cannot be dated after today, ${todayForOwner}`,
        );
      }

      // The editing window is a whole number of calendar months ending with the
      // current one, on the owner's calendar. The floor derives from todayForOwner,
      // so no second conversion can disagree with it.
      const windowFloor = earliestDatableDay(
        todayForOwner,
        BACKDATING_WINDOW_MONTHS,
      );

      if (requestedDay < windowFloor) {
        throw createError(
          422,
          `A movement cannot be dated before ${windowFloor}`,
        );
      }
    }

    // Null for today, which routes the conversion to the current rate; a past day
    // selects the rate that was in force on it.
    const asOfDay =
      requestedDay !== '' && requestedDay < todayForOwner ? requestedDay : null;

    let convertedAmount = originalAmountValue;
    let exchangeRate = 1.0;
    let exchangeRateSource = 'identity';
    let exchangeRateTimestamp = new Date();

    if (originalCurrencyCode !== ACCOUNTING_CURRENCY_CODE) {
      fxDebug('Iniciando conversión de moneda', {
        from: originalCurrencyCode,
        to: ACCOUNTING_CURRENCY_CODE,
        amount: originalAmountValue,
      });

      const conversion = await currencyAmountConversion(
        originalAmountValue,
        originalCurrencyCode,
        ACCOUNTING_CURRENCY_CODE,
        asOfDay,
        // The zone asOfDay was decided on, so the resolver's future guard and this
        // controller's floor agree on which day it is.
        timeZone,
      );

      convertedAmount = conversion.amount.toNumber();
      exchangeRate = conversion.rate;
      // Carries the effective day on a back-dated movement, as provider@day.
      // exchange_rate_timestamp stays the real fetch instant: one column cannot
      // hold two meanings.
      exchangeRateSource = conversion.source;
      exchangeRateTimestamp = conversion.fetchedAt;
      fxDebug('Resultado de conversión', {
        from: originalCurrencyCode,
        to: ACCOUNTING_CURRENCY_CODE,
        originalAmount: originalAmountValue,
        convertedAmount,
        rate: exchangeRate,
        source: exchangeRateSource,
      });
    }
    fxDebug('Valores finales después de conversión (o sin ella)', {
      originalAmount: originalAmountValue,
      convertedAmount,
      exchangeRate,
      exchangeRateSource,
      exchangeRateTimestamp,
      monedaOriginal: originalCurrencyCode,
      monedaDestino: ACCOUNTING_CURRENCY_CODE,
    });
    // Used throughout the controller for balances, transactions and descriptions.
    let numericAmount = convertedAmount;
    let currencyIdReq = accountingCurrencyId;

    // Not every tracker movement shares one input shape, so the config
    // strategy is picked by movementName.
    const config = {
      expense: getExpenseConfig(req.body),
      income: getIncomeConfig(req.body),
      transfer: getTransferConfig(req.body),
      debt: getDebtConfig(req.body),
      pnl: getPnLConfig(req.body),
    }[movementName];
    // Renamed because sourceAccountId and destinationAccountId are declared
    // further down for the ids of the rows found; these are what was requested.
    const {
      sourceAccountId: requestedSourceAccountId,
      sourceAccountName,
      sourceAccountTypeName,
      sourceAccountTransactionType,

      destinationAccountId: requestedDestinationAccountId,
      destinationAccountName,
      destinationAccountTypeName,
      destinationAccountTransactionType,
    } = config;

    // BUSINESS RULE: no movement between an expense category and an income
    // source, in either direction. Refused before the transaction opens; the
    // transfer screen disables the pair, and this guards any other client.
    const pairsCategoryWithIncomeSource =
      (sourceAccountTypeName === 'category_budget' &&
        destinationAccountTypeName === 'income_source') ||
      (sourceAccountTypeName === 'income_source' &&
        destinationAccountTypeName === 'category_budget');

    if (pairsCategoryWithIncomeSource) {
      throw createError(
        400,
        'A transfer between an expense category and an income source is not allowed',
      );
    }

    const movement_type_name = transformMovementType(
      movementName,
      sourceAccountTypeName,
      destinationAccountTypeName,
    );
    const movement_type_idResult = movement_types.filter(
      (mov) => mov.movement_type_name === movement_type_name,
    );
    if (!movement_type_idResult || movement_type_idResult.length === 0) {
      const message = `movement type id of ${movement_type_name} was not found.`;
      const err = new Error(message);
      err.status = 400;
      throw err;
    }
    const movement_type_id = movement_type_idResult[0].movement_type_id;
    const transactionsTypes = await getTransactionTypes(client);

    const sourceTransactionTypeId = transactionsTypes.filter(
      (type) => type.transaction_type_name === sourceAccountTransactionType,
    )[0].transaction_type_id;

    const destinationTransactionTypeId = transactionsTypes.filter(
      (type) =>
        type.transaction_type_name === destinationAccountTransactionType,
    )[0].transaction_type_id;
    const accountTypes = await getAccountTypes(client);

    await client.query('BEGIN');

    if (movementName === 'pnl') {
      await checkAndInsertSlackAccount(client, userId);
    }

    const sourceAccountInfo = await getAccountInfo(client, {
      accountId: requestedSourceAccountId,
      accountName: sourceAccountName,
      accountTypeName: sourceAccountTypeName,
      userId,
    });

    if (!sourceAccountInfo) {
      // Quote the identifier searched with: the row is undefined here, so
      // dereferencing it would turn this 404 into a 500.
      throw createError(
        404,
        `Origin account ${requestedSourceAccountId ?? sourceAccountName} not found`,
      );
    }
    const destinationAccountInfo = await getAccountInfo(client, {
      accountId: requestedDestinationAccountId,
      accountName: destinationAccountName,
      accountTypeName: destinationAccountTypeName,
      userId,
    });
    if (!destinationAccountInfo) {
      // Same as the origin branch above.
      throw createError(
        404,
        `Destination account ${requestedDestinationAccountId ?? destinationAccountName} not found`,
      );
    }

    // The half of the date validation that needs account rows: the floor is the
    // later of the two accounts' opening days, read inside the open transaction.
    // The other date checks already ran before the conversion.
    let transaction_actual_date = new Date();

    if (requestedDay !== '') {
      // Calendar days, not instants: account_start_date carries any time of day, so a 20:00 opening
      // would refuse a movement on its own opening day once that day is anchored at noon.
      // The internal counterparty is excluded: born with start date = now, it would refuse back-dated PnL.
      const openings = [sourceAccountInfo, destinationAccountInfo]
        .filter((account) => account.account_name !== INTERNAL_COUNTERPARTY_NAME)
        .map((account) => [
          account.account_name,
          dayInZone(account.account_start_date, timeZone),
        ]);

      if (openings.length > 0) {
        const [openedName, openedDay] = openings.reduce((later, current) =>
          current[1] > later[1] ? current : later,
        );

        if (requestedDay < openedDay) {
          throw createError(
            422,
            `A movement cannot be dated before ${openedName} was opened on ${openedDay}`,
          );
        }
      }

      // Composed once in SQL and shared by both legs, so one entry cannot land in two months.
      // A past day is anchored at noon in the owner's zone; today keeps the real instant. A row valued at
      // a past rate must carry a past instant, or it holds one day's rate under another day's date.
      if (requestedDay < todayForOwner) {
        const composed = await client.query({
          text: `SELECT (($1::date + TIME '12:00') AT TIME ZONE $2) AS instant`,
          values: [requestedDay, timeZone],
        });
        transaction_actual_date = composed.rows[0].instant;
      }
    }
    const sourceAccountTypeId = accountTypes.filter(
      (type) => type.account_type_name === sourceAccountTypeName,
    )[0].account_type_id;

    console.log(
      '🚀 ~ transferBetweenAccounts ~ sourceAccountTypeId:',
      sourceAccountTypeId,
    );
    // Refused as source: bank, investment, category_budget, pocket_saving going to bank, investment or debt.
    // Allowed as source: slack, income_source, debtor; category_budget <-> income_source is blocked.
    // No pocket rule: since migration 020 a pocket commit writes an allocation, never a transfer.
    console.log('---FK DEBUGGING / DEBUG DE LLAVES FORÁNEAS ---');
    console.log('User ID:', userId);
    console.log('Currency ID FOUND:', currencyIdReq);
    console.log('Account Type ID :', accountType);
    console.log('Movement Type ID (Hardcoded):', 8);
    console.log('---------------------------------');
    // PnL movements have no explicit counter account, so the compensation
    // account is (re-)ensured here too.
    if (movementName === 'pnl') {
      await checkAndInsertSlackAccount(client, userId);
    }
    // Both accounts are locked and derived before anything is decided or
    // written, so the ceiling this check enforces is the one the ledger holds.
    const ledgerBalances = await lockAndDeriveBalances(client, userId, [
      sourceAccountInfo.account_id,
      destinationAccountInfo.account_id,
    ]);

    // The exact ledger figure, from the NUMERIC text pg returns: a float sum of
    // many rows can land either side of the amount in the last bit, refusing a
    // movement the ledger covers or admitting one it does not.
    const sourceLedgerBalance = money(
      ledgerBalances.get(sourceAccountInfo.account_id),
    );

    if (
      sourceLedgerBalance.lessThan(money(numericAmount)) &&
      // No name exemption for the compensation account: it is typed 'boundary'
      // (since 031) and never reaches these branches, and a name test would
      // exempt a user's OWN bank account called 'slack' from the funds check.
      (sourceAccountTypeName === 'bank' ||
        sourceAccountTypeName === 'investment' ||
        sourceAccountTypeName === 'pocket_saving' ||
        sourceAccountTypeName === 'category_budget') //reversal of an expense
    ) {
      // The figure the refusal quotes is the one the refusal was decided on.
      const message = `Not enough funds in "${sourceAccountInfo.account_name.toUpperCase()}" (${accountingCurrencyCode} ${toAmountString(sourceLedgerBalance)})`;

      console.warn(pc.magentaBright(message));

      // Throwing, not responding: a response here hands the connection back to
      // the pool with the transaction still open. The catch rolls it back.
      throw createError(400, message);
    }
    // Stored balances are NOT written here: they are re-derived from the ledger
    // once both movement rows exist, since a derivation now would store the
    // balance the accounts held before this movement.
    const sourceAccountId =sourceAccountInfo.account_id;
    const destinationAccountId = destinationAccountInfo.account_id;
    const expenseReversalNotePrefix =
      sourceAccountTypeName === 'category_budget' ? 'Expense Reversal. ' : '';

    const incomeReversalNotePrefix =
      destinationAccountTypeName === 'income_source' ? 'Income Reversal. ' : '';

    // Both legs state the same numericAmount at two decimals, so one transfer never shows two figures.
    // Nothing parses the digits back (extractNoteFromDescription splits on 'Transaction: ').
    // The 2 decimals are hardcoded app-wide; per-currency precision is a separate decision.
    const transactionDescription = `${expenseReversalNotePrefix}${incomeReversalNotePrefix}${note ? note + '.' : ''}Transaction: ${sourceAccountTransactionType}. Transfered ${numericAmount.toFixed(2)} ${accountingCurrencyCode} from account "${sourceAccountInfo.account_name} #${sourceAccountInfo.account_id}" (${sourceAccountTypeName}) credited to "${destinationAccountInfo.account_name} # ${destinationAccountInfo.account_id}" (${destinationAccountTypeName}). Date: ${formatDate(transaction_actual_date)}`;

    fxDebug('FX metadata que se guardará en la transacción (source)', {
      original_amount: originalAmountValue,
      original_currency_id: originalCurrencyId,
      original_currency_code: originalCurrencyCode,
      exchange_rate: exchangeRate,
      exchange_rate_source: exchangeRateSource,
      exchange_rate_timestamp: exchangeRateTimestamp,
      exchange_rate_target_currency_id: accountingCurrencyId,
    });

    const sourceTransactionOption = {
      userId,
      description: transactionDescription,
      movement_type_id,
      status: 'complete',
      amount: -numericAmount,
      currency_id: currencyIdReq,
      account_id: sourceAccountId,
      source_account_id: sourceAccountId,
      transaction_type_id: sourceTransactionTypeId, //withdraw or lend
      destination_account_id: destinationAccountId,
      transaction_actual_date,

      original_amount: originalAmountValue,
      original_currency_id: originalCurrencyId,
      exchange_rate: exchangeRate,
      exchange_rate_source: exchangeRateSource,
      exchange_rate_timestamp: exchangeRateTimestamp,
      exchange_rate_target_currency_id: accountingCurrencyId,
    };

    await recordTransaction(client, sourceTransactionOption);

    const transactionDescriptionReceived = `${incomeReversalNotePrefix}${expenseReversalNotePrefix}${note ? note + '.' : ''}Transaction: ${destinationAccountTransactionType}. Received ${numericAmount.toFixed(2)} ${accountingCurrencyCode} in account "${destinationAccountInfo.account_name} (${destinationAccountTypeName}) # ${destinationAccountInfo.account_id}, from "${sourceAccountInfo.account_name}" # ${sourceAccountInfo.account_id} (${sourceAccountTypeName}). Date: ${formatDate(transaction_actual_date)}`;

    const destinationTransactionOption = {
      userId,
      description: transactionDescriptionReceived,
      movement_type_id,
      status: 'complete',
      amount: numericAmount,
      currency_id: currencyIdReq,
      account_id: destinationAccountId,
      source_account_id: sourceAccountId,
      transaction_type_id: destinationTransactionTypeId, //withdraw or borrow
      destination_account_id: destinationAccountId,
      transaction_actual_date,
      original_amount: originalAmountValue,
      original_currency_id: originalCurrencyId,
      exchange_rate: exchangeRate,
      exchange_rate_source: exchangeRateSource,
      exchange_rate_timestamp: exchangeRateTimestamp,
      exchange_rate_target_currency_id: accountingCurrencyId,
    };
    await recordTransaction(client, destinationTransactionOption);

    // Stored balances re-derived now that both rows are in the ledger. The accounts
    // were locked in ascending id order at the top of this transaction, so these
    // statements see every movement a competitor committed while this one waited.
    await setAccountBalanceFromLedger(client, sourceAccountId, userId);

    await setAccountBalanceFromLedger(client, destinationAccountId, userId);

    const data = {
      movement: { movement_type_name, movement_type_id },
      source: {
        account_info: {
          account_name: sourceAccountInfo.account_name,
          account_type: sourceAccountTypeName,
          amount: numericAmount,
          currency: accountingCurrencyCode,
        },
        balance_updated: {
          amount_transaction: sourceTransactionOption.amount,
          account_balance: sourceTransactionOption.account_balance,
        },
        transaction_info: {
          transaction_type: sourceAccountTransactionType,
          transaction_description: transactionDescription,
          transaction_id: sourceTransactionOption.transaction_id,
          transaction_date: transaction_actual_date,
        },
      },

      destination: {
        account_info: {
          account_name: destinationAccountInfo.account_name,
          account_type: destinationAccountTypeName,
          amount: numericAmount,
          currency: accountingCurrencyCode,
        },
        balance_updated: {
          amount_transaction: destinationTransactionOption.amount,
          account_balance: destinationTransactionOption.account_balance,
        },
        transaction_info: {
          transaction_type: destinationAccountTransactionType,
          transaction_description: transactionDescriptionReceived,
          transaction_id: destinationTransactionOption.transaction_id,
          transaction_date: transaction_actual_date,
        },
      },
    };
    const message = 'Transaction successfully completed.';
    console.log(pc.magentaBright(message));
    await client.query('COMMIT');
    return res.status(200).json({ status: 200, message, data });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof Error) {
      console.error(
        pc.red('Error during transfer'),
        pc.magentaBright(error.stack || error.message),
        error,
      );
    } else {
      console.error(
        pc.red('Error during transfer'),
        pc.magentaBright('Unknown error occurred'),
      );
    }
    const { code, message } = handlePostgresError(error);
    next(createError(code, message));
  } finally {
    client.release();
  }
};

// Endpoint GET /api/fintrack/transactions/:id
export async function getTransactionById(req, res, next) {
  const client = await pool.connect();
  try {
    const { transactionId } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const result = await client.query(
      `WITH ${accountLedgerCteForTransaction('$1', '$2')}
      SELECT
       ua.account_name,
        t.transaction_id,
        t.user_id,
        t.description,
        t.amount,
        t.movement_type_id,
        t.transaction_type_id,
        trt.transaction_type_name, 
        t.currency_id,
        t.account_id,
        -- Derived from the ledger under the stored column's name: this detail shows a
        -- balance with no series around it, so a stale stored value would go unnoticed.
        al.balance AS account_balance_after_tr,
        t.source_account_id,
        t.destination_account_id,
        t.status,
        t.transaction_actual_date,
        t.created_at,
        t.updated_at,
        t.original_amount,
        t.original_currency_id,
        t.exchange_rate,
        t.exchange_rate_source,
        t.exchange_rate_timestamp,
        t.exchange_rate_target_currency_id,
        c.currency_code,
        oc.currency_code AS original_currency_code,
        act.account_type_name,
        mt.movement_type_name,
        sa.account_name AS source_account_name,
        sat.account_type_name AS source_account_type,
        da.account_name AS destination_account_name,
        dat.account_type_name AS destination_account_type,
        -- The owner's calendar, not the reader's browser: a transaction stamped
        -- at 23:40 in Bogota must not read as the next day from another device.
        (t.transaction_actual_date AT TIME ZONE COALESCE(u.timezone, 'UTC'))::date::text AS transaction_local_date,
        to_char(
          t.transaction_actual_date AT TIME ZONE COALESCE(u.timezone, 'UTC'),
          'HH24:MI'
        ) AS transaction_local_time

      FROM transactions t

      JOIN account_ledger al ON al.transaction_id = t.transaction_id

      LEFT JOIN currencies c ON t.currency_id = c.currency_id
      LEFT JOIN currencies oc ON t.original_currency_id = oc.currency_id
      LEFT JOIN user_accounts ua ON t.account_id = ua.account_id
      LEFT JOIN transaction_types trt ON trt.transaction_type_id = t.transaction_type_id
      LEFT JOIN movement_types mt ON mt.movement_type_id = t.movement_type_id
      LEFT JOIN account_types act ON act.account_type_id = ua.account_type_id

      -- The counterpart accounts of a transfer. Both carry user_id in the join
      -- and not only the id, so a foreign account can never surface its name.
      LEFT JOIN user_accounts sa ON sa.account_id = t.source_account_id AND sa.user_id = t.user_id
      LEFT JOIN account_types sat ON sat.account_type_id = sa.account_type_id
      LEFT JOIN user_accounts da ON da.account_id = t.destination_account_id AND da.user_id = t.user_id
      LEFT JOIN account_types dat ON dat.account_type_id = da.account_type_id

      -- Joined instead of read with getUserTimeZone: the zone is one column of a
      -- row this statement already reaches, and a second round trip to resolve it
      -- is latency once the database is remote.
      LEFT JOIN users u ON u.user_id = t.user_id

      WHERE t.transaction_id = $1 AND t.user_id = $2`,
      [transactionId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const transaction = result.rows[0];
    console.log('🔍 [FX DEBUG] getTransactionById - parsed transaction:', {
      transaction_id: transaction.transaction_id,
      transaction_type_name: transaction.transaction_type_name,
      original_amount: transaction.original_amount,
      original_amount_parsed: transaction.original_amount
        ? parseFloat(transaction.original_amount)
        : null,
      exchange_rate: transaction.exchange_rate,
      exchange_rate_parsed: transaction.exchange_rate
        ? parseFloat(transaction.exchange_rate)
        : null,
      original_currency_code: transaction.original_currency_code,
    });
    res.json({
      transaction_id: transaction.transaction_id,
      description: transaction.description,
      amount: parseFloat(transaction.amount),
      currency_code: transaction.currency_code,
      original_amount: transaction.original_amount
        ? parseFloat(transaction.original_amount)
        : null,
      original_currency_code: transaction.original_currency_code,
      exchange_rate: transaction.exchange_rate
        ? parseFloat(transaction.exchange_rate)
        : null,
      exchange_rate_source: transaction.exchange_rate_source,
      exchange_rate_timestamp: transaction.exchange_rate_timestamp,
      transaction_actual_date: transaction.transaction_actual_date,
      transaction_local_date: transaction.transaction_local_date,
      transaction_local_time: transaction.transaction_local_time,
      account_id: transaction.account_id,
      account_name: transaction.account_name,
      account_type_name: transaction.account_type_name,
      movement_type_id: transaction.movement_type_id,
      movement_type_name: transaction.movement_type_name,
      transaction_type_id: transaction.transaction_type_id,
      transaction_type_name: transaction.transaction_type_name,
      // Ids are returned beside the names so the consumer can link to the accounts.
      source_account_id: transaction.source_account_id,
      source_account_name: transaction.source_account_name,
      source_account_type: transaction.source_account_type,
      destination_account_id: transaction.destination_account_id,
      destination_account_name: transaction.destination_account_name,
      destination_account_type: transaction.destination_account_type,
      status: transaction.status,
      account_balance_after_tr: parseFloat(
        transaction.account_balance_after_tr,
      ),
    });
  } catch (error) {
    console.error('Error fetching transaction by ID:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}
