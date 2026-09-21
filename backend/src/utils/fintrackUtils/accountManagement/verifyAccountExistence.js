import pc from 'picocolors';
import { pool } from '../../../db/config/configDB.js';
import { LIVE_ACCOUNT } from '../accountDataRetrieval/accountUtils.js';
// Throws when an account with this name and type is already held; false otherwise.
export const verifyAccountExistence = async (
  dbClient = null,
  userId,
  account_name,
  account_type_name = 'bank',
) => {
  // Exact, case-folded match. A soft-deleted account frees its name but a CLOSED one keeps it: erasure
  // rewrites descriptions by substring, so a namesake's deletion would rewrite the closed account's rows.
  // Same predicate as the rename check in accountEditController.js.
  const accountExistQuery = {
    text: `SELECT 1
    FROM user_accounts ua
    JOIN account_types act ON ua.account_type_id = act.account_type_id
    WHERE ua.user_id = $1
     AND LOWER(ua.account_name) = LOWER($2)
     AND LOWER(act.account_type_name) = LOWER($3)
     AND (ua.closed_at IS NOT NULL OR ua.deleted_at IS NULL)
    LIMIT 1`,
    values: [userId, account_name, account_type_name],
  };
  const db = dbClient || pool;
  try {
    if (!dbClient || typeof dbClient.query !== 'function') {
      throw new Error(
        'Invalid database client provided to verifyAccountExistence',
      );
    }

    const accountExistResult = await db.query(accountExistQuery);

    const accountExist = accountExistResult.rows.length > 0;

    if (accountExist) {
      const message = `An account named "${account_name}" of type "${account_type_name}" already exists. Try again with a different name.`;
      console.log(pc.blueBright(message));
      throw new Error(message);
    }
    return accountExist;
  } catch (error) {
    console.error('Error verifying account existence:', error);
    throw error;
  }
};
// Resolves a live account by name and type; throws when there is none.
export const verifyAccountExists = async (
  clientOrPool = null,
  userId,
  account_name,
  account_type_name = 'bank',
) => {
  const db = clientOrPool || pool;
  // Exact match matters more here: the returned account_id moves money. ORDER BY pins LIMIT 1.
  // Deliberately the OPPOSITE predicate of verifyAccountExistence (which keeps closed accounts): this one
  // must exclude them. Never sweep the two together.
  const accountExistQuery = {
    text: `SELECT 1, ua.account_id FROM user_accounts ua
     JOIN account_types act
      ON ua.account_type_id = act.account_type_id
     WHERE ua.user_id = $1
      AND LOWER(ua.account_name) = LOWER($2)
      AND LOWER(act.account_type_name) = LOWER($3)
      ${LIVE_ACCOUNT}
     ORDER BY ua.account_id
     LIMIT 1`,
    values: [userId, account_name, account_type_name],
  };
  try {
    const accountExistResult = await db.query(accountExistQuery);
    const accountExist = accountExistResult.rows.length > 0;

    if (!accountExist) {
      const message = `Account(s) "${account_name}" was NOT found of type "${account_type_name}". Try again with an existent account.`;
      console.log(pc.blueBright(message));
      throw new Error(message);
    }
    return { accountExist, accountId: accountExistResult.rows[0].account_id };
  } catch (error) {
    console.error('Error verifying account existence:', error);
    throw error;
  }
};
