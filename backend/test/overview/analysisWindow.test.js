// Contract tests for the long window and the series cut from it: the resolver owns both bounds and the
// card's short series is the tail of the long one, so two derivations cannot drift. No database.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
 ANALYSIS_MONTHS,
 TREND_MONTHS,
 makeReportingWindow,
 servedWindow,
} from '../../src/fintrack_api/services/overview_services/core/monthArithmetic.js';
import { makeTrendSeries } from '../../src/fintrack_api/services/overview_services/core/makeTrendSeries.js';

// Thirteen consecutive months ending on the reference one, each carrying the
// index as its amount so a slice can be identified by its contents.
const months = Array.from({ length: ANALYSIS_MONTHS }, (unused, index) => ({
 month: `2025-${String(index + 1).padStart(2, '0')}-01`,
 totalAmount: index,
}));

test('the long bound is thirteen months counting the reference one', () => {
 const window = makeReportingWindow('2026-09-01', '2026-09-01', '2026-09-07');

 // Twelve months back, not thirteen: the reference month is one of the points.
 assert.equal(window.analysisStart, '2025-09-01');
 assert.equal(ANALYSIS_MONTHS, 13);
});

test('the long bound crosses the year the same way the short one does', () => {
 const window = makeReportingWindow('2026-02-01', '2026-09-01', '2026-09-07');

 assert.equal(window.analysisStart, '2025-02-01');
 assert.equal(window.trendStart, '2025-09-01');
});

test('the two bounds sit on the same axis, the long one earlier', () => {
 const window = makeReportingWindow('2026-09-01', '2026-09-01', '2026-09-07');

 assert.ok(window.analysisStart < window.trendStart);
 assert.ok(window.trendStart < window.referenceMonth);
});

test('the served window publishes neither bound', () => {
 // A client is told which period was reported, never how far back the server
 // read to report it. Both bounds are internal for the same reason.
 const served = servedWindow(makeReportingWindow('2026-09-01', '2026-09-01', '2026-09-07'));

 assert.equal(served.analysisStart, undefined);
 assert.equal(served.trendStart, undefined);
});

test('an uncut series is every point fetched', () => {
 assert.equal(makeTrendSeries(months).length, ANALYSIS_MONTHS);
});

test('the card series is the tail of the analysis series', () => {
 const long = makeTrendSeries(months);
 const short = makeTrendSeries(months, TREND_MONTHS);

 assert.equal(short.length, TREND_MONTHS);
 // One statement serves both lengths: the short series is the last TREND_MONTHS
 // entries of the long one, so they cannot disagree on a shared month.
 assert.deepEqual(short, long.slice(-TREND_MONTHS));
 assert.equal(short.at(-1).month, long.at(-1).month);
});

test('a series shorter than the cut is served whole and never padded', () => {
 // An owner with three months of history has three points: padding would put
 // zero-valued months before a real series, each reading as a month in which
 // nothing happened.
 const short = makeTrendSeries(months.slice(-3), TREND_MONTHS);

 assert.equal(short.length, 3);
});

test('a point carries the month without its day', () => {
 const [first] = makeTrendSeries(months);

 assert.equal(first.month, '2025-01');
 assert.equal(first.value, 0);
});
