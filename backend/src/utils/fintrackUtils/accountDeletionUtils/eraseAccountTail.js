// Erasure tail for the hard-delete and RTA paths: clears every reference to the account so the final
// DELETE FROM user_accounts does not hit the RESTRICT foreign keys of migration 018. CLOSE never calls
// it, so a closed account's settlement rows keep both account names permanently.

/**
 * Detach, scrub and drop a target account, inside an open transaction.
 * @param {import('pg').PoolClient} dbClient - Client inside BEGIN.
 * @param {string} userId - UUID of the account's owner.
 * @param {number} targetAccountId - The account being deleted.
 * @param {string} targetAccountName - Current name read from the database, never client-supplied: a
 *  stale or missing name would scrub nothing, or the wrong text.
 */
export const eraseAccountTail = async (
  dbClient,
  userId,
  targetAccountId,
  targetAccountName,
) => {
  // Detach and scrub: null the source/destination FK of surviving rows naming the target; strip its name
  // from the description; account_id is untouched. Annulment rows are not reached (target in neither key
  // column), so its name stays in their 'RTA Annulment Target(<name>).' description.
  await dbClient.query(
    `UPDATE transactions
        SET source_account_id = NULL,
            description = REPLACE(description, $2, '[deleted account]')
      WHERE source_account_id = $1
        AND account_id <> $1`,
    [targetAccountId, targetAccountName],
  );
  await dbClient.query(
    `UPDATE transactions
        SET destination_account_id = NULL,
            description = REPLACE(description, $2, '[deleted account]')
      WHERE destination_account_id = $1
        AND account_id <> $1`,
    [targetAccountId, targetAccountName],
  );

  // Where a row is physically removed only when no other account's row references the target, both
  // statements above match zero rows. They stay because that precondition lives in the caller, and a
  // tail that assumes its caller checked detaches nothing when called unchecked.

  // selected_account_name is free text with no FK, so it is scrubbed here, before the DELETE below:
  // once ON DELETE SET NULL nulls selected_account_id (both schema builds), this WHERE matches nothing.
  await dbClient.query(
    `UPDATE debtor_accounts
        SET selected_account_name = NULL
      WHERE selected_account_id = $1`,
    [targetAccountId],
  );

  // pocket_allocations.source_account_id is NOT NULL with RESTRICT and cannot be detached, so its rows are
  // deleted here, so the history leaves with the account. Allocating writes no transactions row, so removal
  // check over transactions alone would miss an account backing allocations; pocketImpact reports it first.
  await dbClient.query(
    'DELETE FROM pocket_allocations WHERE source_account_id = $1 AND user_id = $2',
    [targetAccountId, userId],
  );

  // Drop the target's own rows, then the account. RESTRICT stays as the guard: a reference that
  // survived the UPDATEs above makes this DELETE fail instead of leaving a dangling reference.
  await dbClient.query('DELETE FROM transactions WHERE account_id = $1', [
    targetAccountId,
  ]);
  await dbClient.query(
    'DELETE FROM user_accounts WHERE account_id = $1 AND user_id = $2',
    [targetAccountId, userId],
  );
};
