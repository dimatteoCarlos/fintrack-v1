// Zod schemas validating budget query, body and URL parameters before the controller.

import { z } from 'zod';
// Imported, not repeated: a code the converter cannot resolve would turn a typo
// into a 500 at write time.
import { SUPPORTED_CURRENCIES } from '../../fintrack_api/services/fx_services/core/fxConfig.js';
// Shared writer list, so no export endpoint can offer a format the converters cannot produce.
import {
 EXPORT_FORMATS,
 DEFAULT_EXPORT_FORMAT,
} from '../../utils/fintrackUtils/exportUtils.js';

// Every schema is strict: Zod strips unknown keys silently, so a caller sending a retired field would get a
// 200 over something it never asked for. No schema decides whether a month is ALLOWED (future, before the
// account, end before start): each is a relation with a row or calendar, so the service raises the 422.

// The shape a month arrives in, shared by the two bounds below so they cannot
// drift apart. No global flag, so .test() carries no state between calls.
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/;

// A historical bound, coerced to the first of its month by truncating the text, never by building a Date:
// 'YYYY-MM-DD' parses as UTC midnight and a local getter can land on the previous month. Range checks
// (from <= to, to <= current month, 60-month span) are service 422s. Exported so other validators reuse it.
export const monthBound = z
 .string()
 .regex(MONTH_PATTERN, {
  message: 'must be a month as YYYY-MM or a date as YYYY-MM-DD',
 })
 .transform((value) => `${value.slice(0, 7)}-01`);

// The appliesUntil value meaning "recurs with no end". Exported because the service
// must recognise it: it is the one value of that field that is not a month.
export const OPEN_ENDED = 'openEnded';

// Upper bound of a write: a month or OPEN_ENDED. A refine rather than a union so a
// wrong value gets one message naming both forms, not a union's nested error list.
const appliesUntilBound = z
 .string()
 .refine((value) => value === OPEN_ENDED || MONTH_PATTERN.test(value), {
  message: `must be '${OPEN_ENDED}' or a month as YYYY-MM`,
 })
 .transform((value) =>
  value === OPEN_ENDED ? OPEN_ENDED : `${value.slice(0, 7)}-01`,
 );

/**
 * POST /budget/accounts/status
 * Body: accountIds (array, optional — omitted means every budget account owned)
 *       month (optional — omitted means the current month on the owner's calendar)
 */
export const budgetAccountsStatusBodySchema = z.object({
 // Omitted means every budget account the caller owns (resolved from the controller's
 // ownership set); an explicit [] stays a 400 via min(1), so "all" and "none" differ.
 accountIds: z.array(
  z.coerce.number().positive({
   message: 'each accountId must be a positive number',
  })
 ).min(1, {
  message: 'accountIds must contain at least one account',
 }).optional(),
 // Omitted means the current month; a later one is a 422 the service raises, since
 // the schema cannot see the owner's calendar.
 month: monthBound.optional(),
})
.strict()
.refine(
 (data) => {
  if (!data.accountIds) return true;
  const uniqueIds = new Set(data.accountIds);
  return data.accountIds.length === uniqueIds.size;
 },
 {
  message: 'accountIds must contain unique values',
  path: ['accountIds'],
 }
);

/**
 * PUT /budget/accounts/:accountId/current
 * Params: accountId (positive integer)
 */
export const currentBudgetParamsSchema = z.object({
 accountId: z.coerce.number().positive({
  message: 'accountId must be a positive number',
 }),
}).strict();

/**
 * PUT /budget/accounts/:accountId/current
 * Body: amount (required, >= 0), month, appliesUntil
 */
export const currentBudgetBodySchema = z.object({
 // Zero is accepted: it is how "stop budgeting" is expressed, since an absent row
 // terminates nothing under carry-forward. The service still rejects a sub-cent
 // amount, which would store as 0 and record a decision the user did not take.
 amount: z.number().nonnegative({
  message: 'amount must be zero or a positive number',
 }),
 // The currency the amount is typed in, not necessarily the one it is stored in.
 // No default: one would read every figure as the accounting currency and store
 // 50000 cop as 50000 usd (migrations 014 and 017).
 currency: z
  .string()
  .trim()
  .toLowerCase()
  .refine((code) => SUPPORTED_CURRENCIES.includes(code), {
   message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  }),
 // Month the amount takes effect. No default: the screen always knows its month, and
 // a default would quietly write somewhere else if the field went missing.
 month: monthBound,
 // Last month in force: equal to month writes one month, a later one a closed range,
 // OPEN_ENDED leaves it recurring. No default: OPEN_ENDED would erase the decisions
 // that follow, and month alone would expire an amount the user meant to keep.
 appliesUntil: appliesUntilBound,
}).strict();

/**
 * GET /budget/accounts/:accountId/series
 * Params: accountId (positive integer)
 */
export const seriesParamsSchema = z.object({
 accountId: z.coerce.number().positive({
  message: 'accountId must be a positive number',
 }),
}).strict();

/**
 * GET /budget/accounts/:accountId/series
 * Query: from, to (both optional — defaults resolve to the last 12 months)
 */
export const seriesQuerySchema = z.object({
 from: monthBound.optional(),
 to: monthBound.optional(),
}).strict();

/**
 * GET /budget/export
 * Query: accountId, from, to, format, all optional; omitted from/to mean the current month (a twelve-month
 * default would change existing requests), and format defaults to csv so requests naming none keep the file.
 */
export const exportQuerySchema = z.object({
 accountId: z.coerce.number().positive({
  message: 'accountId must be a positive number',
 }).optional(),
 from: monthBound.optional(),
 to: monthBound.optional(),
 format: z.enum(EXPORT_FORMATS, {
  message: `format must be one of: ${EXPORT_FORMATS.join(', ')}`,
 }).default(DEFAULT_EXPORT_FORMAT),
}).strict();
