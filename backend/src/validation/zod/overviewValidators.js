// Zod schemas for the /overview endpoints. Every schema is strict (a retired parameter answers 400
// naming the key); none checks whether a month is ALLOWED, since a future month is a 422 the service raises.

import { z } from 'zod';
import { monthBound } from './budgetValidators.js';
import { ANALYSIS_LEVELS } from '../../fintrack_api/services/overview_services/core/analysisLevels.js';
import { MOVEMENT_TYPE_NAMES } from '../../fintrack_api/services/overview_services/db/movementTypes.js';
// Writer list shared with pocketValidators.js so neither export can offer a format
// the writers cannot produce.
import {
 EXPORT_FORMATS,
 DEFAULT_EXPORT_FORMAT,
} from '../../utils/fintrackUtils/exportUtils.js';

// The six overview domains. A literal list, not a catalog read: a domain is a
// calculator this module has or lacks, not a row someone can add to a table.
export const OVERVIEW_DOMAINS = [
 'income',
 'expense',
 'investment',
 'debt',
 'pocket',
 'pnl',
];

// Which domains have a calculator is deliberately not listed here: the controller
// asks the dispatch map. The 501 branch stays for a domain added before its calculator.

// Pagination defaults and ceiling for the transaction list. The cap exists because
// pageSize comes from the client; 20 is the rendered page, 100 the largest built.
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Recent activity defaults to the size of the teaser GET /overview publishes, so a
// caller sending no parameters gets the same list. It shares MAX_PAGE_SIZE.
const DEFAULT_ACTIVITY_PAGE_SIZE = 5;

// Longest search term accepted. Not a security boundary (the term is a bind
// parameter); a longer one cannot match anything, and refusing it is cheaper than a scan.
const MAX_SEARCH_LENGTH = 80;

// Matches category_budget_accounts.category_name VARCHAR(50) (002_accounts.sql), so a
// longer term cannot name a stored category and is refused instead of matching nothing.
const MAX_CATEGORY_LENGTH = 50;

/**
 * GET /overview/:domain
 * Params: domain (one of the six the contract defines)
 */
export const overviewDomainParamsSchema = z.object({
 domain: z.enum(OVERVIEW_DOMAINS, {
  message: `domain must be one of: ${OVERVIEW_DOMAINS.join(', ')}`,
 }),
}).strict();

/**
 * GET /overview
 * Query: month (optional, past only)
 * No page or pageSize: the page carries no paginated list, so strict answers 400 naming the key.
 */
export const overviewPageQuerySchema = z.object({
 month: monthBound.optional(),
}).strict();

/**
 * GET /debt/export
 * Query: month (optional, past only), format (csv or xlsx, default csv)
 * Month rule via overviewDebtService (a 422 the handler raises); no page: the file is every counterparty.
 */
export const debtExportQuerySchema = z.object({
 month: monthBound.optional(),
 format: z.enum(EXPORT_FORMATS, {
  message: `format must be one of: ${EXPORT_FORMATS.join(', ')}`,
 }).default(DEFAULT_EXPORT_FORMAT),
}).strict();

/**
 * GET /overview/:domain
 * Query: month (optional, past only), page, pageSize
 * page and pageSize carry defaults: the response always reports the window it served.
 */
export const overviewDomainQuerySchema = z.object({
 month: monthBound.optional(),
 page: z.coerce.number().int().positive({
  message: 'page must be a positive integer',
 }).default(DEFAULT_PAGE),
 pageSize: z.coerce.number().int().positive({
  message: 'pageSize must be a positive integer',
 }).max(MAX_PAGE_SIZE, {
  message: `pageSize must not exceed ${MAX_PAGE_SIZE}`,
 }).default(DEFAULT_PAGE_SIZE),
 // Depth of the level-2 section; no default, so absent means no analysis and an older client keeps its
 // payload. An unrecognised value answers 400, not a shallower payload that looks like an empty result.
 analysis: z.enum(ANALYSIS_LEVELS, {
  message: `analysis must be one of: ${ANALYSIS_LEVELS.join(', ')}`,
 }).optional(),
 // Level-3 narrowing to one expense category, by name; trimmed, not case-folded, since the service
 // matches stored names. An unknown name answers 404: a spend-free category also returns an empty page.
 category: z.string()
  .trim()
  .min(1, { message: 'category must not be empty' })
  .max(MAX_CATEGORY_LENGTH, {
   message: `category must not exceed ${MAX_CATEGORY_LENGTH} characters`,
  })
  .optional(),
}).strict();
/**
 * GET /overview/activity
 * Query: from (optional), to (optional), page, pageSize
 * Bounds default to UNBOUNDED; to is INCLUSIVE (whole month); from later than to answers 400 via refine.
 */
export const overviewActivityQuerySchema = z.object({
 from: monthBound.optional(),
 to: monthBound.optional(),
 // Trimmed first, so spaces alone are refused rather than matching every row. min(1)
 // follows the trim: an empty search is expressed by omitting the key, and '' would
 // be a third state the repository must tell apart.
 search: z.string()
  .trim()
  .min(1, { message: 'search must not be empty' })
  .max(MAX_SEARCH_LENGTH, {
   message: `search must not exceed ${MAX_SEARCH_LENGTH} characters`,
  })
  .optional(),
 // By catalog name. An unrecognised value answers 400 rather than being read as "no
 // filter", which would return everything and look like a filter that did nothing.
 movementType: z.enum(MOVEMENT_TYPE_NAMES, {
  message: `movementType must be one of: ${MOVEMENT_TYPE_NAMES.join(', ')}`,
 }).optional(),
 page: z.coerce.number().int().positive({
  message: 'page must be a positive integer',
 }).default(DEFAULT_PAGE),
 pageSize: z.coerce.number().int().positive({
  message: 'pageSize must be a positive integer',
 }).max(MAX_PAGE_SIZE, {
  message: `pageSize must not exceed ${MAX_PAGE_SIZE}`,
 }).default(DEFAULT_ACTIVITY_PAGE_SIZE),
}).strict().refine(
 (query) => !query.from || !query.to || query.from <= query.to,
 {
  message: 'from must not be later than to',
  path: ['from'],
 },
);
