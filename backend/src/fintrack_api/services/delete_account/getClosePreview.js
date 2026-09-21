// Close-screen preview: the account's residual balance and its net-worth impact.

import { createError } from '../../../utils/errorHandling.js';
import { derivedAccountBalanceSql } from '../../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';

// Derived from the ledger, not the stored account_balance: settlement checks the owner's echo against a
// ledger figure, so echoing the column would make that check depend on what it verifies. NUMERIC as text.
const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'NUMERIC');

// deleted_at and closed_at are both tested: a closed or deleted account has no close
// screen, and closed_at must not rely on closing also writing deleted_at.
const CLOSING_ACCOUNT_QUERY = `
  SELECT
    ua.account_id,
    ua.account_name,
    act.account_type_name,
    cur.currency_code,
    ${DERIVED_BALANCE}::text AS account_balance
  FROM user_accounts ua
  JOIN account_types act ON act.account_type_id = ua.account_type_id
  JOIN currencies cur ON cur.currency_id = ua.currency_id
  WHERE ua.user_id = $1
    AND ua.account_id = $2
    AND ua.deleted_at IS NULL
    AND ua.closed_at IS NULL
`;

// Net worth before and after the reversal moves the residual onto the uncounted `boundary` account;
// "after" is the sum without the closing account (FILTER, so a non-counting type removes nothing). The
// counted types must match the hero's netWorth in makeHeroSection.js; this reads now, the hero at close.
const NET_WORTH_QUERY = `
  WITH counted AS (
    SELECT
      ua.account_id,
      ${DERIVED_BALANCE} AS balance
    FROM user_accounts ua
    JOIN account_types act ON act.account_type_id = ua.account_type_id
    WHERE ua.user_id = $1
      AND ua.deleted_at IS NULL
      AND ua.closed_at IS NULL
      AND act.account_type_name IN ('bank', 'cash', 'investment', 'debtor')
  )
  SELECT
    COALESCE(SUM(balance), 0)::text AS net_worth_before,
    COALESCE(SUM(balance) FILTER (WHERE account_id <> $2), 0)::text AS net_worth_after,
    EXISTS (SELECT 1 FROM counted WHERE account_id = $2) AS counts_toward_net_worth
  FROM counted
`;

/**
 * @param {object} db - pool; this is a read and takes no lock
 * @param {number} targetAccountId - the account the owner is about to close
 * @returns {Promise<{targetAccount: object, destinations: Array<object>, destinationCount: number}>}
 */
export const getClosePreview = async (db, userId, targetAccountId) => {
  // Sequential on purpose: a missing account is refused below before the net-worth
  // read is spent.
  const { rows } = await db.query(CLOSING_ACCOUNT_QUERY, [
    userId,
    targetAccountId,
  ]);

  if (rows.length === 0) {
    // 404 covers three cases on purpose (no such account, not this owner's, already
    // closed) so a caller cannot learn whether an account id they do not own exists.
    throw createError(
      404,
      `Account ${targetAccountId} was not found among your open accounts.`,
    );
  }

  const row = rows[0];

  const { rows: netWorthRows } = await db.query(NET_WORTH_QUERY, [
    userId,
    targetAccountId,
  ]);
  const netWorthRow = netWorthRows[0];

  return {
    targetAccount: {
      accountId: row.account_id,
      accountName: row.account_name,
      accountTypeName: row.account_type_name,
      currencyCode: row.currency_code,
      // Text, as the driver returned it. CLOSE refuses any nonzero balance, so this
      // figure decides whether the close is accepted; the screen shows it to
      // explain a refusal.
      residual: row.account_balance,
    },
    // Text, like the residual: the pg driver's float conversion would round these.
    netWorth: {
      before: netWorthRow.net_worth_before,
      after: netWorthRow.net_worth_after,
      countsTowardNetWorth: netWorthRow.counts_toward_net_worth,
    },
    // Frozen empty rather than removed: the frontend deploys separately from the
    // backend, and a missing key fails silently where an empty one does not.
    destinations: [],
    destinationCount: 0,
  };
};
