/**
 * Historical FX rate store: daily_exchange_rates (append-only, migration 021) and
 * exchange_rate_query_coverage (023), which records which day ranges were asked of a provider.
 * Kept apart from the current-rate cache (fxDBaccess.js), which RESET_EXCHANGE_RATES drops.
 */

import { pool } from '../../../../db/config/configDB.js';
import { FALLBACK_RATE_SOURCE } from '../core/fxConfig.js';

/**
 * Max age in days of a stored row still used as the answer for a requested day.
 * A closed market looks like a never-fetched stretch, so an unbounded walk-back would serve stale rates.
 * Five days clears the longest run of closed days.
 */
export const MAX_RATE_AGE_DAYS = 5;

/**
 * @typedef {Object} DailyRateRow
 * @property {string} rateDate - The day the rate was in force, YYYY-MM-DD.
 * @property {string|number} rate - The rate itself.
 * @property {string} source - Provider name, at most 30 characters.
 */

/**
 * @typedef {Object} DailyRateHit
 * @property {string} rate - The rate, as DECIMAL text.
 * @property {string} rateDate - The day it was in force, YYYY-MM-DD.
 * @property {string} source - Which provider supplied it.
 * @property {number} daysBack - Requested day minus rateDate, in days.
 * @property {Date} fetchedAt - When this installation read the rate from the
 *  provider, not the day it was in force.
 */

/** YYYY-MM-DD of a Date or ISO-like string, or null: this store speaks calendar days, never instants. */
const toCalendarDay = (value) => {
 if (typeof value === 'string') {
  const trimmed = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
 }
 if (value instanceof Date && !Number.isNaN(value.getTime())) {
  return value.toISOString().slice(0, 10);
 }
 return null;
};

/**
 * Newest row not after the requested day, within the age bound and COVERED by a recorded provider query,
 * so a walk-back never serves a superseded rate. ORDER BY ranks the CDN last, then latest fetch, then name.
 * Returns null on a miss; the rate stays DECIMAL text because a float parse would round it.
 */
export async function findDailyRate(
 baseCurrencyId,
 targetCurrencyId,
 requestedDate,
 maxAgeDays = MAX_RATE_AGE_DAYS,
) {
 const day = toCalendarDay(requestedDate);
 if (!day) {
  throw new Error(`Invalid requested date for rate lookup: ${requestedDate}`);
 }

 const { rows } = await pool.query(
  `
    SELECT exchange_rate,
           TO_CHAR(rate_date, 'YYYY-MM-DD') AS rate_date,
           source,
           fetched_at,
           ($3::date - rate_date)           AS days_back
      FROM daily_exchange_rates d
     WHERE base_currency_id = $1
       AND target_currency_id = $2
       AND rate_date <= $3::date
       AND rate_date >= $3::date - $4::int
       AND EXISTS (
             SELECT 1
               FROM exchange_rate_query_coverage c
              WHERE c.source             = d.source
                AND c.base_currency_id   = d.base_currency_id
                AND c.target_currency_id = d.target_currency_id
                AND c.covered @> daterange(d.rate_date, $3::date + 1, '[)')
           )
     ORDER BY rate_date DESC,
              (source = $5) ASC,
              fetched_at DESC,
              source ASC
     LIMIT 1
    `,
  [baseCurrencyId, targetCurrencyId, day, maxAgeDays, FALLBACK_RATE_SOURCE],
 );

 if (rows.length === 0) return null;

 const row = rows[0];
 return {
  rate: row.exchange_rate,
  rateDate: row.rate_date,
  source: row.source,
  daysBack: row.days_back,
  fetchedAt: row.fetched_at,
 };
}

/**
 * Persist the whole provider range response, each row under its own date, so later movements skip a call.
 * ON CONFLICT DO NOTHING: a past rate never changes and simultaneous submits collapse onto one row.
 * Returns rows newly written and the source used; coverage must be recorded under that same name.
 */
export async function persistDailyRates(
 rateRows,
 baseCurrencyId,
 targetCurrencyId,
 client = pool,
) {
 if (!rateRows?.length) return { stored: 0, source: 'unknown' };

 // Today in UTC, the calendar the provider's reference dates are stated in.
 const todayUtc = new Date().toISOString().slice(0, 10);

 const days = [];
 const rates = [];
 let source = null;

 for (const item of rateRows) {
  const day = toCalendarDay(item.rateDate);
  if (!day) {
   console.warn(`Skipping rate with no effective date: ${item.rateDate}`);
   continue;
  }

  // Not a CHECK constraint because CURRENT_DATE is not immutable, so the
  // no-future-rate invariant is enforced here.
  if (day > todayUtc) {
   console.warn(`Skipping rate dated in the future: ${day}`);
   continue;
  }

  const numericRate = Number(item.rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
   console.warn(`Skipping invalid rate for ${day}: ${item.rate}`);
   continue;
  }

  days.push(day);
  // The provider's own string: the parse above only validates and must not set
  // the column's precision.
  rates.push(String(item.rate));
  source = source ?? item.source;
 }

 if (days.length === 0) return { stored: 0, source: 'unknown' };

 // One statement over the whole range (UNNEST pairs the arrays positionally), so
 // the insert is atomic on its own; a caller with coverage to write passes its
 // client to get both under one commit.
 const { rowCount } = await client.query(
  `
    INSERT INTO daily_exchange_rates (
      base_currency_id,
      target_currency_id,
      rate_date,
      exchange_rate,
      source
    )
    SELECT $1, $2, d.rate_date, d.exchange_rate, $5
      FROM UNNEST($3::date[], $4::numeric[]) AS d(rate_date, exchange_rate)
    ON CONFLICT ON CONSTRAINT uq_daily_exchange_rate DO NOTHING
    `,
  [baseCurrencyId, targetCurrencyId, days, rates, source || 'unknown'],
 );

 console.log(
  `Rate history: ${rowCount} new of ${days.length} returned (${rateRows.length - days.length} skipped)`,
 );

 return { stored: rowCount, source: source || 'unknown' };
}

/**
 * Records that a provider answered for a pair over a span; `client` must be inside a transaction.
 * The xact advisory lock serialises overlapping submits; the exclusion constraint forbids overlapping rows.
 * One statement merges overlapping or touching spans, so a range crossing a month end still matches.
 */
export async function recordQueryCoverage(
 client,
 { baseCurrencyId, targetCurrencyId, source, from, to },
) {
 // Same key space as the exclusion constraint, so exactly the writers that can
 // collide wait for each other.
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
  `${source}:${baseCurrencyId}:${targetCurrencyId}`,
 ]);

 // `to + 1`, not `to + INTERVAL '1 day'`: a date plus an interval is a timestamp
 // and daterange(date, timestamp) does not exist. The half-open range needs the
 // day after the last one asked for.
 await client.query(
  `
    WITH asked AS (
      SELECT daterange($4::date, $5::date + 1, '[)') AS span
    ),
    absorbed AS (
      DELETE FROM exchange_rate_query_coverage c
       USING asked a
       WHERE c.source             = $3
         AND c.base_currency_id   = $1
         AND c.target_currency_id = $2
         AND (c.covered && a.span OR c.covered -|- a.span)
      RETURNING c.covered
    )
    INSERT INTO exchange_rate_query_coverage
           (base_currency_id, target_currency_id, source, covered)
    SELECT $1, $2, $3,
           daterange(
             LEAST(MIN(lower(covered)), (SELECT lower(span) FROM asked)),
             GREATEST(MAX(upper(covered)), (SELECT upper(span) FROM asked)),
             '[)')
      FROM absorbed
    `,
  [baseCurrencyId, targetCurrencyId, source, from, to],
 );
}

/**
 * Store a provider response and its asked span in one transaction: rows without coverage are never read,
 * and coverage without rows would claim a period was downloaded when it was not.
 * A span with no usable row writes nothing, or coverage would mark it asked-and-empty for good.
 */
export async function persistQueriedRange({
 rateRows,
 baseCurrencyId,
 targetCurrencyId,
 from,
 to,
}) {
 if (!rateRows?.length) return 0;

 const client = await pool.connect();

 try {
  await client.query('BEGIN');

  const { stored, source } = await persistDailyRates(
   rateRows,
   baseCurrencyId,
   targetCurrencyId,
   client,
  );

  // Nothing the provider sent was usable, so nothing was learnt about the span.
  if (source === 'unknown' && stored === 0) {
   await client.query('ROLLBACK');
   return 0;
  }

  await recordQueryCoverage(client, {
   baseCurrencyId,
   targetCurrencyId,
   source,
   from,
   to,
  });

  await client.query('COMMIT');

  return stored;
 } catch (error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {
  client.release();
 }
}

/**
 * Latest day on or before the requested one that any source published a rate for, in any pair.
 * Stands in for a holiday calendar: Banca d'Italia publishes nothing on closed days.
 * The CDN arm may only be asked for such a day; null (nothing within the bound) skips that arm.
 */
export async function findLatestBusinessDay(
 requestedDate,
 maxAgeDays = MAX_RATE_AGE_DAYS,
) {
 const day = toCalendarDay(requestedDate);
 if (!day) {
  throw new Error(`Invalid requested date for business day lookup: ${requestedDate}`);
 }

 const { rows } = await pool.query(
  `
    SELECT TO_CHAR(MAX(rate_date), 'YYYY-MM-DD') AS rate_date
      FROM daily_exchange_rates
     WHERE rate_date <= $1::date
       AND rate_date >= $1::date - $2::int
    `,
  [day, maxAgeDays],
 );

 return rows[0]?.rate_date || null;
}

/**
 * True when asking this source for the day cannot change the answer: its row and its coverage both exist.
 * Rows are matched on the source like findDailyRate; another provider's row would report the day settled,
 * skip the arm that repairs it, and turn a recoverable gap into a permanent 422.
 */
export async function isDaySettled(
 baseCurrencyId,
 targetCurrencyId,
 day,
 source,
) {
 const { rows } = await pool.query(
  `
    SELECT EXISTS (
             SELECT 1
               FROM daily_exchange_rates
              WHERE base_currency_id   = $1
                AND target_currency_id = $2
                AND rate_date          = $3::date
                AND source             = $4
           )
       AND EXISTS (
             SELECT 1
               FROM exchange_rate_query_coverage
              WHERE base_currency_id   = $1
                AND target_currency_id = $2
                AND source             = $4
                AND covered @> daterange($3::date, $3::date + 1, '[)')
           ) AS settled
    `,
  [baseCurrencyId, targetCurrencyId, day, source],
 );

 return rows[0]?.settled === true;
}
