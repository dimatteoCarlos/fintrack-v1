/**
 * Official COP provider: the TRM (Tasa Representativa del Mercado), an open dataset on datos.gov.co
 * (Socrata), no API key. Same shape as cotizaveApiProvider (VES). A row is valid from vigenciadesde
 * to vigenciahasta, so a weekend or holiday carries the last business day's rate.
 */

import axios from 'axios';

const TRM_DATASET_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json';

const FX_TIMEOUT_MS = Number(process.env.FX_REQUEST_TIMEOUT_MS || 2000);

// Colombia has no DST, so the dataset's naked timestamps are always UTC-05:00.
const COLOMBIA_UTC_OFFSET = '-05:00';
const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;

// A published TRM older than this is treated as unusable rather than served stale.
const MAX_TRM_AGE_DAYS = 7;

// A month holds at most 31 validities, so the cap flags a window wider than
// intended rather than paging: hitting it is treated as a failure.
const TRM_RANGE_ROW_LIMIT = 200;

/** Parse a dataset timestamp (e.g. '2026-08-22T00:00:00.000') as Colombian local time. */
function parseColombianDate(value) {
 if (typeof value !== 'string' || !value) return null;
 const parsed = new Date(`${value}${COLOMBIA_UTC_OFFSET}`);
 return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Fetch the currently effective TRM. fetchedAt is the read time, not vigenciadesde: dating by
 * publication would make a Sunday rate look 48h stale and expire the FX state on every request.
 *
 * @returns {Promise<{rate: number, source: string, fetchedAt: Date, publishedAt: Date}>}
 * @throws {Error} - On network failure, malformed payload or a stale rate
 */
export async function fetchTrm() {
 const headers = {};

 // Optional: raises the anonymous Socrata rate limit. Not required.
 if (process.env.DATOS_GOV_APP_TOKEN) {
  headers['X-App-Token'] = process.env.DATOS_GOV_APP_TOKEN;
 }

 const response = await axios.get(TRM_DATASET_URL, {
  timeout: FX_TIMEOUT_MS,
  headers,
  params: { '$limit': 1, '$order': 'vigenciadesde DESC' },
 });

 const row = Array.isArray(response.data) ? response.data[0] : null;

 if (!row) {
  throw new Error('TRM dataset returned no rows');
 }

 const rate = Number(row.valor);

 if (!Number.isFinite(rate) || rate <= 0) {
  throw new Error(`Invalid TRM value: ${row.valor}`);
 }

 const publishedAt = parseColombianDate(row.vigenciadesde);

 if (!publishedAt) {
  throw new Error(`Invalid TRM vigenciadesde: ${row.vigenciadesde}`);
 }

 const ageDays = (Date.now() - publishedAt.getTime()) / 86400000;

 if (ageDays > MAX_TRM_AGE_DAYS) {
  throw new Error(`TRM is ${Math.floor(ageDays)} days old`);
 }

 console.log(`[FX] Banrep TRM usd -> cop: ${rate} (published ${row.vigenciadesde})`);

 return {
  rate,
  source: 'banrep-trm',
  fetchedAt: new Date(),
  publishedAt,
  // The day is STATED by the provider (vigenciadesde is already a calendar date),
  // not derived from an instant: deriving one would fabricate an effective date.
  providerDay: String(row.vigenciadesde).slice(0, 10),
 };
}

/**
 * Normalize a 'YYYY-MM-DD' string, ISO timestamp or Date to the dataset's calendar
 * day, or null. Colombia has no DST, so a Date is read at a fixed UTC-05:00 offset.
 */
function toColombianDay(value) {
 let day = null;

 if (value instanceof Date) {
  if (Number.isNaN(value.getTime())) return null;
  day = new Date(value.getTime() - COLOMBIA_OFFSET_MS).toISOString().slice(0, 10);
 } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
  day = value.slice(0, 10);
 }

 if (!day) return null;

 // Rejects a well-formed but impossible day such as '2026-02-31'.
 const parsed = new Date(`${day}T00:00:00.000Z`);

 if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
  return null;
 }

 return day;
}


/**
 * Fetch every TRM validity that overlaps a window, one row per validity. A range, not a day at a time:
 * the as-of lookup takes the latest row on or before a day, so a missing validity resolves onto a
 * superseded rate. The window is complete or the arm fails. An uncovered window returns [], not an error.
 *
 * @param {string|Date} from - First day of the window
 * @param {string|Date} to - Last day of the window
 * @returns {Promise<Array<{rateDate: string, rate: string, source: string}>>}
 *   Each row under the day its validity opens on, oldest first.
 * @throws {Error} - On an invalid window, network failure or malformed payload
 */
export async function fetchTrmRange(from, to) {
 const firstDay = toColombianDay(from);
 const lastDay = toColombianDay(to);

 if (!firstDay || !lastDay) {
  throw new Error(`Invalid TRM range requested: ${from}..${to}`);
 }

 const headers = {};

 if (process.env.DATOS_GOV_APP_TOKEN) {
  headers['X-App-Token'] = process.env.DATOS_GOV_APP_TOKEN;
 }

 const response = await axios.get(TRM_DATASET_URL, {
  timeout: FX_TIMEOUT_MS,
  headers,
  params: {
   // Overlap, not containment: the validity in force on the first day usually opened before it.
   // Both days are validated above, so neither can carry a SoQL fragment.
   '$where':
    `vigenciahasta >= '${firstDay}T00:00:00.000'` +
    ` AND vigenciadesde <= '${lastDay}T23:59:59.999'`,
   '$order': 'vigenciadesde ASC',
   '$limit': TRM_RANGE_ROW_LIMIT,
  },
 });

 if (!Array.isArray(response.data)) {
  throw new Error(`Banrep returned a malformed payload for ${firstDay}..${lastDay}`);
 }

 // A truncated page would look like a short month and silently leave the tail of
 // the window uncovered, so fail rather than store an incomplete window.
 if (response.data.length === TRM_RANGE_ROW_LIMIT) {
  throw new Error(
   `Banrep range ${firstDay}..${lastDay} hit the ${TRM_RANGE_ROW_LIMIT}-row limit`,
  );
 }

 const series = [];

 for (const row of response.data) {
  const rate = Number(row.valor);
  const effectiveDate = String(row.vigenciadesde || '').slice(0, 10);

  if (!Number.isFinite(rate) || rate <= 0 || effectiveDate.length !== 10) {
   console.warn(`[FX] Banrep skipping malformed row: ${JSON.stringify(row)}`);
   continue;
  }

  // The provider's own string: the parse only validates and must not set the
  // column's precision.
  series.push({ rateDate: effectiveDate, rate: String(row.valor), source: 'banrep-trm' });
 }

 console.log(
  `[FX] Banrep TRM usd -> cop for ${firstDay}..${lastDay}: ${series.length} validities`,
 );

 return series;
}

/** Fetch the cop rate for a base currency; null when the base is not usd or the fetch fails. */
export async function fetchAllRates(baseCurrency) {
 try {
  const base = typeof baseCurrency === 'string' ? baseCurrency.toLowerCase() : '';

  // The TRM is a USD/COP quote; any other base has to come from an aggregator.
  if (base !== 'usd') return null;

  const result = await fetchTrm();

  return {
   rates: {
    cop: {
     rate: result.rate,
     source: result.source,
     fetchedAt: result.fetchedAt,
     // publishedAt (the validity start) leaves under providerUpdatedAt, the one
     // name the assembler reads.
     providerUpdatedAt: result.publishedAt || null,
     providerDay: result.providerDay || null,
    },
   },
   source: result.source,
   fetchedAt: result.fetchedAt,
   providerUpdatedAt: result.publishedAt || null,
   providerDay: result.providerDay || null,
  };
 } catch (error) {
  console.warn('⚠️ Banrep TRM fetchAllRates failed:', error.message);
  return null;
 }
}
