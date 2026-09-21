// Debt module HTTP handler: the per-counterparty CSV/XLSX export, read via overviewDebtService.

import { pool } from '../../db/config/configDB.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { getUsername } from '../../utils/authUtils/getUsername.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { moduleExportFileName } from '../../export_api/core/exportFileName.js';
import { overviewDebtService } from '../services/overview_services/services/overviewDebtService.js';
import { resolveWindowOr422 } from './overviewController.js';
import { debtExportQuerySchema } from '../../validation/zod/overviewValidators.js';
import {
 convertDebtAnalysisToCSV,
 buildDebtAnalysisSheets,
 CSV_CONTENT_TYPE,
 XLSX_CONTENT_TYPE,
} from '../../utils/fintrackUtils/exportUtils.js';
import { writeXlsxWorkbook } from '../../export_api/core/writers/writeXlsx.js';
import { getModuleTransactionRows } from '../../export_api/services/moduleTransactionsService.js';
import { getDebtAccountIds } from '../services/overview_services/db/overviewAccountRepository.js';
import { detailWindowFor } from '../services/overview_services/core/monthArithmetic.js';

// byCounterparty is published at the 'full' analysis level only and the export
// needs no transaction rows, so a single-row page is the smallest valid request.
const ANALYSIS_ONLY = {
 page: 1,
 pageSize: 1,
 includeTransactionRows: false,
 analysis: 'full',
};

/**
 * Same response shape as overviewController's Zod handler. Zod puts an
 * unrecognized key in issue.keys, not on the path, so joining the path alone
 * would report a 400 that names nothing.
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
 * One row per counterparty at month close; the workbook's second sheet is the two legs by month.
 * No client account id, so no ownership check: the debtor set derives from the token's user id.
 * Both sheets share one getDebtDomainData call so legsOverTime cannot disagree with the ranking.
 */
export async function exportDebtAnalysis(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { month, format } = debtExportQuerySchema.parse(req.query);

  // The username is used for the filename only; read with the zone in one round trip.
  const [timeZone, username] = await Promise.all([
   getUserTimeZone(pool, userId),
   getUsername(pool, userId),
  ]);

  const window = await resolveWindowOr422(res, timeZone, month);
  if (!window) return;

  const debt = await overviewDebtService.getDebtDomainData(
   pool,
   userId,
   { window, ...ANALYSIS_ONLY },
   timeZone,
  );

  const asOfMonth = window.referenceMonth.slice(0, 7);
  // The filename carries the month the balances were read at, not the download date.
  const nameFor = (format) =>
   moduleExportFileName({ dataset: 'debt', period: asOfMonth, format, username });

  // Movements are bounded to the months the second block spans: byCounterparty is
  // a balance at one close and has no window of its own. detailWindowFor keeps the
  // three exports at the same depth.
  const detailWindow = detailWindowFor(window.referenceMonth);
  const debtorIds = await getDebtAccountIds(pool, userId);
  const detail = {
   rows: await getModuleTransactionRows(
    pool,
    userId,
    { from: detailWindow.from, to: detailWindow.to, accountIds: debtorIds },
    timeZone,
   ),
   window: detailWindow,
  };

  // byCounterparty and legsOverTime are absent (not empty) when the owner has no
  // debt; either writer then answers 200 with headers and no rows, never 400.
  if (format === 'xlsx') {
   const workbook = await writeXlsxWorkbook(
    buildDebtAnalysisSheets(
     debt.analysis?.byCounterparty,
     debt.analysis?.legsOverTime,
     asOfMonth,
     debt.card?.currency,
     detail,
    ),
   );

   res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
   res.setHeader('Content-Disposition', `attachment; filename="${nameFor('xlsx')}"`);
   return res.status(200).send(workbook);
  }

  const csv = convertDebtAnalysisToCSV(
   debt.analysis?.byCounterparty,
   asOfMonth,
   debt.card?.currency,
   debt.analysis?.legsOverTime,
   detail,
  );

  res.setHeader('Content-Type', CSV_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${nameFor('csv')}"`);
  return res.status(200).send(csv);
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
