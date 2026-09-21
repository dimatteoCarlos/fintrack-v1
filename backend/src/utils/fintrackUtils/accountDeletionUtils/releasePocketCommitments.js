// Releases everything one account has committed to pockets, inside the caller's transaction. Shared by every
// deletion type so no deleted account keeps backing a pocket; runs even at a zero balance (a commitment is not money).
// Released, not deleted: pocket_allocations is append-only (migration 020), so release writes a compensating row.

import { pocketAllocationService } from '../../../fintrack_api/services/pocket_services/services/pocketAllocationService.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../../fintrack_api/config/fintrackConfig.js';

/**
 * Releases every pocket commitment the account still backs, one release per pocket: the pocket module
 * checks the running sum of each (pocket, source account) pair against zero, which one total could not.
 * HAVING SUM > 0 skips settled pairs, since releasing zero violates the table's amount <> 0 CHECK.
 *
 * @param {import('pg').PoolClient} dbClient - Client inside the caller's BEGIN, so the releases roll
 *  back with the deletion
 * @param {string} userId - UUID from the token
 * @param {number} targetAccountId
 * @returns {Promise<{pocketId:number, amount:string}[]>} What each pocket got back; empty when the
 *  account backed nothing.
 */
export const releasePocketCommitments = async (
 dbClient,
 userId,
 targetAccountId,
) => {
 const pocketHoldings = await dbClient.query(
  `SELECT pa.pocket_id AS "pocketId", SUM(pa.amount)::text AS held
     FROM pocket_allocations pa
    WHERE pa.user_id = $1 AND pa.source_account_id = $2
    GROUP BY pa.pocket_id
   HAVING SUM(pa.amount) > 0`,
  [userId, targetAccountId],
 );

 const releasedPockets = [];

 for (const holding of pocketHoldings.rows) {
  // The pocket module's own release on this client: it applies the release guards but not the "may this
  // account back a pocket" ones, so a retry on an already-deleted account is not stranded.
  // ACCOUNTING_CURRENCY_CODE, not a lookup: only source accounts kept in it are accepted (identity conversion).
  const released = await pocketAllocationService.release(
   userId,
   holding.pocketId,
   {
    sourceAccountId: targetAccountId,
    amount: Number(holding.held),
    currency: ACCOUNTING_CURRENCY_CODE,
   },
   dbClient,
  );

  releasedPockets.push({
   pocketId: holding.pocketId,
   amount: released.amount,
  });
 }

 return releasedPockets;
};

export default releasePocketCommitments;
