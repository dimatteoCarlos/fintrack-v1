// Account creation handlers: createBasicAccount and createDebtorAccount.

import pc from 'picocolors';
import { pool } from '../../db/config/configDB.js';
import { createError, handlePostgresError } from '../../utils/errorHandling.js';

import { requireUserId } from '../../utils/authUtils/requireUserId.js';

import {
  formatDate,
  formatDateToDDMMYYYY,
  normalizePersonName,
} from '../../utils/helpers.js';
import { recordTransaction } from '../../utils/fintrackUtils/transactionManagement/recordTransaction.js';
import { checkAndInsertAccount } from '../../utils/fintrackUtils/accountManagement/checkAndInsertAccount.js';
import {
  verifyAccountExistence,
  verifyAccountExists,
} from '../../utils/fintrackUtils/accountManagement/verifyAccountExistence.js';
import { setAccountBalanceFromLedger } from '../../utils/fintrackUtils/accountManagement/setAccountBalanceFromLedger.js';
import { lockAndDeriveBalances } from '../../utils/fintrackUtils/accountManagement/lockAndDeriveBalances.js';
import { insertAccount } from '../../utils/fintrackUtils/accountManagement/insertAccount.js';
import { getTransactionTypeId } from '../../utils/fintrackUtils/accountDataRetrieval/getTransactionTypeId.js';
import { assertUserCreatableAccountType } from '../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';

import { determineSourceAndDestinationAccounts } from '../../utils/fintrackUtils/accountManagement/determineSourceAndDestinationAccounts.js';
import { prepareTransactionOption } from '../../utils/fintrackUtils/transactionManagement/prepareTransactionOption.js';

import { ACCOUNTING_CURRENCY_CODE } from '../config/fintrackConfig.js';
import { getCurrencyId } from '../../utils/currencyLookup.js';
import { currencyAmountConversion } from '../services/fx_services/conversion/currencyAmountConversion.js';

import { buildFxMetadata } from '../../utils/fintrackUtils/transactionManagement/fxMetadataHelper.js';

import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import {
  rateDayForOpening,
  resolveOpeningDay,
} from '../../utils/fintrackUtils/date-utils/resolveOpeningDay.js';

// POST /api/fintrack/account/new_account/:account_type_name
// Only for bank, income_source and investment accounts; cash-like accounts are created as bank.

export const createBasicAccount = async (req, res, next) => {
  // Opening movement: movement type 8 (account-opening), transaction type deposit.
  console.log(pc.blueBright('createBasicAccount'));

  const client = await pool.connect();

  try {
    const { userId } = req.user;
    if (!userId) {
      const message = 'User ID is required';
      console.warn(pc.blueBright(message));
      return res.status(400).json({ status: 400, message });
    }
    const {
      type: account_type_name,
      name: newAccountName,
      currency: currency_code,
      amount,
      date,
      transactionActualDate,
    } = req.body;
    // The URL segment must match the account type sent in the body.
    const typeAccountRequested = req.originalUrl.split('/').pop().split('?')[0];

    if (account_type_name) {
      const checkTypeCoherence = typeAccountRequested === account_type_name;
      if (!checkTypeCoherence || !typeAccountRequested) {
        const message = `Check coherence between account type requested on url: ${typeAccountRequested.toUpperCase()} vs account type entered: ${account_type_name.toUpperCase()}`;
        console.warn('Warning:', pc.cyanBright(message));
        throw new Error(message);
      }
      // The URL fixes the type; this keeps a route added later from reaching 'boundary'.
      assertUserCreatableAccountType(account_type_name, 'type');
    }
    const transaction_actual_date =
      !transactionActualDate || transactionActualDate == ''
        ? new Date()
        : transactionActualDate;

    const account_start_date =
      date && date !== ''
        ? date
        : !transactionActualDate || transactionActualDate == ''
          ? new Date()
          : transactionActualDate;

    // The opening must fall in the current month, like a movement. Validated against the
    // value the row will carry, not req.body.date, so the two cannot disagree.
    const openingTimeZone = await getUserTimeZone(client, userId);
    const openingDay = resolveOpeningDay(account_start_date, openingTimeZone);
    const openingRateDay = rateDayForOpening(openingDay, openingTimeZone);

    if (amount < 0) {
      const message = 'Amount must be >= 0. Tray again!';
      console.warn(pc.redBright(message));
      return res.status(400).json({ status: 400, message });
    }

    if (!account_type_name || !currency_code || !newAccountName) {
      const message =
        'Currency_code, account name and account type name fields are required';
      console.warn(pc.blueBright(message));
      return res.status(400).json({ status: 400, message });
    }

    const accountTypeQuery = `SELECT * FROM account_types`;

    const accountTypeResult = await pool.query(accountTypeQuery);

    const accountTypeArr = accountTypeResult.rows;

    const accountTypeIdReqObj = accountTypeArr.filter(
      (type) => type.account_type_name == account_type_name.trim(),
    )[0];
    const accountTypeIdReq = accountTypeIdReqObj.account_type_id;
    console.log('🚀 ~ createAccount ~ account_type_id:', accountTypeIdReq);
    // Throws when the name is taken, so the FX conversion below is never reached;
    // the return value is unused.
    await verifyAccountExistence(
      client,
      userId,
      newAccountName,
      account_type_name,
    );
    const currencyQuery = `SELECT * FROM currencies`;
    const currencyResult = await pool.query(currencyQuery);
    const currencyArr = currencyResult?.rows;
    const currencyIdReq = currencyArr.filter(
      (currency) => currency.currency_code === currency_code,
    )[0].currency_id;
    console.log('🚀 ~ createBasicAccount ~ currencyIdReq:', currencyIdReq);
    const newaccount_starting_amount = amount
      ? Math.abs(parseFloat(amount))
      : 0.0;

    const isTransfer = newaccount_starting_amount !== 0;

    const originalCurrencyId = currencyIdReq;
    const accountingCurrencyId = await getCurrencyId(
      pool,
      ACCOUNTING_CURRENCY_CODE,
    );

    let convertedAmount = newaccount_starting_amount;
    let exchangeRate = 1.0;
    let exchangeRateSource = 'identity';
    let exchangeRateTimestamp = new Date();

    if (currency_code !== ACCOUNTING_CURRENCY_CODE) {
      // Valued on the opening day, not the submit day. A day no source can price is
      // refused with a 422 by the resolver, never valued at today's rate.
      const conversion = await currencyAmountConversion(
        newaccount_starting_amount,
        currency_code,
        ACCOUNTING_CURRENCY_CODE,
        openingRateDay,
        openingTimeZone,
      );

      convertedAmount = conversion.amount.toNumber();
      exchangeRate = conversion.rate;
      exchangeRateSource = conversion.source;
      exchangeRateTimestamp = conversion.fetchedAt;
    }
    const newAccountBalance = convertedAmount;

    const fxMetadata = await buildFxMetadata(
      newaccount_starting_amount,
      originalCurrencyId,
      pool,
      {
        exchangeRate,
        exchangeRateSource,
        exchangeRateTimestamp,
      },
    );
    await client.query('BEGIN');
    let transactionType = 'account-opening';
    let counterTransactionType = 'account-opening';

    if (account_type_name === 'bank' || account_type_name === 'investment') {
      transactionType = 'deposit';
      counterTransactionType = 'withdraw';
    }

    const counterAccountInfo = await checkAndInsertAccount(
      client,
      userId,
      'slack',
    );

    const counterAccountTransactionAmount = -convertedAmount; // always a withdraw

    // The compensation account is locked and its balance derived from the ledger like any
    // account a movement touches. No funds check: it is the one account allowed to overdraft.
    // The balance must still be the ledger's, since the opening row states it in the audit trail.
    const counterAccountId = counterAccountInfo.account.account_id;

    const ledgerBalances = await lockAndDeriveBalances(client, userId, [
      counterAccountId,
    ]);

    const newCounterAccountBalance =
      parseFloat(ledgerBalances.get(counterAccountId)) - convertedAmount;

    const transactionTypeDescriptionIds = await getTransactionTypeId(
      client,
      transactionType,
      counterTransactionType,
    );
    const { transaction_type_id, countertransaction_type_id } =
      transactionTypeDescriptionIds;

    const counterTransactionDescription = `Transaction: ${counterTransactionType}. Account ${counterAccountInfo.account.account_name} (boundary, ID: ${counterAccountInfo.account.account_id}). Amount:${counterAccountTransactionAmount} ${currency_code}. Reference: ${newAccountName}). Date: ${formatDateToDDMMYYYY(transaction_actual_date)}`;

    const slackCounterAccountInfo = {
      user_id: userId,
      description: counterTransactionDescription,
      transaction_type_id: countertransaction_type_id,
      transaction_type_name: counterTransactionType,
      amount: parseFloat(counterAccountTransactionAmount, 2),
      currency_id: accountingCurrencyId,
      account_id: counterAccountInfo.account.account_id,
      transaction_actual_date: transaction_actual_date,
      currency_code,
      account_name: counterAccountInfo.account.account_name,
      account_type_name: 'boundary',
      account_type_id: counterAccountInfo.account.account_type_id,
      account_balance: parseFloat(newCounterAccountBalance),
      ...fxMetadata,
    };

    // The funding account's stored balance is written below, after the movement rows
    // exist, so it reflects what the account gave away.

    const { account_basic_data } = await insertAccount(
      client,
      userId,
      newAccountName,
      accountTypeIdReq,
      accountingCurrencyId,
      newAccountBalance, //converted amount
      newAccountBalance,
      account_start_date ?? transaction_actual_date,
    );

    const account_id = account_basic_data.account_id;

    const transactionDescription = `Transaction: ${transactionType}. Account: ${newAccountName}. Type: ${account_type_name}. Initial-(${transactionType}). Amount: ${newaccount_starting_amount} ${currency_code}. Date: ${formatDateToDDMMYYYY(transaction_actual_date)}`;

    const message = `${newAccountName} account of type ${account_type_name} with number ${account_id} was successfully created `;

    const newAccountInfo = {
      user_id: userId,
      description: transactionDescription,
      transaction_type_id,
      transaction_type_name: transactionType,
      amount: convertedAmount,
      currency_id: accountingCurrencyId,
      account_id: account_basic_data.account_id,
      // This leg is the account's own opening row; the counter leg below is not.
      opening_for_account_id: account_basic_data.account_id,
      transaction_actual_date: transaction_actual_date,
      currency_code,
      account_name: newAccountName,
      account_type_name,
      account_type_id: account_basic_data.account_type_id,
      account_balance: newAccountBalance,
      ...fxMetadata,
    };

    // NULL when the account opens at zero: no money moved, so there is no
    // counterpart leg to name. Same rule as determineSourceAndDestinationAccounts.js,
    // applied here because this path resolves the pair inline instead of through
    // that shared helper.
    let destination_account_id = null,
      source_account_id = null;

    if (isTransfer) {
      destination_account_id = newAccountInfo.account_id;
      source_account_id = counterAccountInfo.account.account_id;
    }

    // Movement type 8 (account-opening); transaction type ids 2 (deposit) or 5 (account-opening).
    const movement_type_id = 8;
    const transactionOption = prepareTransactionOption(
      newAccountInfo,
      source_account_id,
      destination_account_id,
      movement_type_id,
    );

    const recordTransactionInfo = await recordTransaction(
      client,
      transactionOption,
    );

    const counterTransactionOption = prepareTransactionOption(
      slackCounterAccountInfo,
      source_account_id,
      destination_account_id,
      movement_type_id,
    );

    const counterTransactionInfo = isTransfer
      ? await recordTransaction(client, counterTransactionOption)
      : {};

    // Only when the opening took money from another account: without a starting
    // amount there is no counterparty row whose projection changed.
    if (isTransfer) {
      await setAccountBalanceFromLedger(
        client,
        slackCounterAccountInfo.account_id,
        userId,
      );
    }
    await client.query('COMMIT');
    // user_id is delivered once, at the top level of data.
    delete account_basic_data.user_id;
    delete counterTransactionInfo.user_id;
    delete transactionOption.userId;
    delete recordTransactionInfo.user_id;
    return res.status(201).json({
      status: 201,
      data: {
        user_id: userId,
        account_basic_data: {
          ...account_basic_data,
          account_type_name,
          currency_code,
        },

        new_account_data: {
          account_name: newAccountInfo.account_name,
          transaction_data: transactionOption,
          transaction_info: {
            ...recordTransactionInfo,
            amount: parseFloat(recordTransactionInfo.amount),
          },
          transaction_type_name: newAccountInfo.transaction_type_name,
        },

        counter_account_data: {
          account_name: counterTransactionInfo.account_name,
          transaction_data: counterTransactionOption,
          transaction_info: counterTransactionInfo,
          transaction_type_name: slackCounterAccountInfo.transaction_type_name,
          account_balance: slackCounterAccountInfo.account_balance,
          account_type_name: slackCounterAccountInfo.account_type_name,
        },
      },
      message,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const { code, message, errorCode, details } = handlePostgresError(error);
    console.error(pc.red(`Error creating new account:`), message);
    return next(createError(code, message, { errorCode, details }));
  } finally {
    client.release();
  }
};
// POST /api/fintrack/account/new_account/debtor
export const createDebtorAccount = async (req, res, next) => {
  // Opening movement: movement type 8 (account-opening), transaction type lend or borrow.
  console.log(pc.blueBright('createDebtorAccount'));
  const client = await pool.connect();
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const {
      account_type, //refers to debtor account
      lastname: debtor_lastname,
      name: debtor_name,
      amount,

      selected_account_name, //refers to bank account name
      selected_account_type, //refers to bank account type
      transaction_type, // lending or borrowing here; other creation forms send the account type
    } = req.body;
    const transactionTypeInputOptions = {
      lending: 'lend',
      borrowing: 'borrow',
    };
    const selectedAccountTransactionType =
      transactionTypeInputOptions[transaction_type.trim().toLowerCase()] ??
      'lend';
    const debtorTransactionType =
      selectedAccountTransactionType === 'lend' ? 'borrow' : 'lend';
    // Both types are validated before the catalog lookup: a body naming 'boundary' would
    // resolve to the compensation type, whose accounts every dashboard query silently
    // drops from the owner's totals. The other creation paths fix or cross-check their type.
    const debtorAccountType = assertUserCreatableAccountType(
      account_type ?? 'debtor',
      'account_type',
    );
    assertUserCreatableAccountType(
      selected_account_type,
      'selected_account_type',
    );
    // Falls back to the accounting currency, not a literal 'usd', which is wrong
    // once the installation is configured otherwise.
    const { currency } = req.body;
    const currencyCode = currency ? currency : ACCOUNTING_CURRENCY_CODE;
    // Cleaned once and reused: the composed account_name and the parts stored
    // in debtor_accounts must be the same strings. Case is left as typed.
    const debtorLastnameInput = normalizePersonName(debtor_lastname);
    const debtorNameInput = normalizePersonName(debtor_name);
    const newAccountName = `${debtorLastnameInput}, ${debtorNameInput}`;

    if (
      !account_type ||
      !currencyCode ||
      !debtorLastnameInput ||
      !debtorNameInput
    ) {
      const message =
        'Currency_code, account name and account type name fields are required';
      console.warn(pc.blueBright(message));
      return res.status(400).json({ status: 400, message });
    }
    // Resolved via getCurrencyId: filtering the catalogue yields undefined on a
    // mismatch, which would reach a NOT NULL column as NULL.
    let currencyIdReq;

    try {
      currencyIdReq = await getCurrencyId(pool, currencyCode);
    } catch {
      const message = `Unknown currency code: ${currencyCode}`;
      console.warn(pc.red(message));
      return res.status(400).json({ status: 400, message });
    }

    const accountingCurrencyId = await getCurrencyId(
      pool,
      ACCOUNTING_CURRENCY_CODE,
    );

    if (parseFloat(amount) < 0) {
      const message = 'Transaction amount value must be >= 0';
      console.warn(pc.blueBright(message));
      return res.status(400).json({ status: 400, message });
    }
    const value = amount ? parseFloat(amount) : 0.0;
    if (isNaN(value)) {
      return res
        .status(400)
        .json({ status: 400, message: 'Amount must be a valid number' });
    }
    const { date, transactionActualDate } = req.body;
    const account_start_date = !!date && date !== '' ? date : new Date();
    const transaction_actual_date =
      !transactionActualDate || transactionActualDate == ''
        ? new Date()
        : transactionActualDate;

    // Same window as every operative date: the current month.
    const openingTimeZone = await getUserTimeZone(client, userId);
    const openingDay = resolveOpeningDay(account_start_date, openingTimeZone);
    const openingRateDay = rateDayForOpening(openingDay, openingTimeZone);

    const accountTypeQuery = `SELECT * FROM account_types`;
    const accountTypeResult = await pool.query(accountTypeQuery);
    const accountTypeArr = accountTypeResult.rows;

    const debtorAccountTypeIdReqObj = accountTypeArr.filter(
      (type) => type.account_type_name == debtorAccountType.trim(),
    )[0];
    // Checked before the dereference: reading .account_type_id off undefined would
    // throw a TypeError and surface as a 500 for a bad input.
    if (!debtorAccountTypeIdReqObj) {
      throw createError(400, `Account type "${debtorAccountType}" not found`);
    }
    const debtorAccountTypeIdReq = debtorAccountTypeIdReqObj.account_type_id;

    const selectedAccountTypeIdReqObj = accountTypeArr.filter(
      (type) =>
        type.account_type_name.trim().toLowerCase() ==
        selected_account_type.trim().toLowerCase(),
    )[0];
    if (!selectedAccountTypeIdReqObj) {
      throw createError(
        400,
        `Selected Account type "${selected_account_type}" not found`,
      );
    }
    // Throws when the name is taken; the return value is unused.
    await verifyAccountExistence(
      client,
      userId,
      newAccountName,
      debtorAccountType,
    );
    const selectedAccountExists = await verifyAccountExists(
      client,
      userId,
      selected_account_name,
      selected_account_type,
    );

    const counterAccountInfo = await checkAndInsertAccount(
      client,
      userId,
      selected_account_name,
      selected_account_type,
    );
    // Overdraft not allowed: bank to debtor, investment to investment, bank to bank, bank to
    // category_budget, bank to investment. Allowed: debtor to any bank, slack or income_source to any.
    // Pockets have no rule (savings plans since migration 020: committing writes an allocation).

    // The funding account's balance is in the accounting currency, so the typed amount
    // is converted before the funds check; comparing the typed figure would misjudge
    // loans in other currencies.
    let convertedValue = value;
    let exchangeRate = 1.0;
    let exchangeRateSource = 'identity';
    let exchangeRateTimestamp = new Date();

    if (currencyCode !== ACCOUNTING_CURRENCY_CODE && value !== 0.0) {
      const conversion = await currencyAmountConversion(
        value,
        currencyCode,
        ACCOUNTING_CURRENCY_CODE,
        openingRateDay,
        openingTimeZone,
      );
      convertedValue = conversion.amount.toNumber();
      exchangeRate = conversion.rate;
      exchangeRateSource = conversion.source;
      exchangeRateTimestamp = conversion.fetchedAt;
    }

    // The check runs below, inside the transaction: it needs the ledger balance
    // read with the account row locked.
    const isCheckForFundsRequired =
      selectedAccountTransactionType === 'lend' && Number(convertedValue) > 0;
    // The sign is applied to both figures so the audit trail keeps the direction
    // of the balance it explains.
    const isOutgoing = debtorTransactionType === 'lend' && value !== 0.0;
    const originalTransactionAmount = isOutgoing ? value * -1 : value;
    const transactionAmount = isOutgoing ? convertedValue * -1 : convertedValue;
    const newAccountBalance = transactionAmount;

    // The metadata carries the origin: the first argument is the typed figure, the
    // rate is the one that produced the converted amount.
    const fxMetadata = await buildFxMetadata(
      originalTransactionAmount,
      currencyIdReq,
      pool,
      { exchangeRate, exchangeRateSource, exchangeRateTimestamp },
    );
    await client.query('BEGIN');

    // Lock the funding account and derive its balance from the ledger before any write: the stored
    // column can drift, and without the lock two simultaneous draws would both pass. The counter
    // movement is carried forward from this figure, so drift cannot propagate.
    const counterAccountId = counterAccountInfo.account.account_id;

    const ledgerBalances = await lockAndDeriveBalances(client, userId, [
      counterAccountId,
    ]);

    const counterAccountBalance = parseFloat(
      ledgerBalances.get(counterAccountId),
    );

    if (isCheckForFundsRequired && counterAccountBalance < parseFloat(convertedValue)) {
      const message = `Not enough funds to transfer ${ACCOUNTING_CURRENCY_CODE} ${parseFloat(convertedValue)} from account ${counterAccountInfo.account.account_name} (${ACCOUNTING_CURRENCY_CODE} ${counterAccountBalance})`;
      console.warn(pc.magentaBright(message));

      // Thrown, not returned: the transaction is open, and a bare response would hand
      // the connection back to the pool unrolled. The catch below rolls back.
      throw createError(400, message);
    }

    const { account_basic_data } = await insertAccount(
      client,
      userId,
      newAccountName,
      debtorAccountTypeIdReq,
      accountingCurrencyId,
      newAccountBalance,
      newAccountBalance,
      account_start_date ?? transaction_actual_date,
    );

    const account_id = account_basic_data.account_id;
    const debtorInsertQuery = {
      text: `INSERT INTO debtor_accounts (account_id, debtor_lastname, debtor_name, value,
       currency_id,
       selected_account_name, selected_account_id,
       account_start_date,
       original_value, original_currency_id, exchange_rate, exchange_rate_source, exchange_rate_timestamp, exchange_rate_target_currency_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      values: [
        account_id,
        debtorLastnameInput,
        debtorNameInput,
        newAccountBalance,
        accountingCurrencyId,
        selected_account_name,
        selectedAccountExists.accountId,
        account_start_date,
        originalTransactionAmount,
        currencyIdReq,
        exchangeRate,
        exchangeRateSource,
        exchangeRateTimestamp,
        accountingCurrencyId,
      ],
    };

    const debtorAccount = await client.query(debtorInsertQuery);

    // currency_code describes value, the converted figure; the picked currency is
    // in original_currency_id.
    const debtor_account = {
      ...debtorAccount.rows[0],
      currency_code: ACCOUNTING_CURRENCY_CODE,
      account_type_name: debtorAccountType,
    };
    const transactionTypeDescriptionObj = {
      transactionType: debtorTransactionType,
      counterTransactionType: selectedAccountTransactionType,
    };

    const { transactionType, counterTransactionType } =
      transactionTypeDescriptionObj;
    const transactionTypeDescriptionIds = await getTransactionTypeId(
      client,
      transactionTypeDescriptionObj.transactionType,
      transactionTypeDescriptionObj.counterTransactionType,
    );

    const { transaction_type_id, countertransaction_type_id } =
      transactionTypeDescriptionIds;

    const isToOpenNewAccount = transactionAmount === 0.0 ? true : false;
    // The printed amount is the converted one, so it is paired with the accounting
    // code, not the typed one.
    const transactionDescription = `Transaction: account-opening. Account: "${newAccountName}" (${debtorAccountType}). Initial-( ${isToOpenNewAccount ? 'account-opening' : debtorTransactionType}). Amount: ${transactionAmount} ${ACCOUNTING_CURRENCY_CODE}. Reference:${selected_account_name}. Date: ${formatDate(transaction_actual_date)}`;

    const newAccountInfo = {
      user_id: userId,
      description: transactionDescription,
      transaction_type_id,
      transaction_type_name: transactionType,
      amount: parseFloat(transactionAmount),
      currency_id: accountingCurrencyId,
      account_id: account_basic_data.account_id,
      // The debtor's own opening row, stated explicitly: for a debtor the user owes,
      // money flows away from the opened account, so the direction test would pick
      // the funding leg.
      opening_for_account_id: account_basic_data.account_id,
      transaction_actual_date,
      currency_code: ACCOUNTING_CURRENCY_CODE,
      account_name: newAccountName,
      account_type_name: debtorAccountType,
      account_type_id: account_basic_data.account_type_id,
      account_balance: newAccountBalance,
      ...fxMetadata,
    };

    const counterAccountTransactionAmount = -Number(transactionAmount);

    // Carried forward from the derived balance, not the stored column, so drift is
    // corrected instead of being rewritten into the projection.
    const newCounterAccountBalance =
      counterAccountBalance + counterAccountTransactionAmount;

    // Own metadata: the counter movement runs the opposite way, so the debtor's would
    // store an origin whose sign contradicts the amount.
    const counterFxMetadata = await buildFxMetadata(
      -Number(originalTransactionAmount),
      currencyIdReq,
      pool,
      { exchangeRate, exchangeRateSource, exchangeRateTimestamp },
    );

    const counterTransactionDescription = `Transaction: ${counterTransactionType}. Account: ${counterAccountInfo.account.account_name} (${selected_account_type}), number: ${counterAccountInfo.account.account_id}. Amount: ${counterAccountTransactionAmount} ${ACCOUNTING_CURRENCY_CODE}. Account reference: ${newAccountName}. Date: ${formatDate(transaction_actual_date)}`;
    const slackCounterAccountInfo = {
      user_id: userId,
      description: counterTransactionDescription,
      transaction_type_id: countertransaction_type_id,
      transaction_type_name: counterTransactionType,
      amount: parseFloat(counterAccountTransactionAmount),
      currency_id: accountingCurrencyId,
      account_id: counterAccountInfo.account.account_id,
      transaction_actual_date,
      currency_code: ACCOUNTING_CURRENCY_CODE,
      account_name: counterAccountInfo.account.account_name,
      account_type_name: 'boundary',
      account_type_id: counterAccountInfo.account.account_type_id,
      account_balance: newCounterAccountBalance,
      ...counterFxMetadata,
    };

    // The funding account's stored balance is written below, after the movement rows
    // exist; deriving it here would omit the opening movement.

    const { destination_account_id, source_account_id, isAccountOpening } =
      determineSourceAndDestinationAccounts(newAccountInfo, counterAccountInfo);

    // Movement type 8 (account-opening); transaction type ids 3 (lend), 4 (borrow) or 5 (account-opening).
    const movement_type_id = 8;
    const transactionOption = prepareTransactionOption(
      newAccountInfo,
      source_account_id,
      destination_account_id,
      movement_type_id,
    );
    const recordTransactionInfo = await recordTransaction(
      client,
      transactionOption,
    );

    const counterTransactionOption = prepareTransactionOption(
      slackCounterAccountInfo,
      source_account_id,
      destination_account_id,
      movement_type_id,
    );
    const counterTransactionInfo = await recordTransaction(
      client,
      counterTransactionOption,
    );

    // Taken from the ledger now that the rows exist; the account was locked earlier,
    // in ascending id order.
    const updatedCounterAccountInfo = await setAccountBalanceFromLedger(
      client,
      slackCounterAccountInfo.account_id,
      userId,
    );
    if (process.env.ENV === 'development') {
      console.log(
        '🚀 ~ createBasicAccount ~ updatedCounterAccountInfo:',
        updatedCounterAccountInfo,
        { isAccountOpening },
      );
    }

    await client.query('COMMIT');
    const message = `${newAccountInfo.account_name} account of type ${newAccountInfo.account_type_name} with number ${account_id} was successfully created `;
    console.log('🚀 ~ createAccount ~ message:', message);
    // user_id is delivered once, at the top level of data.
    delete account_basic_data.user_id;
    delete counterTransactionInfo.user_id;
    delete recordTransactionInfo.user_id;
    return res.status(201).json({
      status: 201,
      data: {
        user_id: userId,
        account_basic_data: {
          ...account_basic_data,
          account_type_name: debtorAccountType,
          // The row was inserted with accountingCurrencyId, so this code describes
          // its balance.
          currency_code: ACCOUNTING_CURRENCY_CODE,
        },
        new_debtor_account: debtor_account,

        new_account_data: {
          account_name: newAccountInfo.account_name,
          transaction_data: transactionOption,
          transaction_info: recordTransactionInfo,
          transaction_type_name: newAccountInfo.transaction_type_name,
        },

        counter_account_data: {
          account_name: counterTransactionInfo.account_name,
          transaction_data: counterTransactionOption,
          transaction_info: counterTransactionInfo,
          transaction_type_name: counterTransactionInfo.transaction_type_name,
        },
      },
      message,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const { code, message, errorCode, details } = handlePostgresError(error);
    console.error(pc.red('Error creating new debtor account:'), message);
    return next(createError(code, message, { errorCode, details }));
  } finally {
    client.release();
  }
};

// No pocket-account creation handler: a pocket is a planning object with its own table
// and endpoints. Its extension table and the account-type catalog row stay because
// existing readers and historical records reference them.
