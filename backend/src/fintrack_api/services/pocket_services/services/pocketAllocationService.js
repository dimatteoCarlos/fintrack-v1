// Write path for committing money to a pocket and releasing it back. Neither writes a transaction
// or account_balance: an allocation is a claim, and over-allocation is displayed, never refused.
// The client sends a positive amount and never a sign; the sign is written here.

import { pool } from '../../../../db/config/configDB.js';
import {
 MINIMUM_AMOUNT,
 isFiniteMoney,
 isWithinAmountRange,
 money,
 toAmount,
 toAmountString,
} from '../../budget_services/core/money.js';
import { currencyAmountConversion } from '../../fx_services/conversion/currencyAmountConversion.js';
import {
 getCurrencyCodeSync,
 getCurrencyId,
} from '../../../../utils/currencyLookup.js';
import {
 ACCOUNTING_CURRENCY_CODE,
 BACKDATING_WINDOW_MONTHS,
} from '../../../config/fintrackConfig.js';
import { getUserTimeZone } from '../../../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import {
 dayInZone,
 earliestDatableDay,
 isCalendarDate,
 todayInZone,
} from '../../../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';
import { getPocketForUser } from '../db/pocketRepository.js';
import {
 getHeldByPocketFromAccount,
 insertAllocation,
 lockOwnedSourceAccount,
} from '../db/accountAllocationRepository.js';

// Bank and cash only: an investment balance is a market valuation (a price move would fake an
// over-allocation), and the other types hold no spendable cash.
const ELIGIBLE_SOURCE_TYPES = ['bank', 'cash'];

const INTERNAL_ACCOUNT_NAME = 'slack';

const forbidden = (message) =>
 Object.assign(new Error(message), { status: 403 });

const badRequest = (message) =>
 Object.assign(new Error(message), { status: 400 });

// 422, not 400: the payload is well formed; what fails is a rule about the row
// behind an id or the relationship between two figures, which a schema cannot see.
const unprocessable = (message) =>
 Object.assign(new Error(message), { status: 422 });

// Formats amounts in refusal messages; the unit is always ACCOUNTING_CURRENCY_CODE (convertTypedAmount
// refuses other accounts). Intl supplies symbol and decimals; the guard falls back to the bare
// code because an unknown code makes the constructor throw, and a 500 tells the owner nothing.
const accountingAmountFormat = (() => {
 try {
  return new Intl.NumberFormat('en-US', {
   style: 'currency',
   currency: ACCOUNTING_CURRENCY_CODE.toUpperCase(),
   currencyDisplay: 'narrowSymbol',
  });
 } catch {
  return null;
 }
})();

const statedAmount = (value) =>
 accountingAmountFormat
  ? accountingAmountFormat.format(toAmount(value))
  : `${ACCOUNTING_CURRENCY_CODE.toUpperCase()} ${toAmountString(value)}`;

/**
 * Validate an amount and return it at the column's scale. Zero is rejected (CHECK (amount <> 0));
 * a sub-cent amount would store as 0.00, so it is refused here where the minimum can be named.
 */
const normalizeAmount = (value) => {
 if (!isFiniteMoney(value)) {
  throw badRequest('amount must be a number.');
 }

 if (!isWithinAmountRange(value)) {
  throw badRequest('amount exceeds the maximum storable amount.');
 }

 const normalized = toAmount(value);

 if (normalized <= 0) {
  throw badRequest(
   `amount must be at least ${MINIMUM_AMOUNT} in the accounting currency.`,
  );
 }

 return normalized;
};

/**
 * Resolve the decision's day and refuse one outside the window: the movement path's three checks
 * (shape, not future, not before the back-dating floor) on the owner's calendar. The account
 * opening-day check needs the row and runs in assertEligibleSource.
 *
 * @returns {{requestedDay: string, todayForOwner: string, asOfDay: string|null}}
 *  asOfDay is null on today, which routes the conversion to the current rate.
 */
const resolveAllocationDay = (requested, timeZone) => {
 const todayForOwner = todayInZone(timeZone);
 const requestedDay = typeof requested === 'string' ? requested.trim() : '';

 if (requestedDay === '') {
  return { requestedDay: '', todayForOwner, asOfDay: null };
 }

 if (!isCalendarDate(requestedDay)) {
  throw badRequest('allocationDate must be a calendar day, YYYY-MM-DD.');
 }

 if (requestedDay > todayForOwner) {
  throw unprocessable(
   `An allocation cannot be dated after today, ${todayForOwner}.`,
  );
 }

 const windowFloor = earliestDatableDay(todayForOwner, BACKDATING_WINDOW_MONTHS);

 if (requestedDay < windowFloor) {
  throw unprocessable(`An allocation cannot be dated before ${windowFloor}.`);
 }

 return {
  requestedDay,
  todayForOwner,
  asOfDay: requestedDay < todayForOwner ? requestedDay : null,
 };
};

/**
 * Prove the source account may back a pocket (422: a domain rule, not a malformed payload).
 * Deleted, internal and wrong-type checks apply to allocating only: refusing a release would
 * strand money committed from a since-deleted account. The opening-day check applies to both.
 *
 * @param {object} account - the locked row
 * @param {string} chosenDay - YYYY-MM-DD, or '' when the decision is undated
 * @param {string} timeZone - the owner's IANA zone
 * @param {'allocate'|'release'} direction - which decision is being written
 */
const assertEligibleSource = (account, chosenDay, timeZone, direction) => {
 // Compared as calendar days, never instants: account_start_date keeps a wall-clock time, so an
 // account opened at 20:00 would refuse a decision on its own opening day (composed to 12:00).
 if (chosenDay !== '') {
  const openingDay = dayInZone(account.accountStartDate, timeZone);

  if (openingDay && chosenDay < openingDay) {
   throw unprocessable(
    `Account "${account.accountName}" was opened on ${openingDay} and cannot back an allocation dated before it.`,
   );
  }
 }

 // Everything below asks whether the account may take on a commitment, which a
 // release never does; giving one back is bounded only by what the pair holds.
 if (direction === 'release') return;

 if (account.deletedAt !== null) {
  throw unprocessable(
   `Account "${account.accountName}" has been deleted and cannot back a pocket.`,
  );
 }

 if (account.accountName === INTERNAL_ACCOUNT_NAME) {
  throw unprocessable('The internal account cannot back a pocket.');
 }

 if (!ELIGIBLE_SOURCE_TYPES.includes(account.accountType)) {
  throw unprocessable(
   `Account "${account.accountName}" is of type ${account.accountType}; only ${ELIGIBLE_SOURCE_TYPES.join(' and ')} accounts can back a pocket.`,
  );
 }
};

/**
 * Convert the typed figure into the accounting currency and keep the proof. pockets.target_amount
 * is in that unit; the guard refuses other-currency accounts to avoid an implicit 1:1 comparison.
 *
 * @param {string|null} asOfDay - the day to value on, null for today
 * @param {string} timeZone - the owner's IANA zone
 */
const convertTypedAmount = async (
 client,
 amount,
 currencyCode,
 account,
 asOfDay,
 timeZone,
) => {
 const accountCurrency = getCurrencyCodeSync(account.currencyId);

 if (accountCurrency !== ACCOUNTING_CURRENCY_CODE) {
  throw unprocessable(
   `Account "${account.accountName}" is kept in ${accountCurrency}; a pocket allocation is measured in ${ACCOUNTING_CURRENCY_CODE} and the two cannot be compared.`,
  );
 }

 // A back-dated allocation is valued at the rate in force that day (null routes
 // to the current rate); otherwise the row would pair an August date with a
 // September rate and differ from the preview the owner approved.
 const converted = await currencyAmountConversion(
  amount,
  currencyCode,
  ACCOUNTING_CURRENCY_CODE,
  asOfDay,
  // The same zone asOfDay was decided on, so the resolver's future guard and
  // this module's floor agree on which day it is.
  timeZone,
 );

 return {
  amount: normalizeAmount(converted.amount.toNumber()),
  // Normalized on its own: a different amount in a different currency, so one
  // rounding does not answer for the other.
  originalAmount: normalizeAmount(amount),
  // Resolved on this transaction's client, not the pool: the write is inside
  // BEGIN, and a lookup on a second connection would not see a currency row
  // added by an uncommitted migration on this one.
  originalCurrencyId: await getCurrencyId(client, currencyCode),
  exchangeRate: converted.rate,
  exchangeRateSource: converted.source,
  exchangeRateTimestamp: converted.fetchedAt,
 };
};

/**
 * Commit or release pocket money on the caller's client. No BEGIN/COMMIT/ROLLBACK here: errors
 * propagate so the caller's rollback covers them (account closing releases inside its transaction).
 *
 * @param {import('pg').PoolClient} client - inside the caller's transaction,
 *   which is also where the source account has to be locked
 * @param {{timeZone:string, requestedDay:string, asOfDay:string|null}} day -
 *   resolved before the transaction opens, see writeLedgerRow
 */
const writeLedgerRowOnClient = async (
 client,
 direction,
 userId,
 pocketId,
 body,
 { timeZone, requestedDay, asOfDay },
) => {
 const pocket = await getPocketForUser(client, userId, pocketId);

 if (pocket === null) {
  throw forbidden('Pocket not found or not owned by the authenticated user.');
 }

 const account = await lockOwnedSourceAccount(
  client,
  userId,
  body.sourceAccountId,
 );

 if (account === null) {
  throw forbidden('Account not found or not owned by the authenticated user.');
 }

 assertEligibleSource(account, requestedDay, timeZone, direction);

 const converted = await convertTypedAmount(
  client,
  body.amount,
  body.currency,
  account,
  asOfDay,
  timeZone,
 );

 const requested = money(converted.amount);

 if (direction === 'allocate') {
  // A precondition of allocating only; a CHECK would also block a real expense,
  // which must always be accepted.
  const unassignedCash = money(account.accountBalance).minus(
   account.accountAllocated,
  );

  if (requested.greaterThan(unassignedCash)) {
   throw unprocessable(
    `Cannot commit ${statedAmount(requested)} to this pocket: "${account.accountName}" has ${statedAmount(unassignedCash)} of unassigned cash.`,
   );
  }
 } else {
  // The running sum of the (pocket, source account) pair may never go below zero:
  // a pocket cannot give back more than it holds from that account, which is why
  // the release form names a source rather than a total.
  const held = money(
   await getHeldByPocketFromAccount(
    client,
    userId,
    pocketId,
    body.sourceAccountId,
   ),
  );

  if (requested.greaterThan(held)) {
   throw unprocessable(
    `Cannot release ${statedAmount(requested)} from "${account.accountName}": this pocket holds ${statedAmount(held)} from it.`,
   );
  }
 }

 // The sign is written here and nowhere else. original_amount carries it too,
 // so the stored figure stays the origin figure times the rate and the audit
 // pair reconciles in both magnitude and direction.
 const sign = direction === 'allocate' ? 1 : -1;

 const written = await insertAllocation(client, userId, {
  pocketId,
  sourceAccountId: body.sourceAccountId,
  amount: toAmount(requested.times(sign)),
  // Null on today (a decision taken now keeps the real instant; only a past one
  // is anchored at noon). The same value the conversion was priced on, so the
  // row's date and rate cannot describe two different days.
  allocationDate: asOfDay,
  timeZone,
  originalAmount: toAmount(money(converted.originalAmount).times(sign)),
  originalCurrencyId: converted.originalCurrencyId,
  exchangeRate: converted.exchangeRate,
  exchangeRateSource: converted.exchangeRateSource,
  exchangeRateTimestamp: converted.exchangeRateTimestamp,
  // The unit of amount, which is the pocket target's unit: read from the account,
  // whose currency the guard above proved.
  exchangeRateTargetCurrencyId: account.currencyId,
 });

 return {
  allocationId: Number(written.allocationId),
  pocketId,
  sourceAccountId: account.accountId,
  sourceAccountName: account.accountName,
  amount: toAmount(written.amount),
 };
};

/**
 * Commit money to a pocket or release it. Check and insert share one transaction with the source
 * account locked FOR UPDATE, else concurrent requests both pass and over-commit. It is opened here
 * only without a client; given one, the work follows the caller's outcome (a failed close undoes it).
 *
 * @param {'allocate'|'release'} direction
 * @param {import('pg').PoolClient|null} externalClient - the caller's client,
 *   already inside its transaction, or null to open one here
 * @returns {Promise<object>} the row written, and the figures it moved
 */
const writeLedgerRow = async (
 direction,
 userId,
 pocketId,
 body,
 externalClient = null,
) => {
 // Resolved before the transaction opens: the conversion depends on the day, and an HTTP rate call
 // inside a transaction would hold it open. Uses the caller's client to avoid a second connection.
 const timeZone = await getUserTimeZone(externalClient ?? pool, userId);

 const { requestedDay, asOfDay } = resolveAllocationDay(
  body.allocationDate,
  timeZone,
 );

 const day = { timeZone, requestedDay, asOfDay };

 if (externalClient !== null) {
  return writeLedgerRowOnClient(
   externalClient,
   direction,
   userId,
   pocketId,
   body,
   day,
  );
 }

 const client = await pool.connect();

 try {
  await client.query('BEGIN');

  const written = await writeLedgerRowOnClient(
   client,
   direction,
   userId,
   pocketId,
   body,
   day,
  );

  await client.query('COMMIT');

  return written;
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {
  client.release();
 }
};

export const pocketAllocationService = {
 /** POST /pocket/:pocketId/allocations */
 allocate: (userId, pocketId, body) =>
  writeLedgerRow('allocate', userId, pocketId, body),

 /**
  * POST /pocket/:pocketId/releases
  *
  * dbClient is optional; account closing passes its own so the release lives or
  * dies with the close.
  */
 release: (userId, pocketId, body, dbClient = null) =>
  writeLedgerRow('release', userId, pocketId, body, dbClient),
};
