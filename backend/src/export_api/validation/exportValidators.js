// Zod schemas for the two export endpoints. Strict: an unknown parameter answers 400 naming
// the key. monthBound is imported, not restated, so its coercion cannot drift from the other
// date-bounded endpoints.

import { z } from 'zod';
import { monthBound } from '../../validation/zod/budgetValidators.js';
import { MOVEMENT_TYPE_NAMES } from '../../utils/fintrackUtils/transactionManagement/activityFilters.js';

const DEFAULT_FORMAT = 'csv';
const FORMATS = ['csv', 'xlsx'];

const STATEMENT_DEFAULT_FORMAT = 'xlsx';
const STATEMENT_FORMATS = ['xlsx', 'pdf'];

// Same ceilings as overviewActivityQuerySchema: a longer term or category name cannot
// match anything stored, so it is refused up front.
const MAX_SEARCH_LENGTH = 80;
const MAX_CATEGORY_LENGTH = 50;

// qs yields a bare string for one accountId and an array only for repeated keys;
// normalise both shapes to an array before validation.
const toArray = (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);

export const exportMovementsQuerySchema = z.object({
 from: monthBound.optional(),
 to: monthBound.optional(),
 search: z.string()
  .trim()
  .min(1, { message: 'search must not be empty' })
  .max(MAX_SEARCH_LENGTH, {
   message: `search must not exceed ${MAX_SEARCH_LENGTH} characters`,
  })
  .optional(),
 movementType: z.enum(MOVEMENT_TYPE_NAMES, {
  message: `movementType must be one of: ${MOVEMENT_TYPE_NAMES.join(', ')}`,
 }).optional(),
 category: z.string()
  .trim()
  .min(1, { message: 'category must not be empty' })
  .max(MAX_CATEGORY_LENGTH, {
   message: `category must not exceed ${MAX_CATEGORY_LENGTH} characters`,
  })
  .optional(),
 // Omitted means every owned account; an explicit empty value asks for none and
 // stays a 400, as in budgetValidators.js.
 accountIds: z.preprocess(
  toArray,
  z.array(
   z.coerce.number().positive({
    message: 'each accountId must be a positive number',
   }),
  ).min(1, {
   message: 'accountIds must contain at least one account',
  }),
 ).optional(),
 format: z.enum(FORMATS, {
  message: `format must be one of: ${FORMATS.join(', ')}`,
 }).default(DEFAULT_FORMAT),
}).strict().refine(
 (query) => !query.from || !query.to || query.from <= query.to,
 {
  message: 'from must not be later than to',
  path: ['from'],
 },
);

/**
 * One reference month, never a range: the statement is about one month's close. A future
 * month is not rejected here; resolveWindowOr422 (overviewController.js) answers the 422.
 */
export const exportStatementQuerySchema = z.object({
 month: monthBound.optional(),
 format: z.enum(STATEMENT_FORMATS, {
  message: `format must be one of: ${STATEMENT_FORMATS.join(', ')}`,
 }).default(STATEMENT_DEFAULT_FORMAT),
}).strict();
