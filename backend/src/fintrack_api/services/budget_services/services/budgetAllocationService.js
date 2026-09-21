// Write path for monthly budget allocations: the rules live here, the SQL in budgetAllocationRepository.js.
// A budget is one amount per expense account and month, in force until a later row replaces it;
// nothing is prorated or carried over.

import {
 MINIMUM_AMOUNT,
 isFiniteMoney,
 isWithinAmountRange,
 money,
 toAmount,
} from '../core/money.js';
import {
 insertFirstAllocation,
 resolveCurrentMonth,
 writeAllocation,
} from '../db/budgetAllocationRepository.js';
// The one appliesUntil value that is not a month; imported so the wire contract has one copy.
import { OPEN_ENDED } from '../../../../validation/zod/budgetValidators.js';
// The converter every write path uses: skipping it stored a budget typed as 50000 cop as
// 50000 usd (migration 014), which the schema cannot detect afterwards. Migration 017
// adds the columns that prove the conversion ran.
import { currencyAmountConversion } from '../../fx_services/conversion/currencyAmountConversion.js';
import {
 getCurrencyCodeSync,
 getCurrencyId,
} from '../../../../utils/currencyLookup.js';

const forbidden = (message) =>
 Object.assign(new Error(message), { status: 403 });

const badRequest = (message) =>
 Object.assign(new Error(message), { status: 400 });

// 422, not 400: the payload parsed; what fails is a relationship between fields, or
// between one and the owner's calendar, which a schema cannot see.
const unprocessable = (message) =>
 Object.assign(new Error(message), { status: 422 });

/**
 * Validate an amount and return it at the column's scale; the single choke point for every write.
 * Zero is accepted: it is how "stop budgeting" is expressed; only the remove action sends it.
 */
const normalizeAmount = (budgetAmount) => {
 if (!isFiniteMoney(budgetAmount)) {
  throw badRequest('budgetAmount must be a number.');
 }

 if (!isWithinAmountRange(budgetAmount)) {
  throw badRequest('budgetAmount exceeds the maximum storable amount.');
 }

 const normalizedAmount = toAmount(budgetAmount);

 if (normalizedAmount < 0) {
  throw badRequest('budgetAmount cannot be negative.');
 }

 // A sub-cent amount is positive on screen but stores as 0.00, i.e. "stop budgeting",
 // a different decision; naming the minimum tells the caller what to correct.
 if (normalizedAmount === 0 && money(budgetAmount).greaterThan(0)) {
  throw badRequest(
   `budgetAmount must be at least ${MINIMUM_AMOUNT} in the account currency, or exactly 0 to stop budgeting.`,
  );
 }

 return normalizedAmount;
};

/**
 * Resolve an account owned via the user_accounts.user_id join and lock it against concurrent saves;
 * missing and not-owned both give 403 so ids cannot be enumerated. account_start_month (single
 * AT TIME ZONE, as in the migration 012 backfill) exists because the raw date rejects the first month.
 */
const lockOwnedAccount = async (client, userId, accountId, timeZone = 'UTC') => {
 const { rows } = await client.query(
  // currency_id comes from category_budget_accounts (sole owner since 010, NOT NULL since
  // 011): it is both the conversion target and the FK the allocation records. Read here
  // because the lock already holds the row.
  `SELECT ua.account_id,
          ua.account_start_date,
          cba.currency_id,
          date_trunc('month', ua.account_start_date AT TIME ZONE $3)::date::text
            AS account_start_month
     FROM user_accounts ua
     JOIN category_budget_accounts cba ON cba.account_id = ua.account_id
    WHERE ua.account_id = $1
      AND ua.user_id = $2
      FOR UPDATE OF ua`,
  [accountId, userId, timeZone],
 );

 if (rows.length === 0) {
  throw forbidden('Account not found or not owned by the authenticated user.');
 }

 return rows[0];
};

/**
 * Write the first allocation of a newly created budget account. Takes a client so it rolls back with
 * the account row; no ownership check (created in this transaction). budgetAmount arrives already
 * converted by the creation controller (migration 014), so the row records an identity conversion.
 *
 * @param {number} currencyId - the account's currency, required by 017.
 */
async function createAllocationForAccount(
 client,
 accountId,
 budgetAmount,
 accountStartDate,
 timeZone = 'UTC',
 currencyId,
) {
 return insertFirstAllocation(
  client,
  accountId,
  normalizeAmount(budgetAmount),
  accountStartDate,
  timeZone,
  currencyId,
 );
}

/**
 * Set the budget of one account over a range of months. Owns its transaction: the allocation and the
 * row restoring the previous amount at the far edge are one decision. Enforces what a schema cannot:
 * month not after today or before the account start, range not ending before it begins ('YYYY-MM-01' text).
 *
 * @param {object} allocation - { amount, currency, month, appliesUntil }, already
 *  coerced by the validator. currency is the code the amount is typed in, not the one
 *  it is stored in; appliesUntil is a month or OPEN_ENDED.
 * @returns {Promise<object>} what was written, what the range gives back to, and
 *  the months it replaced.
 */
async function setCurrentMonthBudget(
 pool,
 userId,
 accountId,
 allocation,
 timeZone = 'UTC',
) {
 const { amount, currency, month, appliesUntil } = allocation;

 // Checked before a connection is taken: it needs no row or calendar, so a
 // self-contradicting range is rejected for free.
 if (appliesUntil !== OPEN_ENDED && appliesUntil < month) {
  throw unprocessable(
   `appliesUntil (${appliesUntil}) must not be earlier than month (${month}).`,
  );
 }

 const client = await pool.connect();

 try {
  await client.query('BEGIN');

  const account = await lockOwnedAccount(client, userId, accountId, timeZone);
  const { month: currentMonth } = await resolveCurrentMonth(client, timeZone);

  // V1 has no future to write into: a later month would have no spending to compare
  // against. A range reaches later months through appliesUntil, not this bound.
  if (month > currentMonth) {
   throw unprocessable(
    `month (${month}) must not be later than the current month (${currentMonth}).`,
   );
  }

  // Nothing to budget before the account existed; an earlier row would also outrank the
  // first allocation and silently take over the months between.
  if (month < account.account_start_month) {
   throw unprocessable(
    `month (${month}) is earlier than the account start month (${account.account_start_month}).`,
   );
  }

  // Converted before normalizing (the column's scale belongs to the stored currency), at the rate on
  // the month's first day, not the saving day; an unpriceable month is refused with 422. Matching
  // codes are an identity conversion that still records what it did.
  const accountCurrency = getCurrencyCodeSync(account.currency_id);
  const converted = await currencyAmountConversion(
   amount,
   currency,
   accountCurrency,
   month,
   timeZone,
  );

  const normalizedAmount = normalizeAmount(converted.amount.toNumber());

  const written = await writeAllocation(
   client,
   accountId,
   normalizedAmount,
   month,
   appliesUntil === OPEN_ENDED ? null : appliesUntil,
   {
    // The figure as typed, normalized on its own: it is a different amount in a
    // different currency, so one rounding does not answer for the other.
    originalAmount: normalizeAmount(amount),
    // Resolved on this transaction's client: inside BEGIN, a second connection would not
    // see a currency row added by an uncommitted migration on this one.
    originalCurrencyId: await getCurrencyId(client, currency),
    rate: converted.rate,
    source: converted.source,
    fetchedAt: converted.fetchedAt,
    targetCurrencyId: account.currency_id,
   },
  );

  // cba.budget is the standing monthly amount the accounting dashboard sums; only an
  // open-ended save has no far edge, so only it stays in force after a bounded range expires.
  if (appliesUntil === OPEN_ENDED) {
   await client.query(
    `UPDATE category_budget_accounts SET budget = $1 WHERE account_id = $2`,
    [normalizedAmount, accountId],
   );
  }

  await client.query('COMMIT');

  // appliesUntil is echoed in the caller's vocabulary, not the null the repository
  // uses, so the response reads back as the request.
  return {
   accountId: written.accountId,
   budgetMonth: written.budgetMonth,
   budgetAmount: written.budgetAmount,
   // Both the typed and the stored amount are returned, so the converted figure does
   // not read as a correction nobody made.
   originalAmount: written.originalAmount,
   originalCurrency: currency,
   currency: accountCurrency,
   exchangeRate: written.exchangeRate,
   appliesUntil,
   restoresTo: written.restoresTo,
   restoresFrom: written.restoresFrom,
   overwrittenMonths: written.overwrittenMonths,
  };
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {
  client.release();
 }
}

export const budgetAllocationService = {
 createAllocationForAccount,
 setCurrentMonthBudget,
};
