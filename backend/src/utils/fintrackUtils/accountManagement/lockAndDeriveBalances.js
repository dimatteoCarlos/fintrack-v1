import { derivedAccountBalanceSql } from '../accountDataRetrieval/derivedBalance.js';
import { createError } from '../../errorHandling.js';

// Opening amount plus movements: the figure the stored column has drifted from.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'NUMERIC');

/**
 * Locks every touched account in ascending account_id order (so A -> B racing B -> A cannot deadlock), then
 * derives balances: the stored column can drift, and BEGIN gives atomicity, not exclusion. The derivation is
 * a second statement; joined into the locking one it would mix the row's latest version with the old snapshot.
 *
 * @param {import('pg').PoolClient} client - inside BEGIN; a pool would release
 *  the lock as soon as the statement returned
 * @param {string} userId - UUID from the token; ownership is filtered in both statements
 * @param {number[]} accountIds - every account the movement touches; duplicates
 *  are collapsed
 * @returns {Promise<Map<number, string>>} account_id -> balance as text
 * @throws {Error} 500 when any id resolves to no owned row
 */
export const lockAndDeriveBalances = async (client, userId, accountIds) => {
  // Distinct: `= ANY(...)` returns a row per repeated id (annulment passes its target twice), so the
  // completeness check must count unique ids. Numeric: the Map is keyed on numbers; NaN fails the ::int[] cast.
  const wanted = [...new Set(accountIds.map(Number))];

  await client.query({
    text: `SELECT ua.account_id
             FROM user_accounts ua
            WHERE ua.account_id = ANY($1::int[])
              AND ua.user_id = $2
            ORDER BY ua.account_id
            FOR UPDATE`,
    values: [wanted, userId],
  });

  const { rows } = await client.query({
    text: `SELECT ua.account_id,
                  ${DERIVED_BALANCE}::text AS balance
             FROM user_accounts ua
            WHERE ua.account_id = ANY($1::int[])
              AND ua.user_id = $2`,
    values: [wanted, userId],
  });

  const balances = new Map(rows.map((row) => [row.account_id, row.balance]));

  // Refuse rather than return a short map: callers cannot tell "holds nothing"
  // from "no such row". 500 not 404, because every caller resolves ownership
  // first, so a missing id means an invariant broke upstream.
  const missing = wanted.filter((id) => !balances.has(id));

  if (missing.length > 0) {
    throw createError(
      500,
      `lockAndDeriveBalances resolved no owned account row for ${missing.join(', ')}. Nothing was written.`,
    );
  }

  return balances;
};
