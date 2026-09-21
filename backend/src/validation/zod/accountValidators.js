// Zod schemas for the account endpoints: only the closed-account registry download so
// far, the one endpoint here that answers a file instead of JSON.

import { z } from 'zod';
// Shared writer list, so no export endpoint can offer a format the converters cannot produce.
import {
 EXPORT_FORMATS,
 DEFAULT_EXPORT_FORMAT,
} from '../../utils/fintrackUtils/exportUtils.js';

/**
 * GET /api/fintrack/account/closed/export?format=csv|xlsx&search=&type=&sort=&order=
 *
 * Filters mirror the list endpoint and stay plain strings: it defaults an unknown sort or order, so a
 * 400 here would disagree. No page or limit (strict): the file holds every closure. format defaults to csv.
 */
export const closedAccountExportQuerySchema = z
 .object({
  search: z.string().optional(),
  type: z.string().optional(),
  sort: z.string().optional(),
  order: z.string().optional(),
  format: z
   .enum(EXPORT_FORMATS, {
    message: `format must be one of: ${EXPORT_FORMATS.join(', ')}`,
   })
   .default(DEFAULT_EXPORT_FORMAT),
 })
 .strict();
