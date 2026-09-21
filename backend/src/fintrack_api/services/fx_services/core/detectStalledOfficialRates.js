// Flags days where the official BCV rate looks stalled, by comparing it with an independent source.

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import pc from 'picocolors';

import { pool } from '../../../../db/config/configDB.js';
import {
 ACCOUNTING_CURRENCY_CODE,
 BCV_RATE_SOURCE,
 FALLBACK_RATE_SOURCE,
 OFFICIAL_BCV_CURRENCY,
} from './fxConfig.js';
import { BACKDATING_WINDOW_MONTHS } from '../../../config/fintrackConfig.js';
import {
 earliestDatableDay,
 todayInZone,
} from '../../../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';
import { fetchRatesForDate } from '../fxProviders/githubFallbackProvider.js';

// A stall is invisible inside one source: the official scraper can repeat a figure for weeks, and a
// held rate is normally fine (weekends, holidays). The signal is the gap's sign: healthy data has the
// independent CDN cross BELOW the official rate (54 of 58 days, never over 1% above); a stall inverts it.

// Minimum gap above the official rate, in percent. 0 means the direction alone: a
// magnitude band only caught stalls already weeks old, while direction plus a run
// flagged the start of one with no false positives on the measured window.
const DEFAULT_SIGNAL_PCT = 0;

// Consecutive candidate days that make a stall rather than a day the market led
// (four such isolated days in 58). Two is the smallest run that is not one day.
const DEFAULT_MIN_RUN_DAYS = 2;

/**
 * @typedef {Object} StalledDay
 * @property {string} day - The calendar day, YYYY-MM-DD.
 * @property {string} official - What the official source recorded, as text.
 * @property {string} independent - What the independent source recorded.
 * @property {number} gapPct - How far above the official the independent sits.
 * @property {number} runLength - 1-based position of this day within its run of flagged days.
 */

/**
 * The days a currency's official source looks stalled on. The official rate is read from the store;
 * the independent one is fetched from the CDN and never persisted. It changes no rate: a past rate
 * is a fact the store records.
 *
 * @param {Object} [args]
 * @param {string} [args.from] - First day, YYYY-MM-DD. Defaults to the floor of the
 *  back-dating window, since a day no movement can be dated on needs no warning.
 * @param {string} [args.to] - Last day. Defaults to today.
 * @param {number} [args.signalPct] - The band, in percent. 0 is the direction alone.
 * @param {number} [args.minRunDays] - Consecutive candidates a run needs to be reported.
 * @returns {Promise<{flagged: StalledDay[], compared: number, uncomparable: string[]}>}
 */
export async function detectStalledOfficialRates({
 currency = OFFICIAL_BCV_CURRENCY,
 officialSource = BCV_RATE_SOURCE,
 from,
 to,
 signalPct = DEFAULT_SIGNAL_PCT,
 minRunDays = DEFAULT_MIN_RUN_DAYS,
} = {}) {
 // UTC on purpose: this scans a shared store with no single owner, so there is no
 // calendar to prefer, and a day either way only widens the scan.
 const today = todayInZone('UTC');
 const start = from ?? earliestDatableDay(today, BACKDATING_WINDOW_MONTHS);
 const end = to ?? today;

 const { rows } = await pool.query(
  `SELECT d.rate_date::text     AS day,
          d.exchange_rate::text AS official
     FROM daily_exchange_rates d
     JOIN currencies base   ON base.currency_id   = d.base_currency_id
     JOIN currencies target ON target.currency_id = d.target_currency_id
    WHERE base.currency_code   = $1
      AND target.currency_code = $2
      AND d.source             = $3
      AND d.rate_date BETWEEN $4::date AND $5::date
    ORDER BY d.rate_date`,
  [ACCOUNTING_CURRENCY_CODE, currency, officialSource, start, end],
 );

 // Every official day in order with its verdict, not only the findings: the run
 // logic below must tell a healthy day from one it could not judge.
 const examined = [];
 const uncomparable = [];
 let compared = 0;

 for (const row of rows) {
  const official = Number(row.official);

  if (!Number.isFinite(official) || official <= 0) {
   uncomparable.push(row.day);
   examined.push({ day: row.day, verdict: 'unknown' });
   continue;
  }

  // Fetched, not read from the store: the cascade stops at the first source that answers, so official
  // days were never asked of the CDN and comparing stored rows would read as health. One call per day.
  let independent;

  try {
   const payload = await fetchRatesForDate(ACCOUNTING_CURRENCY_CODE, row.day);
   independent = payload.rates[currency]?.rate;
  } catch {
   // No CDN snapshot for this day: not a finding, but counted as uncomparable.
   independent = undefined;
  }

  if (!Number.isFinite(independent) || independent <= 0) {
   uncomparable.push(row.day);
   examined.push({ day: row.day, verdict: 'unknown' });
   continue;
  }

  compared += 1;

  const gapPct = ((independent - official) / official) * 100;

  if (gapPct > signalPct) {
   examined.push({
    day: row.day,
    verdict: 'candidate',
    finding: {
     day: row.day,
     official: row.official,
     independent: String(independent),
     gapPct,
     runLength: 0,
    },
   });
  } else {
   examined.push({ day: row.day, verdict: 'healthy' });
  }
 }

 // Only a compared, healthy day ends a run (the source was moving again). A day
 // without a row or without a second opinion proves nothing and leaves an open
 // run open, so a hole cannot split a stall into two runs too short to report.
 const runs = [];
 let open = null;

 for (const entry of examined) {
  if (entry.verdict === 'candidate') {
   if (!open) {
    open = [];
    runs.push(open);
   }
   open.push(entry.finding);
  } else if (entry.verdict === 'healthy') {
   open = null;
  }
 }

 const flagged = [];

 for (const run of runs) {
  if (run.length < minRunDays) continue;

  run.forEach((finding, index) => {
   flagged.push({ ...finding, runLength: index + 1 });
  });
 }

 return { flagged, compared, uncomparable };
}

/**
 * Runs the scan and logs the result; separate so callers can get the findings
 * without the output.
 *
 * @param {Object} [args] - Passed through to detectStalledOfficialRates.
 * @returns {Promise<StalledDay[]>}
 */
export async function reportStalledOfficialRates(args = {}) {
 const currency = args.currency ?? OFFICIAL_BCV_CURRENCY;

 let result;

 try {
  result = await detectStalledOfficialRates(args);
 } catch (error) {
  // A diagnostic must not take down its caller: report the failure, return nothing.
  console.warn(pc.yellow(`Stall scan for ${currency} could not run: ${error.message}`));
  return [];
 }

 const { flagged, compared, uncomparable } = result;

 // Printed on every run, clean or not: without it a scan that compared nothing
 // reads the same as a clean one.
 console.log(
  pc.cyan(
   `Stall scan ${currency}: ${compared} day(s) compared against ` +
    `${FALLBACK_RATE_SOURCE}, ${uncomparable.length} with no second opinion.`,
  ),
 );

 if (uncomparable.length > 0) {
  console.log(pc.cyan(`  not compared: ${uncomparable.join(' ')}`));
 }

 if (flagged.length === 0) {
  console.log(pc.cyan('  nothing looks stalled.'));
  return flagged;
 }

 const longest = flagged.reduce((a, b) => (b.runLength > a.runLength ? b : a));

 console.warn(
  pc.yellow(
   `  ${flagged.length} day(s) where the independent source sits above the ` +
    `official one, longest run ${longest.runLength}.`,
  ),
 );

 for (const day of flagged) {
  console.warn(
   pc.yellow(
    `  ${day.day}  official ${day.official}  independent ${day.independent}  ` +
     `+${day.gapPct.toFixed(2)}%`,
   ),
  );
 }

 return flagged;
}

// Run by hand: npm run fx:stall-scan -- [currency] [from] [to]
// A command, not a boot step: the answer changes at most daily, and a scan failure
// must not become a boot concern.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const [currency, from, to] = process.argv.slice(2);

 await reportStalledOfficialRates({
  ...(currency ? { currency } : {}),
  ...(from ? { from } : {}),
  ...(to ? { to } : {}),
 });

 await pool.end();
}
