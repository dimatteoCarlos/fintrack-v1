// The closed-account registry as a file, apart from getAccountController because it sends bytes,
// not JSON. No account id comes from the client, so there is no ownership check: the set is
// derived from the token's user id.

import { pool } from '../../db/config/configDB.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { getUsername } from '../../utils/authUtils/getUsername.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { moduleExportFileName } from '../../export_api/core/exportFileName.js';
import { closedAccountExportQuerySchema } from '../../validation/zod/accountValidators.js';
import { getClosedAccountRegistryForExport } from '../services/delete_account/getClosedAccountRegistry.js';
import {
 convertClosedAccountsToCSV,
 buildClosedAccountSheets,
 CSV_CONTENT_TYPE,
 XLSX_CONTENT_TYPE,
} from '../../utils/fintrackUtils/exportUtils.js';
import { writeXlsxWorkbook } from '../../export_api/core/writers/writeXlsx.js';

/**
 * Answer a failed validation with the issues that caused it.
 *
 * Falls back to issue.keys when the path is empty: Zod reports an unrecognized key
 * there, so joining the path alone would name nothing. Same shape as debtController.js.
 */
const respondWithZodIssues = (res, error) =>
 res.status(400).json({
  status: 400,
  message: 'Validation Error',
  errors: error.issues.map((issue) => ({
   field: issue.path.length > 0
    ? issue.path.join('.')
    : (issue.keys ?? []).join(', '),
   message: issue.message,
   code: issue.code,
  })),
 });

/**
 * The months the closures in the file fall in, not the download day, so two downloads
 * of the same registry are named alike. 'all-time' when the file has no rows, the word
 * exportFileName.js uses for an export with no bounds.
 */
const closurePeriod = (closures) => {
 const months = closures
  .map((closure) => (closure.closedAt ?? '').slice(0, 7))
  .filter(Boolean)
  .sort();

 if (months.length === 0) return 'all-time';

 const first = months[0];
 const last = months[months.length - 1];
 return first === last ? first : `${first}_${last}`;
};

/**
 * Write the closed-account export in the requested format. Shared by both answers so
 * the empty file comes from the same converter and carries the header row.
 */
const sendClosedAccountExport = async (res, { format, filename, closures }) => {
 res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

 if (format === 'xlsx') {
  const workbook = await writeXlsxWorkbook(buildClosedAccountSheets(closures));

  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  return res.status(200).send(workbook);
 }

 res.setHeader('Content-Type', CSV_CONTENT_TYPE);
 return res.status(200).send(convertClosedAccountsToCSV(closures));
};

/**
 * GET /api/fintrack/account/closed/export?format=csv|xlsx&search=&type=&sort=&order=
 *
 * One row per matching closed account, with no LIMIT (the list endpoint caps at 100). No matches
 * gives a well-formed empty file (header row, 200), not plain text.
 */
export async function exportClosedAccounts(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { format, ...filters } = closedAccountExportQuerySchema.parse(req.query);

  // The zone renders the three dates on the owner's calendar; the username is for the
  // filename only. Read in one round trip.
  const [timeZone, username] = await Promise.all([
   getUserTimeZone(pool, userId),
   getUsername(pool, userId),
  ]);

  const closures = await getClosedAccountRegistryForExport(
   pool,
   userId,
   filters,
   timeZone,
  );

  return sendClosedAccountExport(res, {
   format,
   filename: moduleExportFileName({
    dataset: 'closed-accounts',
    period: closurePeriod(closures),
    format,
    username,
   }),
   closures,
  });
 } catch (error) {
  if (error.name === 'ZodError') {
   return respondWithZodIssues(res, error);
  }
  if (error.status) {
   return res.status(error.status).json({ status: error.status, message: error.message });
  }
  return next(error);
 }
}
