// Zod schemas validating pocket URL parameters and bodies before the controller.

import { z } from 'zod';
// Imported, not repeated: a code the converter cannot resolve would turn a typo
// into a 500 at write time.
import { SUPPORTED_CURRENCIES } from '../../fintrack_api/services/fx_services/core/fxConfig.js';
// The budget module's month coercion, imported so there is one copy: it truncates the
// text and never builds a Date, so a month cannot shift a day west of UTC.
import { monthBound } from './budgetValidators.js';
// Shared writer list, so the schema cannot offer a format the converters cannot produce.
import {
 EXPORT_FORMATS,
 DEFAULT_EXPORT_FORMAT,
} from '../../utils/fintrackUtils/exportUtils.js';

// Every schema here is strict: Zod strips unknown keys silently, so a caller still
// sending a retired field (amount instead of targetAmount, a sign on a release) would
// get a 200 computed over something it never asked for. Strict answers 400 naming the key.

// A calendar date, never parsed to a Date here: 'YYYY-MM-DD' is UTC midnight and a
// local getter would land on the previous day west of UTC. The column is a DATE and
// takes the text unchanged.
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const calendarDate = z.string().regex(DATE_PATTERN, {
 message: 'must be a date as YYYY-MM-DD',
});

// The currency the figure is typed in, not necessarily the stored one. Required, no
// default: a default read every figure as the accounting currency and stored 50000 cop
// as 50000 usd (migration 014).
const typedCurrency = z
 .string()
 .trim()
 .toLowerCase()
 .refine((code) => SUPPORTED_CURRENCIES.includes(code), {
  message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
 });

// Both write endpoints take a positive amount and the client never sends a sign: a
// contract where releasing means sending -100 is one typo from inverting a financial
// decision. Release writes the row negative on the server.
const positiveAmount = z.number().positive({
 message: 'amount must be greater than zero',
});

/**
 * Any route carrying /:pocketId.
 */
export const pocketParamsSchema = z
 .object({
  pocketId: z.coerce.number().int().positive({
   message: 'pocketId must be a positive integer',
  }),
 })
 .strict();

/**
 * POST /pocket. Body: name, note (optional), targetAmount, currency, desiredDate.
 * Created empty, funded by an allocation. targetAmount and desiredDate are required: every pace figure
 * divides by the date.
 */
export const createPocketBodySchema = z
 .object({
  name: z.string().trim().min(1, { message: 'name is required' }).max(50, {
   message: 'name must be at most 50 characters',
  }),
  note: z
   .string()
   .trim()
   .max(155, { message: 'note must be at most 155 characters' })
   .optional(),
  targetAmount: positiveAmount,
  currency: typedCurrency,
  desiredDate: calendarDate,
 })
 .strict();

/**
 * PATCH /pocket/:pocketId. Body: any of name, note, targetAmount, currency, desiredDate.
 * currency only beside targetAmount (the unit it is typed in; the pocket's own unit is fixed).
 * At least one field, else 400 rather than a no-op 200.
 */
export const updatePocketBodySchema = z
 .object({
  name: z
   .string()
   .trim()
   .min(1, { message: 'name must not be empty' })
   .max(50, { message: 'name must be at most 50 characters' })
   .optional(),
  // Nullable on purpose: null clears the note, an absent key leaves it alone.
  note: z
   .string()
   .trim()
   .max(155, { message: 'note must be at most 155 characters' })
   .nullable()
   .optional(),
  targetAmount: positiveAmount.optional(),
  currency: typedCurrency.optional(),
  desiredDate: calendarDate.optional(),
 })
 .strict()
 .refine((body) => Object.keys(body).length > 0, {
  message: 'at least one field must be sent',
 })
 .refine((body) => body.targetAmount === undefined || body.currency !== undefined, {
  message: 'currency is required when targetAmount is sent',
  path: ['currency'],
 });

/**
 * POST /pocket/:pocketId/allocations and POST /pocket/:pocketId/releases
 * One schema for both: same decision, opposite effect, told apart by endpoint, never by a payload sign.
 * allocationDate is optional, defaults to now: when the decision was taken, not when the row is written.
 */
export const allocationBodySchema = z
 .object({
  sourceAccountId: z.coerce.number().int().positive({
   message: 'sourceAccountId must be a positive integer',
  }),
  amount: positiveAmount,
  currency: typedCurrency,
  allocationDate: calendarDate.optional(),
 })
 .strict();

/**
 * GET /api/fintrack/pocket/board?month=YYYY-MM
 * month defaults to the current month; a later one is a 422 raised by the handler (a schema cannot
 * see the owner's calendar). A full date is accepted and truncated to its month (monthBound).
 */
export const boardQuerySchema = z
 .object({
  month: monthBound.optional(),
 })
 .strict();

/**
 * GET /api/fintrack/pocket/export?month=YYYY-MM&format=csv|xlsx
 * The board's month rule plus the writer; separate from boardQuerySchema because the board is JSON only.
 * format defaults to csv so requests naming none keep getting the same file.
 */
export const pocketExportQuerySchema = z
 .object({
  month: monthBound.optional(),
  format: z
   .enum(EXPORT_FORMATS, {
    message: `format must be one of: ${EXPORT_FORMATS.join(', ')}`,
   })
   .default(DEFAULT_EXPORT_FORMAT),
 })
 .strict();
