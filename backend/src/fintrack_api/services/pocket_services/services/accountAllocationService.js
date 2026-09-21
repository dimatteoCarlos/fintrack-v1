// How much of one real account is committed to pockets and how much is not. One source
// because the allocate service (inside its row lock) and the account screen must agree.

import {
 getAccountAllocations,
 getPocketsForAccount,
} from '../db/accountAllocationRepository.js';
import { makeAccountAllocation } from '../core/makeAccountAllocation.js';
import { toAmount } from '../../budget_services/core/money.js';

// Only these hold spendable cash the owner can commit: unassigned cash is
// meaningless on a credit card, a market-valued investment account or a debtor.
const ACCOUNTS_WITH_UNASSIGNED_CASH = ['bank', 'cash'];

export const accountAllocationService = {
 /**
  * Allocation lines for the account detail, or null when the account type has none.
  *
  * Negative unassigned cash is served as is, flagged over-allocated: it blocks nothing,
  * and the shortfall is never split across pockets (any split would invent causality).
  *
  * @param {string} userId - from the token
  * @param {number} accountId - already proven to be the caller's
  * @returns {Promise<object|null>}
  */
 async getAccountAllocation(db, userId, accountId, accountTypeName) {
  if (!ACCOUNTS_WITH_UNASSIGNED_CASH.includes(accountTypeName)) {
   return null;
  }

  const [accountRows, pocketRows] = await Promise.all([
   getAccountAllocations(db, userId, [accountId]),
   getPocketsForAccount(db, userId, accountId),
  ]);

  // The read filters out the internal 'slack' account and soft-deleted rows;
  // neither is a pocket source, so empty means "no figures apply", not an error.
  if (accountRows.length === 0) {
   return null;
  }

  const account = makeAccountAllocation(accountRows[0]);

  return {
   allocated: account.accountAllocated,
   unassignedCash: account.accountUnassignedCash,
   isOverAllocated: account.isOverAllocated,
   pockets: pocketRows.map((row) => ({
    pocketId: row.pocketId,
    name: row.name,
    heldFromThisAccount: toAmount(row.heldFromThisAccount),
   })),
  };
 },

 /**
  * The same figures for many accounts in one query (pockets omitted: one query each).
  * A filtered-out account (internal or soft-deleted) is absent from the map; the caller
  * leaves its figures unset, since a zero would claim nothing is committed to it.
  *
  * @param {string} userId - from the token
  * @param {number[]} accountIds - already proven to be the caller's
  * @returns {Promise<Map<number, object>>} keyed by account id
  */
 async getAllocationsByAccountId(db, userId, accountIds) {
  if (accountIds.length === 0) {
   return new Map();
  }

  const rows = await getAccountAllocations(db, userId, accountIds);

  return new Map(
   rows.map((row) => {
    const account = makeAccountAllocation(row);

    return [
     account.accountId,
     {
      allocated: account.accountAllocated,
      unassignedCash: account.accountUnassignedCash,
      isOverAllocated: account.isOverAllocated,
     },
    ];
   }),
  );
 },
};
