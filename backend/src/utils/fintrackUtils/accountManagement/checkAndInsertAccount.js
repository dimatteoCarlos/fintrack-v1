import pc from 'picocolors';
import { createError, handlePostgresError } from '../../errorHandling.js';
import { pool } from '../../../db/config/configDB.js';
import { getCurrencyId } from '../../currencyLookup.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../fintrack_api/config/fintrackConfig.js';

// Find-or-create an account by name and type (default: the 'slack' compensation account); accepts a
// transactional client or the pool.

export const checkAndInsertAccount = async (
  clientOrPool,
  userId,
  accountName = 'slack',
  accountType,
) => {
  if (!userId) throw new Error('User ID is required');
  if (!accountName) throw new Error('Account name is required');

  // Without accountType this finds the compensation account, typed 'boundary' since migration 031.
  // Matching 'bank' as well would accept a user's own bank account named 'slack' as the counterpart.
  // An explicit type keeps exact matching.
  const matchTypes = accountType ? [accountType] : ['boundary'];
  const insertAccountType = accountType || 'boundary';

  const isPool = clientOrPool === pool;
  const dbClient = isPool ? await clientOrPool.connect() : clientOrPool;
  const clientAcquired = isPool;

  try {
    // account_name matches exact-case: the filters excluding the compensation account compare to 'slack'
    // case-sensitively, so a LOWER() match could return a 'Slack' they count as the owner's own. ORDER BY
    // + LIMIT: a user account named 'slack' can exist, so the oldest account_id wins.
    const chekAccountResult = await dbClient.query(
      `SELECT ua.* FROM user_accounts ua
     JOIN account_types act ON ua.account_type_id = act.account_type_id
     WHERE ua.user_id =$1
      AND ua.account_name = $2
      AND LOWER(act.account_type_name) = ANY($3)
      -- No closed_at test: this is find-or-create, so a row the query misses gets
      -- duplicated instead of excluded, and a second 'slack' row would hit the
      -- ORDER BY + LIMIT collision described above.
      AND ua.deleted_at IS NULL
     ORDER BY ua.account_id ASC
     LIMIT 1;
      `,
      [userId, accountName, matchTypes.map((type) => type.toLowerCase())],
    );

    if (chekAccountResult.rows.length > 0) {
      const accountId = chekAccountResult.rows[0].account_id;
      console.log(
        pc.green(
          `checkAndInserAccount: ${accountName} account already exists with id ${accountId}`,
        ),
      );
      return { exists: true, account: chekAccountResult.rows[0] };
    } else {
      const accountTypeResult = await dbClient.query(
        'SELECT account_type_id FROM account_types WHERE LOWER(account_type_name) = LOWER($1)',
        [insertAccountType],
      );

      if (accountTypeResult.rows.length === 0) {
        throw new Error(`Account type '${insertAccountType}' not found`);
      }

      const accountTypeId = accountTypeResult.rows[0].account_type_id;
      // Configured accounting currency, not a literal id: every other creation path stores it, so a
      // hardcoded id would put this account in a different currency whenever ACCOUNTING_CURRENCY_CODE
      // is not the usd default.
      const accountingCurrencyId = await getCurrencyId(
        dbClient,
        ACCOUNTING_CURRENCY_CODE,
      );
      const insertResult = await dbClient.query(
        'INSERT INTO user_accounts (user_id,account_name,account_type_id,currency_id,account_starting_amount,account_balance,account_start_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          userId,
          accountName,
          accountTypeId,
          accountingCurrencyId,
          0, // starting_amount
          0, // balance
          new Date(),
        ],
      );
      const newAccountId = insertResult.rows[0].account_id;
      console.log('insertResult', insertResult.rows);

      console.log(
        pc.green(
          `${accountName} account created successfully with ID: ${newAccountId}`,
        ),
      );
      return { exists: false, account: insertResult.rows[0] };
    }
  } catch (error) {
    const messageError = `Error in checkAndInsertAccount: when processing counter account ${accountName}`;

    console.error(messageError, error);
    const { code, message } = handlePostgresError(error);

    if (code && code !== 500) {
      throw createError(code, message);
    }

    throw createError(500, messageError);
  } finally {
    // Release only a client this function acquired from the pool.
    if (clientAcquired && dbClient && typeof dbClient.release === 'function') {
      dbClient.release();
    }
  }
};
