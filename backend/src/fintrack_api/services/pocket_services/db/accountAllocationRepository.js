// Committed-to-pockets totals per account and which pocket draws on which account. Read
// here once so the allocate service (under a row lock) and the account screen agree.
// Balance is ledger-derived, not user_accounts.account_balance; amounts stay NUMERIC text.

import { derivedAccountBalanceSql } from '../../../../utils/fintrackUtils/accountDataRetrieval/derivedBalance.js';

const DERIVED_BALANCE = derivedAccountBalanceSql('ua', 'NUMERIC');

/**
 * The committed total and real balance of accounts the caller owns. Includes accounts no
 * pocket draws on (LEFT JOIN) so the screen shows "0 committed"; excludes 'slack'.
 * @param {string} userId - UUID from the token
 * @param {number[]|null} accountIds - restrict to these; null means every one
 * @returns {Promise<object[]>} { accountId, accountName, accountType,
 *  accountBalance, accountAllocated } with the two amounts as text
 */
export async function getAccountAllocations(db, userId, accountIds = null) {
 const { rows } = await db.query(
  `
  SELECT
   ua.account_id                       AS "accountId",
   ua.account_name                     AS "accountName",
   act.account_type_name               AS "accountType",
   -- The floor of the dates the account accepts, sent with the list so the date
   -- picker can hide what the server would refuse.
   ua.account_start_date               AS "accountStartDate",
   -- Derived from the ledger, not the stored column: it must equal the ceiling the
   -- locked check below enforces, or the server refuses a commitment whose limit
   -- the owner was never shown.
   ${DERIVED_BALANCE}::text            AS "accountBalance",
   COALESCE(SUM(pa.amount), 0)::text   AS "accountAllocated"
  FROM user_accounts ua
  JOIN account_types act ON act.account_type_id = ua.account_type_id
  LEFT JOIN pocket_allocations pa ON pa.source_account_id = ua.account_id
  WHERE ua.user_id = $1
   AND ua.deleted_at IS NULL
   AND ua.closed_at IS NULL
   AND ua.account_name <> 'slack'
   AND act.account_type_name IS DISTINCT FROM 'boundary'
   AND ($2::int[] IS NULL OR ua.account_id = ANY($2::int[]))
  GROUP BY ua.account_id, act.account_type_name
  ORDER BY ua.account_name ASC
  `,
  [userId, accountIds],
 );

 return rows;
}

/**
 * Names the ledger's accounts that getAccountAllocations filters out. Separate because
 * loosening that filter would put deleted accounts on the allocate picker; this resolves
 * only the ids passed. Ownership is proven by user_id; foreign accounts are absent.
 * @param {string} userId - UUID from the token
 * @param {number[]} accountIds - the unresolved ids, never null
 * @returns {Promise<object[]>} { accountId, accountName, accountType,
 *  accountStartDate, isDeleted }
 */
export async function getAccountIdentitiesById(db, userId, accountIds) {
 if (!accountIds.length) return [];

 const { rows } = await db.query(
  `
  SELECT
   ua.account_id                        AS "accountId",
   ua.account_name                      AS "accountName",
   act.account_type_name                AS "accountType",
   ua.account_start_date                AS "accountStartDate",
   (ua.deleted_at IS NOT NULL)          AS "isDeleted"
  FROM user_accounts ua
  JOIN account_types act ON act.account_type_id = ua.account_type_id
  WHERE ua.user_id = $1
   AND ua.account_id = ANY($2::int[])
  `,
  [userId, accountIds],
 );

 return rows;
}

/**
 * Which accounts each pocket draws on, per (pocket, source account) pair: the level a
 * release is measured at. Pairs whose net fell to zero are dropped; history keeps them.
 * @param {string} userId - UUID from the token
 * @param {number|null} pocketId - restrict to one pocket; null means every one
 * @returns {Promise<object[]>} { pocketId, accountId, heldByThisPocket } with
 *  the amount as text
 */
export async function getPocketSourceHoldings(db, userId, pocketId = null) {
 const { rows } = await db.query(
  `
  SELECT
   pa.pocket_id                AS "pocketId",
   pa.source_account_id        AS "accountId",
   SUM(pa.amount)::text        AS "heldByThisPocket"
  FROM pocket_allocations pa
  WHERE pa.user_id = $1
   AND ($2::int IS NULL OR pa.pocket_id = $2::int)
  GROUP BY pa.pocket_id, pa.source_account_id
  HAVING SUM(pa.amount) <> 0
  `,
  [userId, pocketId],
 );

 return rows;
}

/**
 * The pockets one account is backing, and how much of it each one holds, listed
 * by name for the account screen. A pocket whose net from this account fell to
 * zero is absent; its own history keeps the trace.
 *
 * @param {string} userId - UUID from the token
 * @returns {Promise<object[]>} { pocketId, name, heldFromThisAccount } as text
 */
export async function getPocketsForAccount(db, userId, accountId) {
 const { rows } = await db.query(
  `
  SELECT
   p.pocket_id            AS "pocketId",
   p.name                 AS name,
   SUM(pa.amount)::text   AS "heldFromThisAccount"
  FROM pocket_allocations pa
  JOIN pockets p ON p.pocket_id = pa.pocket_id
  WHERE pa.user_id = $1
   AND pa.source_account_id = $2
  GROUP BY p.pocket_id, p.name
  HAVING SUM(pa.amount) <> 0
  ORDER BY p.name ASC
  `,
  [userId, accountId],
 );

 return rows;
}

/**
 * What each account gets back when one pocket is deleted. Read before the delete, in the
 * same transaction: afterwards the ledger is gone by cascade.
 * @param {import('pg').PoolClient} client - inside BEGIN
 * @param {string} userId - UUID from the token
 * @returns {Promise<object[]>} { accountId, accountName, freedCash } as text
 */
export async function getFreedCashByAccount(client, userId, pocketId) {
 const { rows } = await client.query(
  `
  SELECT
   pa.source_account_id   AS "accountId",
   ua.account_name        AS "accountName",
   SUM(pa.amount)::text   AS "freedCash"
  FROM pocket_allocations pa
  JOIN user_accounts ua ON ua.account_id = pa.source_account_id
  WHERE pa.user_id = $1
   AND pa.pocket_id = $2
  GROUP BY pa.source_account_id, ua.account_name
  HAVING SUM(pa.amount) <> 0
  ORDER BY ua.account_name ASC
  `,
  [userId, pocketId],
 );

 return rows;
}

/**
 * Locks an owned source account for the transaction and reports what is committed to it.
 * FOR UPDATE stops two simultaneous allocations from over-committing the same cash. Null
 * covers both "not found" and "not yours", so account ids cannot be enumerated.
 * @param {import('pg').PoolClient} client - inside BEGIN; a pool would release
 *  the lock the moment this query returned
 * @param {string} userId - UUID from the token
 * @returns {Promise<object|null>} the row, or null when there is none
 */
export async function lockOwnedSourceAccount(client, userId, accountId) {
 const { rows } = await client.query(
  `
  SELECT
   ua.account_id                     AS "accountId",
   ua.account_name                   AS "accountName",
   act.account_type_name             AS "accountType",
   ua.account_start_date             AS "accountStartDate",
   ua.currency_id                    AS "currencyId",
   ua.deleted_at                     AS "deletedAt",
   COALESCE((
    SELECT SUM(pa.amount)
      FROM pocket_allocations pa
     WHERE pa.source_account_id = ua.account_id
   ), 0)::text                       AS "accountAllocated"
  FROM user_accounts ua
  JOIN account_types act ON act.account_type_id = ua.account_type_id
  WHERE ua.account_id = $1
   AND ua.user_id = $2
  FOR UPDATE OF ua
  `,
  [accountId, userId],
 );

 if (!rows[0]) return null;

 // Second statement, not joined into the locking one: a joined read mixes the locked
 // row's latest version with an older snapshot. A fresh snapshot sees the competitor the
 // lock waited out; it must equal the picker's figure or a 422 quotes another number.
 const { rows: derived } = await client.query(
  `SELECT ${DERIVED_BALANCE}::text AS "accountBalance"
     FROM user_accounts ua
    WHERE ua.account_id = $1`,
  [accountId],
 );

 return { ...rows[0], accountBalance: derived[0].accountBalance };
}

/**
 * The net one pocket holds from one account, read inside the lock: the figure a
 * release is measured against, since the running sum of the pair may never go
 * below zero.
 *
 * @param {import('pg').PoolClient} client - inside BEGIN
 * @param {string} userId - UUID from the token
 * @returns {Promise<string>} the net as text, '0' when the pair has no rows
 */
export async function getHeldByPocketFromAccount(
 client,
 userId,
 pocketId,
 accountId,
) {
 const { rows } = await client.query(
  `
  SELECT COALESCE(SUM(pa.amount), 0)::text AS held
    FROM pocket_allocations pa
   WHERE pa.user_id = $1
     AND pa.pocket_id = $2
     AND pa.source_account_id = $3
  `,
  [userId, pocketId, accountId],
 );

 return rows[0].held;
}

/**
 * Appends one ledger row, the only write this table takes (no UPDATE or DELETE: +300
 * becomes +250 by writing -50). amount is signed by the service, never the client. A past
 * day is anchored at noon in the owner's zone so no zone conversion moves it a day.
 * @param {import('pg').PoolClient} client - inside BEGIN, holding the account lock
 * @returns {Promise<object>} the row written
 */
export async function insertAllocation(client, userId, allocation) {
 const { rows } = await client.query(
  `
  INSERT INTO pocket_allocations (
   user_id, pocket_id, source_account_id, amount, allocation_actual_date,
   original_amount, original_currency_id, exchange_rate, exchange_rate_source,
   exchange_rate_timestamp, exchange_rate_target_currency_id
  )
  VALUES ($1, $2, $3, $4,
          CASE
           WHEN $5::date IS NULL THEN CURRENT_TIMESTAMP
           ELSE ($5::date + TIME '12:00') AT TIME ZONE $12
          END,
          $6, $7, $8, $9, $10, $11)
  RETURNING allocation_id::text AS "allocationId",
            amount::text        AS amount,
            allocation_actual_date AS "allocationActualDate"
  `,
  [
   userId,
   allocation.pocketId,
   allocation.sourceAccountId,
   allocation.amount,
   allocation.allocationDate ?? null,
   allocation.originalAmount,
   allocation.originalCurrencyId,
   allocation.exchangeRate,
   allocation.exchangeRateSource,
   allocation.exchangeRateTimestamp,
   allocation.exchangeRateTargetCurrencyId,
   allocation.timeZone,
  ],
 );

 return rows[0];
}
