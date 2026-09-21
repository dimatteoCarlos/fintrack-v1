// One pocket and everything its screen shows, in one request, so the hero, the
// source breakdown and the allocation list cannot disagree about what it holds.

import {
 getCalendarToday,
 getPocketForUser,
 getPocketHistory,
} from '../db/pocketRepository.js';
import {
 getAccountAllocations,
 getAccountIdentitiesById,
 getPocketSourceHoldings,
} from '../db/accountAllocationRepository.js';
import { makePocketStatus } from '../core/makePocketStatus.js';
import { makeAccountAllocation } from '../core/makeAccountAllocation.js';
import { makeAllocationEntry } from '../core/makeAllocationEntry.js';
import { toAmount, money } from '../../budget_services/core/money.js';

// A missing pocket and another user's pocket both answer 403: splitting them
// would let a caller walk the id space and learn which pockets others own.
const forbidden = (message) =>
 Object.assign(new Error(message), { status: 403 });

/**
 * The accounts this pocket draws on; one whose net fell to zero after a full release is omitted.
 * covered is the account's own state, not the pocket's share: when false, the shortfall is never
 * split across the pockets drawing on it (any split would need an invented policy).
 */
const buildSources = (holdings, accountRows, identities = new Map()) => {
 const accounts = new Map(
  accountRows.map((row) => [row.accountId, makeAccountAllocation(row)]),
 );

 return holdings
  .map((holding) => {
   const account = accounts.get(holding.accountId);

   // Named by the allocation ledger but absent from the account read (soft-deleted, or the internal
   // 'slack' account): its held amount still counts, so the row is served with the account figures
   // null. The name comes from the identity read, keeping two deleted accounts distinguishable.
   if (!account) {
    const identity = identities.get(holding.accountId);

    return {
     accountId: holding.accountId,
     accountName: identity?.accountName ?? null,
     accountType: identity?.accountType ?? null,
     // Carried so the release form can date a decision against it; without it the
     // form admits every day and only the server refuses.
     accountStartDate: identity?.accountStartDate ?? null,
     // The row is still offered and release still runs: the eligibility refusals in
     // pocketAllocationService apply to ALLOCATING; giving a commitment back is
     // always allowed.
     accountIsDeleted: identity?.isDeleted ?? null,
     heldByThisPocket: toAmount(holding.heldByThisPocket),
     accountAllocated: null,
     accountBalance: null,
     accountUnassignedCash: null,
     covered: null,
    };
   }

   return {
    accountId: account.accountId,
    accountName: account.accountName,
    accountType: account.accountType,
    accountStartDate: account.accountStartDate,
    // false, not null: the main read filters deleted_at IS NULL, so this account
    // is known not to be deleted.
    accountIsDeleted: false,
    heldByThisPocket: toAmount(holding.heldByThisPocket),
    accountAllocated: account.accountAllocated,
    accountBalance: account.accountBalance,
    accountUnassignedCash: account.accountUnassignedCash,
    covered: !account.isOverAllocated,
   };
  })
  .sort((a, b) => money(b.heldByThisPocket).comparedTo(a.heldByThisPocket));
};

export const pocketDetailService = {
 /**
  * One pocket of one user.
  *
  * @param {import('pg').Pool} pool
  * @param {string} userId - from the token
  * @param {number} pocketId - from the path
  * @param {string} timeZone - the owner's IANA zone, resolved by the controller
  * @returns {Promise<{pocket: object, sources: object[], history: object[], meta: {notices: string[]}}>}
  * @throws {Error & {status: 403}} when the pocket is missing or not the caller's
  */
 async getDetail(pool, userId, pocketId, timeZone) {
  const [today, row] = await Promise.all([
   getCalendarToday(pool, timeZone),
   getPocketForUser(pool, userId, pocketId, timeZone),
  ]);

  if (row === null) {
   throw forbidden('Pocket not found or not owned by the authenticated user.');
  }

  const [holdings, accountRows, historyRows] = await Promise.all([
   getPocketSourceHoldings(pool, userId, pocketId),
   getAccountAllocations(pool, userId),
   getPocketHistory(pool, userId, pocketId, timeZone),
  ]);

  // Only the ids the main read could not answer for, and only when there are
  // any: a pocket funded entirely by live accounts issues no second query.
  const knownAccountIds = new Set(accountRows.map((row) => row.accountId));
  const unresolvedIds = holdings
   .map((holding) => holding.accountId)
   .filter((accountId) => !knownAccountIds.has(accountId));

  const identityRows = await getAccountIdentitiesById(
   pool,
   userId,
   unresolvedIds,
  );

  const sources = buildSources(
   holdings,
   accountRows,
   new Map(identityRows.map((row) => [row.accountId, row])),
  );

  const status = makePocketStatus(row, today);
  const pocket = {
   ...status,
   uncovered: sources.some((source) => source.covered === false),
  };

  // sourceCount is for the card, which has no room for the table; this screen
  // shows the table itself, so the count would be a second answer to the rows.
  delete pocket.sourceCount;

  return {
   pocket,
   sources,
   history: historyRows.map(makeAllocationEntry),
   meta: { notices: [] },
  };
 },
};
