// Account id sets the Overview calculators read over. Every set drives off account_identity, not
// user_accounts (migration 035 repoints movements at account_registry), so a deleted or closed
// account's spending stays in past months and the breakdown keeps reconciling with totalAmount.

import { createError } from '../../../../utils/errorHandling.js';
import { accountIdentityCte } from '../../../../utils/fintrackUtils/accountDataRetrieval/accountIdentity.js';

// Every category_budget account ever owned, deleted ones included. No join to category_budget_accounts:
// it would drop an account whose budget row was removed, whose spending hasUncategorizedExpense reveals.
// The account_types join is INNER: an account erased before account_registry existed has no type.
const EXPENSE_ACCOUNT_IDS_QUERY = `
  WITH ${accountIdentityCte('$1')}
  SELECT ai.account_id
  FROM account_identity ai
  JOIN account_types act ON act.account_type_id = ai.account_type_id
  WHERE act.account_type_name = 'category_budget'
  ORDER BY ai.account_id
`;

// Accounts holding real money: income is the leg landing in the user's own account, so the set (not a
// transaction_type_id filter, which could drift) selects it. The compensation account (own type since 031)
// is never admitted; cash counts as bank; pocket_saving stays out since migration 020 emptied that type.
const INCOME_ACCOUNT_IDS_QUERY = `
  WITH ${accountIdentityCte('$1')}
  SELECT ai.account_id
  FROM account_identity ai
  JOIN account_types act ON act.account_type_id = ai.account_type_id
  WHERE act.account_type_name IN ('bank', 'cash', 'investment', 'debtor')
  ORDER BY ai.account_id
`;

// Every account except the compensation account, matched by type ('boundary') alone so an owner's
// account named 'slack' stays in. Wider than pnl on purpose (annulment rows land on any type); INNER
// join so an unreadable type is dropped. Gap: createBasicAccount skips assertUserCreatableAccountType.
const PNL_ACCOUNT_IDS_QUERY = `
  WITH ${accountIdentityCte('$1')}
  SELECT ai.account_id
  FROM account_identity ai
  JOIN account_types act ON act.account_type_id = ai.account_type_id
  WHERE act.account_type_name <> 'boundary'
  ORDER BY ai.account_id
`;

// Accounts of one type; the type keeps the compensation account (the closure settlement's counterparty
// leg) out of the investment reconciliation. No deleted_at filter: departed accounts stay for past
// months and contribute 0 today via annulments. The type is a bind parameter, not SQL structure.
const ACCOUNT_IDS_BY_TYPE_QUERY = `
  WITH ${accountIdentityCte('$1')}
  SELECT ai.account_id
  FROM account_identity ai
  JOIN account_types act ON act.account_type_id = ai.account_type_id
  WHERE act.account_type_name = ANY($2::text[])
  ORDER BY ai.account_id
`;

// Oldest account on the owner's calendar, as local-date text: a delta is reported only when a full
// prior period existed; NULL reads as "younger than the prior month". Over the CTE because this is a
// MINIMUM: closing the oldest account would otherwise move the date forward.
const OLDEST_ACCOUNT_DATE_QUERY = `
  WITH ${accountIdentityCte('$1')}
  SELECT (MIN(ai.account_created_at) AT TIME ZONE $2)::date::text AS oldest_account_date
  FROM account_identity ai
`;

/**
 * The category_budget accounts of a user, closed and soft-deleted included.
 *
 * @param {string} userId - UUID from the token, never from the client body
 * @returns {Promise<number[]>} account ids, ascending
 */
export async function getExpenseAccountIds(pool, userId) {
 if (!userId) {
  throw createError(400, 'A user id is required to read expense accounts.');
 }

 const { rows } = await pool.query(EXPENSE_ACCOUNT_IDS_QUERY, [userId]);
 return rows.map((row) => row.account_id);
}

/**
 * The real money accounts of a user, slack excluded — the set income is read over.
 *
 * @param {string} userId - UUID from the token, never from the client body
 * @returns {Promise<number[]>} account ids, ascending
 */
export async function getIncomeAccountIds(pool, userId) {
 if (!userId) {
  throw createError(400, 'A user id is required to read income accounts.');
 }

 const { rows } = await pool.query(INCOME_ACCOUNT_IDS_QUERY, [userId]);
 return rows.map((row) => row.account_id);
}

/**
 * Every account of a user except slack — the set realized P/L is read over.
 *
 * @param {string} userId - UUID from the token, never from the client body
 * @returns {Promise<number[]>} account ids, ascending
 */
export async function getPnlAccountIds(pool, userId) {
 if (!userId) {
  throw createError(400, 'A user id is required to read pnl accounts.');
 }

 const { rows } = await pool.query(PNL_ACCOUNT_IDS_QUERY, [userId]);
 return rows.map((row) => row.account_id);
}

/**
 * The accounts of one type belonging to a user. The type keeps the compensation
 * account out, so an owner's own account named 'slack' stays in.
 *
 * @param {string} userId - UUID from the token, never from the client body
 * @param {string[]} accountTypeNames - names from the account_types catalog
 * @returns {Promise<number[]>} account ids, ascending
 */
async function getAccountIdsByType(pool, userId, accountTypeNames) {
 const label = accountTypeNames.join('/');

 if (!userId) {
  throw createError(400, `A user id is required to read ${label} accounts.`);
 }

 const { rows } = await pool.query(ACCOUNT_IDS_BY_TYPE_QUERY, [userId, accountTypeNames]);
 return rows.map((row) => row.account_id);
}

/**
 * The debtor accounts of a user — the set the net debt position is read over.
 *
 * @param {string} userId - UUID from the token
 * @returns {Promise<number[]>} account ids, ascending
 */
export async function getDebtAccountIds(pool, userId) {
 return getAccountIdsByType(pool, userId, ['debtor']);
}

/**
 * The accounts money can be spent from: what "bank" means in this module. 'cash' travels with 'bank'
 * as in overviewPageRepository.js so no set disagrees with the hero; no path creates cash today.
 *
 * @param {string} userId - UUID from the token
 * @returns {Promise<number[]>} account ids, ascending
 */
export async function getBankAccountIds(pool, userId) {
 return getAccountIdsByType(pool, userId, ['bank', 'cash']);
}

/**
 * The investment accounts of a user — the set the investment figures are read over.
 *
 * @param {string} userId - UUID from the token
 * @returns {Promise<number[]>} account ids, ascending
 */
export async function getInvestmentAccountIds(pool, userId) {
 return getAccountIdsByType(pool, userId, ['investment']);
}

/**
 * The local date the user's oldest account was created, or null if they have none.
 *
 * @param {string} userId - UUID from the token
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<string|null>} 'YYYY-MM-DD', or null
 */
export async function getOldestAccountDate(pool, userId, timeZone = 'UTC') {
 const { rows } = await pool.query(OLDEST_ACCOUNT_DATE_QUERY, [userId, timeZone]);
 return rows[0]?.oldest_account_date ?? null;
}
