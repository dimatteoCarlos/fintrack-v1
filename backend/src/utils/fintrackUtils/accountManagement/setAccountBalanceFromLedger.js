// Writes account_balance as a projection of the ledger, using the one arithmetic
// every read path imports, so a screen and an enforcement check cannot disagree.

import { derivedAccountBalanceSql } from '../accountDataRetrieval/derivedBalance.js';

// NUMERIC, not FLOAT: the figure goes to a DECIMAL column, and a float round trip
// would store a value the ledger does not produce.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'NUMERIC');

/**
 * Re-derive one account's stored balance. The caller must already hold the row lock from an earlier
 * statement (lockAndDeriveBalances): inside a locking statement a derivation would mix a fresh
 * user_accounts row with a stale transactions snapshot. Ownership is filtered here.
 *
 * @param {import('pg').PoolClient} client - inside BEGIN, holding the row lock
 * @param {string} userId - UUID from the token
 * @returns {Promise<object|null>} the updated row, or null when no row matched
 */
export const setAccountBalanceFromLedger = async (
  client,
  accountId,
  userId,
) => {
  const result = await client.query({
    // updated_at is when the row was last touched, not the movement's date.
    text: `UPDATE user_accounts ua
              SET account_balance = ${DERIVED_BALANCE},
                  updated_at = NOW()
            WHERE ua.account_id = $1
              AND ua.user_id = $2
        RETURNING ua.*`,
    values: [accountId, userId],
  });

  return result.rows[0] ?? null;
};
