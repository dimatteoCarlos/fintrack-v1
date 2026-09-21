import pc from 'picocolors';
import { createError, handlePostgresError } from '../../utils/errorHandling.js';
import { pool } from '../../db/config/configDB.js';
import { determineTransactionType, formatDate } from '../../utils/helpers.js';
import { recordTransaction } from '../../utils/fintrackUtils/transactionManagement/recordTransaction.js';
import { checkAndInsertAccount } from '../../utils/fintrackUtils/accountManagement/checkAndInsertAccount.js';
import { verifyAccountExistence } from '../../utils/fintrackUtils/accountManagement/verifyAccountExistence.js';
import { setAccountBalanceFromLedger } from '../../utils/fintrackUtils/accountManagement/setAccountBalanceFromLedger.js';
import { lockAndDeriveBalances } from '../../utils/fintrackUtils/accountManagement/lockAndDeriveBalances.js';
import { insertAccount } from '../../utils/fintrackUtils/accountManagement/insertAccount.js';
import { getTransactionTypeId } from '../../utils/fintrackUtils/accountDataRetrieval/getTransactionTypeId.js';
import { determineSourceAndDestinationAccounts } from '../../utils/fintrackUtils/accountManagement/determineSourceAndDestinationAccounts.js';
import { prepareTransactionOption } from '../../utils/fintrackUtils/transactionManagement/prepareTransactionOption.js';

import { buildFxMetadata } from '../../utils/fintrackUtils/transactionManagement/fxMetadataHelper.js';
import { currencyAmountConversion } from '../services/fx_services/conversion/currencyAmountConversion.js';
import { getCurrencyId } from '../../utils/currencyLookup.js';
import { ACCOUNTING_CURRENCY_CODE } from '../config/fintrackConfig.js';
import { budgetAllocationService } from '../services/budget_services/services/budgetAllocationService.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import {
  rateDayForOpening,
  resolveOpeningDay,
} from '../../utils/fintrackUtils/date-utils/resolveOpeningDay.js';

// POST /api/fintrack/account/new_account/category_budget: creates the account, its budget
// allocation and an 'account opening' movement (movement_type_id 8) in one transaction.

export const createCategoryBudgetAccount = async (req, res, next) => {
  console.log(pc.blueBright('createCategoryBudgetAccount'));
  const client = await pool.connect();
  try {
    const { userId } = req.user;

    if (!userId) {
      const message = 'User ID is required';
      console.warn('message:', message);
      return res.status(400).json({ status: 400, message });
    }
    const { currency, date, amount, transactionActualDate } = req.body;
    const currency_code = currency ? currency : 'usd';
    const account_start_date = !!date && date !== '' ? date : new Date();
    const transaction_actual_date =
      !transactionActualDate || transactionActualDate == ''
        ? new Date()
        : transactionActualDate;

    // Same window as every other operative date: the month in course. Read once
    // here because the allocation below needs the same zone.
    const openingTimeZone = await getUserTimeZone(client, userId);
    const openingDay = resolveOpeningDay(account_start_date, openingTimeZone);
    const openingRateDay = rateDayForOpening(openingDay, openingTimeZone);
    const {
      nature: nature_type_name_req_raw,
      subcategory: subcategory_raw,
      name: category_name_raw,
      budget,
    } = req.body;

    const category_name = category_name_raw?.trim().toLowerCase() || '';
    const subcategory = subcategory_raw?.trim().toLowerCase() || '';
    const nature_type_name_req = nature_type_name_req_raw?.trim().toLowerCase() || '';

    const account_type_name = 'category_budget';
    const account_name =
      account_type_name === 'category_budget'
        ? `${category_name}/${subcategory}/${nature_type_name_req}`
        : req.body.name;

    // A positive budget is required at creation (the database allows 0 for "stop budgeting").
    // Number() not parseFloat() ('12abc' -> 12); isFinite not !isNaN (isNaN('') is false and
    // Infinity would pass). Validated here because the service never sees the request.
    const category_nature_budget = Number(budget);

    if (!Number.isFinite(category_nature_budget) || category_nature_budget <= 0) {
      const message = 'Budget amount is required and must be greater than 0.';
      console.warn(pc.redBright(message));
      return res.status(400).json({ status: 400, message });
    }
    const account_starting_amount = amount ? parseFloat(amount) : 0.0;
    // Currency and account type are defined and validated by the frontend.
    if (!account_type_name || !currency_code || !account_name) {
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
    // Throws when the name is taken, so the request never reaches the FX
    // conversion below; the returned false is not read on the clear path.
    await verifyAccountExistence(
      client,
      userId,
      account_name,
      account_type_name,
    );

    // Target of every conversion below. originalCurrencyId, resolved further
    // down, is the origin the client sent and belongs to the FX metadata only.
    const accountingCurrencyId = await getCurrencyId(pool,ACCOUNTING_CURRENCY_CODE);
    // Uniqueness is per user, scoped through user_accounts. The closed_at/deleted_at test asks
    // whether the name is taken: a soft-deleted category releases it; a closed one keeps it
    // because its transactions stay and the erasure tail matches names in their descriptions.
    const categoryAndSubcategoryAndNatureQuery = {
      text: `SELECT 1
      FROM category_budget_accounts cba
      JOIN category_nature_types cnt ON cba.category_nature_type_id = cnt.category_nature_type_id
      JOIN user_accounts ua ON ua.account_id = cba.account_id

      WHERE ua.user_id = $1
      AND LOWER(cba.category_name) = $2
      AND LOWER(cnt.category_nature_type_name) = $3
      AND LOWER(cba.subcategory) = $4
      AND (ua.closed_at IS NOT NULL OR ua.deleted_at IS NULL)
    `,
      values: [userId, category_name, nature_type_name_req, subcategory],
    };
    const categoryAndSubcategoryAndNatureExistsResult = await pool.query(
      categoryAndSubcategoryAndNatureQuery,
    );
    const categoryAndSubcategoryAndNatureExists =
      categoryAndSubcategoryAndNatureExistsResult.rows.length > 0;

    if (categoryAndSubcategoryAndNatureExists) {
      const message = `Can not create a new account since, category ${category_name} with subcategory ${subcategory} and nature ${nature_type_name_req} account already exists. Try again`;
      console.warn('🚀 ~ createAccount ~ message:', message);
      throw new Error(message);
    }
    const category_nature_type_id_reqResult = await pool.query({
      text: `SELECT category_nature_type_id FROM category_nature_types WHERE category_nature_type_name = $1`,
      values: [nature_type_name_req],
    });
    const category_nature_type_id_req =
      category_nature_type_id_reqResult.rows[0].category_nature_type_id;

    // FX conversion runs after the duplicate checks so a rejected request never asks for a
    // rate. The budget moves no money (the opening transaction is 0.00), so its origin goes to
    // category_budget_accounts. getCurrencyId, not an ad-hoc lookup that yields undefined.
    let originalCurrencyId;

    try {
      originalCurrencyId = await getCurrencyId(pool, currency_code);
    } catch {
      const message = `Unknown currency code: ${currency_code}`;
      console.warn(pc.redBright(message));
      return res.status(400).json({ status: 400, message });
    }

    let convertedBudget = category_nature_budget;
    let convertedStartingAmount = account_starting_amount;
    let exchangeRate = 1.0;
    let exchangeRateSource = 'identity';
    let exchangeRateTimestamp = new Date();

    if (currency_code !== ACCOUNTING_CURRENCY_CODE) {
      // Valued on the day the account was opened, not the day the form was
      // submitted. A day this month that no source can price is refused with a
      // 422 by the resolver, never valued at today's rate.
      const budgetConversion = await currencyAmountConversion(
        category_nature_budget,
        currency_code,
        ACCOUNTING_CURRENCY_CODE,
        openingRateDay,
        openingTimeZone,
      );

      convertedBudget = budgetConversion.amount.toNumber();
      exchangeRate = budgetConversion.rate;
      exchangeRateSource = budgetConversion.source;
      exchangeRateTimestamp = budgetConversion.fetchedAt;

      // The frontend sends no opening amount for a category budget, so this is
      // 0.00 in practice. Converted anyway: a non-zero one would otherwise land
      // in the ledger denominated in a currency the ledger does not record.
      if (account_starting_amount !== 0) {
        const startingConversion = await currencyAmountConversion(
          account_starting_amount,
          currency_code,
          ACCOUNTING_CURRENCY_CODE,
          openingRateDay,
          openingTimeZone,
        );

        convertedStartingAmount = startingConversion.amount.toNumber();
      }
    }

    const transactionAmount = convertedStartingAmount;
    const account_balance = transactionAmount;

   // Build FX metadata for the opening transaction, with the rate actually used
   const fxMetadata = await buildFxMetadata(
   // original amount (positive)
   account_starting_amount,
   // original currency ID, as sent by the client
   originalCurrencyId,
   pool,
   {
     exchangeRate,
     exchangeRateSource,
     exchangeRateTimestamp,
   },
   );

    await client.query('BEGIN');
    const { account_basic_data } = await insertAccount(
      client,
      userId,
      account_name,
      accountTypeIdReq,
      accountingCurrencyId,//accountable currency,
      convertedStartingAmount,
      account_balance,
      account_start_date ?? transaction_actual_date,
    );
    const account_id = account_basic_data.account_id;
    // currency_id stores the accounting currency, not originalCurrencyId (FX metadata only);
    // NULL breaks getCurrencyCodeSync in the summaries. budget is the converted figure every
    // read path sums; original_budget is what the user typed, so the row stays auditable.
    const category_budget_accountQuery = {
      text: `INSERT INTO category_budget_accounts(account_id, category_name,category_nature_type_id,subcategory,budget,currency_id,account_start_date,
      original_budget,original_currency_id,exchange_rate,exchange_rate_source,exchange_rate_timestamp,exchange_rate_target_currency_id )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      values: [
        account_id,
        category_name,
        category_nature_type_id_req,
        subcategory,
        convertedBudget,
        accountingCurrencyId,
        account_start_date,
        category_nature_budget,
        originalCurrencyId,
        exchangeRate,
        exchangeRateSource,
        exchangeRateTimestamp,
        accountingCurrencyId,
      ],
    };
    const category_budget_accountResult = await client.query(
      category_budget_accountQuery,
    );
    const category_budget_account = {
      ...category_budget_accountResult.rows[0],
      nature_type_name: nature_type_name_req,
      currency_code,
    };
    // Read paths resolve the budget from budget_monthly_allocations, so an account without an
    // allocation reads as unbudgeted (the legacy cba.budget column keeps its writer). Runs on
    // the transaction's client; takes the converted figure (accounting currency).
    const budget_allocation = await budgetAllocationService.createAllocationForAccount(
      client,
      account_id,
      convertedBudget,
      account_start_date ?? transaction_actual_date,
      openingTimeZone,
      // The accounting currency, matching category_budget_accounts.currency_id, not
      // originalCurrencyId. Required by migration 017.
      accountingCurrencyId,
    );
    const transactionTypeDescriptionObj = determineTransactionType(
      transactionAmount,
      account_type_name,
    );

    const { transactionType, counterTransactionType } =
      transactionTypeDescriptionObj;

    const transactionTypeDescriptionIds = await getTransactionTypeId(
      client,
      transactionTypeDescriptionObj.transactionType,
      transactionTypeDescriptionObj.counterTransactionType,
    );

    const { transaction_type_id, countertransaction_type_id } =
      transactionTypeDescriptionIds;

    // Reports the amount as the user sent it, so the figure and the currency
    // code beside it describe the same thing.
    const transactionDescription = `Transaction: ${transactionType}. Account: ${account_name} (${account_type_name}). Initial-(${transactionType}). Amount: ${account_starting_amount} ${currency_code}.  Date:${formatDate(transaction_actual_date)}`;

    const newAccountInfo = {
      user_id: userId,
      description: transactionDescription,
      transaction_type_id,
      transaction_type_name: transactionType,
      amount: parseFloat(transactionAmount),
      currency_id: accountingCurrencyId,//countable currency
      account_id: account_basic_data.account_id,
      // This leg is the category account's own opening row; the counter leg is not.
      opening_for_account_id: account_basic_data.account_id,
      transaction_actual_date,
      currency_code,
      account_name,
      account_type_name,
      account_type_id: account_basic_data.account_type_id,
      account_balance: parseFloat(account_balance),
      ...fxMetadata,
    };
    // The slack account is the compensation (counter) account whose opposite entry keeps the
    // ledger balanced; checkAndInsertAccount creates it with balance 0 if it is missing.
    const counterAccountInfo = await checkAndInsertAccount(
      client,
      userId,
      'slack',
    );

    // Locked and ledger-derived (the stored column has drifted). No funds check: the
    // compensation account is the one allowed to overdraft.
    const counterAccountId = counterAccountInfo.account.account_id;

    const ledgerBalances = await lockAndDeriveBalances(client, userId, [
      counterAccountId,
    ]);

    const newCounterAccountBalance =
      parseFloat(ledgerBalances.get(counterAccountId)) - transactionAmount;

    const counterAccountTransactionAmount = -transactionAmount;

    const counterTransactionDescription = `Transaction: ${counterTransactionType}. Account: ${counterAccountInfo.account.account_name} (bank), number: ${counterAccountInfo.account.account_id}. Amount:${currency_code} ${counterAccountTransactionAmount}. Account reference: ${account_name}). Date:${formatDate(transaction_actual_date)}`;
    const slackCounterAccountInfo = {
      user_id: userId,
      description: counterTransactionDescription,
      transaction_type_id: countertransaction_type_id,
      transaction_type_name: counterTransactionType,
      amount: parseFloat(counterAccountTransactionAmount),
      currency_id:accountingCurrencyId,
      account_id: counterAccountInfo.account.account_id,
      transaction_actual_date,
      currency_code,
      account_name: counterAccountInfo.account.account_name,
      account_type_name: 'boundary',
      account_type_id: counterAccountInfo.account.account_type_id,
      account_balance: parseFloat(newCounterAccountBalance),
       ...fxMetadata,
    };

    // The funding account's stored balance is written below, after the rows exist;
    // otherwise it would keep claiming what it just gave away.

    // The category_budget account is always the destination.
    const { destination_account_id, source_account_id, isAccountOpening } =
      determineSourceAndDestinationAccounts(newAccountInfo, counterAccountInfo);

    // Opening movement: movement_type_id 8, transaction type deposit (2) or account-opening (5);
    // a withdraw would be accepted but is not recommended.
    const movement_type_id = 8;
    const movement_type_name = 'account opening';

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
    const counterTransactionInfo = !isAccountOpening
      ? await recordTransaction(client, counterTransactionOption)
      : {};

    // Only when a counterparty row was actually written. An opening with no
    // funding movement leaves no other account whose projection changed.
    if (!isAccountOpening) {
      await setAccountBalanceFromLedger(client, counterAccountId, userId);
    }

    await client.query('COMMIT');
    const message = `${account_name} account of type ${account_type_name} with number ${account_id} was successfully created `;

    // user_id is stripped from the nested objects: it is delivered once, at data.user_id.
    delete account_basic_data.user_id;
    delete category_budget_account.user_id;
    delete category_budget_account.user_id;
    delete recordTransactionInfo.user_id;
    delete counterTransactionInfo.user_id;
    delete transactionOption.userId;
    delete counterTransactionOption.userId;

    return res.status(201).json({
      status: 201,
      movement_type_id,
      movement_type_name,
      data: {
        user_id: userId,
        account_basic_data: {
          ...account_basic_data,
          account_type_name,
          nature_type_name: nature_type_name_req,
          currency_code,
        },
        new_category_budget_account: category_budget_account,
        budget_allocation,

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
    console.error(
      pc.red('Error creating category budget account:'),
      message || 'something went wrong',
    );
    return next(createError(code, message, { errorCode, details }));
  } finally {
    client.release();
  }
};