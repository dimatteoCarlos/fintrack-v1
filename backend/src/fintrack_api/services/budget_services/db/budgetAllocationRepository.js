// SQL for budget_monthly_allocations; domain rules live in budgetAllocationService.js.
// A row stays in force until a later row replaces it, so reads resolve the LAST row at or before the month.
// Months use the owner's calendar: a boundary computed in any other zone lands in the neighbouring month.

import { toAmount } from '../core/money.js';

/**
 * First day of the current month on the owner's calendar, derived server-side, never taken from the client.
 * Returned as text: a DATE crossing the driver becomes a local-zone JS Date and loses the owner's calendar.
 *
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<{month: string}>} as 'YYYY-MM-DD'
 */
export async function resolveCurrentMonth(client, timeZone = 'UTC') {
 const { rows } = await client.query(
  `SELECT date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text
            AS month`,
  [timeZone],
 );

 return { month: rows[0].month };
}

/**
 * The budget in force for one account in one month.
 *
 * @returns {Promise<number|null>} the amount, or null when no row precedes the
 *  month, which reads as "never budgeted", distinct from a stored 0.
 */
export async function getAllocationForMonth(client, accountId, month) {
 const { rows } = await client.query(
  `SELECT budget_amount
     FROM budget_monthly_allocations
    WHERE account_id = $1
      AND budget_month <= $2
    ORDER BY budget_month DESC
    LIMIT 1`,
  [accountId, month],
 );

 return rows.length === 0 ? null : toAmount(rows[0].budget_amount);
}

/**
 * The last decision taken strictly BEFORE a month. Currently uncalled: the write path needs the amount AT
 * the month (getAllocationForMonth); kept for authoring a future month, which this lookup serves.
 *
 * @returns {Promise<number|null>} null when nothing precedes the month.
 */
export async function getAllocationBefore(client, accountId, month) {
 const { rows } = await client.query(
  `SELECT budget_amount
     FROM budget_monthly_allocations
    WHERE account_id = $1
      AND budget_month < $2
    ORDER BY budget_month DESC
    LIMIT 1`,
  [accountId, month],
 );

 return rows.length === 0 ? null : toAmount(rows[0].budget_amount);
}

/**
 * The month after a bound, derived in SQL to keep month arithmetic with the calendar; returned as text for
 * the same reason as resolveCurrentMonth.
 */
async function monthAfter(client, month) {
 const { rows } = await client.query(
  `SELECT ($1::date + INTERVAL '1 month')::date::text AS month`,
  [month],
 );

 return rows[0].month;
}

/**
 * Write a budget over a range of months, or from `from` on when `to` is null (deleting every later row).
 * Order: read the amount at `to` + 1, delete the range, write at `from`, restore that amount at `to` + 1.
 * Must run on the caller's client: the four statements are one decision and must commit together.
 *
 * @param {number} budgetAmount - the amount in the account's currency, already
 *  converted and normalized by the service.
 * @param {string} from - first month in force, as 'YYYY-MM-01'
 * @param {string|null} to - last month in force, or null for no end
 * @param {object} fx - the conversion that produced budgetAmount:
 *  { originalAmount, originalCurrencyId, rate, source, fetchedAt, targetCurrencyId }.
 *  Required, with no default: a default identity would silently record a
 *  conversion that never happened (see migration 014).
 * @returns {Promise<object>} the amount written, what the range gives back to,
 *  and the months whose stored decision this write replaced.
 */
export async function writeAllocation(
 client,
 accountId,
 budgetAmount,
 from,
 to,
 fx,
) {
 // Read AT `to` + 1, not at `from`: a row already sitting on the far edge states
 // what that month is worth, and carrying `from`'s amount there would overwrite
 // a decision this write was never asked to touch.
 const restoresFrom = to === null ? null : await monthAfter(client, to);
 const restoresTo =
  restoresFrom === null
   ? null
   : await getAllocationForMonth(client, accountId, restoresFrom);

 // COALESCE rather than two statements: bounded by `to` when given, unbounded
 // otherwise, and the removed months come back the same way either way.
 const { rows: overwritten } = await client.query(
  `DELETE FROM budget_monthly_allocations
    WHERE account_id = $1
      AND budget_month > $2::date
      AND budget_month <= COALESCE($3::date, 'infinity'::date)
    RETURNING budget_month::text`,
  [accountId, from, to],
 );

 // budget_amount is the converted figure; the six columns beside it make it
 // auditable. All of them are overwritten on conflict: surviving FX metadata from
 // an earlier write would describe a figure that is no longer there.
 const { rows } = await client.query(
  `INSERT INTO budget_monthly_allocations (
     account_id, budget_month, budget_amount,
     original_budget_amount, original_currency_id,
     exchange_rate, exchange_rate_source, exchange_rate_timestamp,
     exchange_rate_target_currency_id)
   VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
   ON CONFLICT (account_id, budget_month)
   DO UPDATE SET budget_amount = EXCLUDED.budget_amount,
     original_budget_amount = EXCLUDED.original_budget_amount,
     original_currency_id = EXCLUDED.original_currency_id,
     exchange_rate = EXCLUDED.exchange_rate,
     exchange_rate_source = EXCLUDED.exchange_rate_source,
     exchange_rate_timestamp = EXCLUDED.exchange_rate_timestamp,
     exchange_rate_target_currency_id = EXCLUDED.exchange_rate_target_currency_id,
     updated_at = CURRENT_TIMESTAMP
   RETURNING budget_allocation_id, account_id, budget_month::text, budget_amount,
     original_budget_amount, exchange_rate`,
  [
   accountId,
   from,
   budgetAmount,
   fx.originalAmount,
   fx.originalCurrencyId,
   fx.rate,
   fx.source,
   fx.fetchedAt,
   fx.targetCurrencyId,
  ],
 );

 if (restoresFrom !== null) {
  // DO NOTHING: a row on the far edge is the decision being restored (a plain insert would raise 23505).
  // Falls back to 0 when nothing governed the month, since only a row stops the carry-forward.
  // Identity FX: the amount was read from this table, so no user stated it in another currency.
  await client.query(
   `INSERT INTO budget_monthly_allocations (
      account_id, budget_month, budget_amount,
      original_budget_amount, original_currency_id,
      exchange_rate, exchange_rate_source, exchange_rate_timestamp,
      exchange_rate_target_currency_id)
    VALUES ($1, $2::date, $3, $3, $4, 1.0, 'identity', CURRENT_TIMESTAMP, $4)
    ON CONFLICT (account_id, budget_month) DO NOTHING`,
   [accountId, restoresFrom, restoresTo ?? 0, fx.targetCurrencyId],
  );
 }

 return {
  accountId: rows[0].account_id,
  budgetMonth: rows[0].budget_month,
  budgetAmount: toAmount(rows[0].budget_amount),
  // The figure as typed and the rate that converted it, so the caller can confirm
  // the conversion to the user.
  originalAmount: toAmount(rows[0].original_budget_amount),
  exchangeRate: Number(rows[0].exchange_rate),
  // What the month after the range gives back, and which month that is, so the
  // caller can word the confirmation without resolving either again. Both null
  // when the change has no end.
  restoresTo: restoresFrom === null ? null : (restoresTo ?? 0),
  restoresFrom,
  // The months whose stored decision this write replaced, ascending. Sorted
  // here because DELETE ... RETURNING takes no ORDER BY, and text sorts
  // chronologically since every bound is a first of month.
  overwrittenMonths: overwritten.map((row) => row.budget_month).sort(),
 };
}

/**
 * Write the first allocation of a newly created account, dated at its START month so a backdated account
 * reports a budget from its start. Nothing terminates it, so it recurs.
 */
export async function insertFirstAllocation(
 client,
 accountId,
 budgetAmount,
 accountStartDate,
 timeZone = 'UTC',
 currencyId,
) {
 // Same expression as the migration 012 backfill; one AT TIME ZONE only, a second yields a timestamptz
 // whose date cast reads the session zone. Identity FX: the creation-time conversion is recorded on
 // category_budget_accounts (migration 014); repeating it here would be a second copy.
 const { rows } = await client.query(
  `INSERT INTO budget_monthly_allocations (
     account_id, budget_month, budget_amount,
     original_budget_amount, original_currency_id,
     exchange_rate, exchange_rate_source, exchange_rate_timestamp,
     exchange_rate_target_currency_id)
   VALUES ($1,
    date_trunc('month', $2::timestamptz AT TIME ZONE $3)::date,
    $4, $4, $5, 1.0, 'identity', CURRENT_TIMESTAMP, $5)
   ON CONFLICT (account_id, budget_month)
   DO UPDATE SET budget_amount = EXCLUDED.budget_amount,
     original_budget_amount = EXCLUDED.original_budget_amount,
     updated_at = CURRENT_TIMESTAMP
   RETURNING budget_allocation_id, account_id, budget_month::text, budget_amount`,
  [accountId, accountStartDate, timeZone, budgetAmount, currencyId],
 );

 return {
  accountId: rows[0].account_id,
  budgetMonth: rows[0].budget_month,
  budgetAmount: toAmount(rows[0].budget_amount),
 };
}
