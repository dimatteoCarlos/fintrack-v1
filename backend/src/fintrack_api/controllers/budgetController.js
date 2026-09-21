// HTTP handlers for the Budget module: validate with Zod, call services, return JSON, CSV or XLSX.
// The CURRENT month is resolved on the owner's calendar, never named by a request; past ones are read-only.
// No 404: a nonexistent id and another user's id both answer 403, so ids cannot be probed for ownership.

import {
 budgetAccountsStatusBodySchema,
 currentBudgetParamsSchema,
 currentBudgetBodySchema,
 seriesParamsSchema,
 seriesQuerySchema,
 exportQuerySchema,
} from '../../validation/zod/budgetValidators.js';

import { budgetCalculationService } from '../services/budget_services/services/budgetCalculationService.js';
import { budgetAllocationService } from '../services/budget_services/services/budgetAllocationService.js';
import { pool } from '../../db/config/configDB.js';
import { getAccountsByType } from '../../utils/fintrackUtils/accountDataRetrieval/accountUtils.js';
import {
 convertSeriesToCSV,
 buildBudgetSeriesSheets,
 CSV_CONTENT_TYPE,
 XLSX_CONTENT_TYPE,
} from '../../utils/fintrackUtils/exportUtils.js';
import { writeXlsxWorkbook } from '../../export_api/core/writers/writeXlsx.js';
import { getModuleTransactionRows } from '../../export_api/services/moduleTransactionsService.js';
import { getCurrentMonth } from '../services/budget_services/db/budgetTransactionRepository.js';
import { detailWindowFor } from '../services/overview_services/core/monthArithmetic.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { getUsername } from '../../utils/authUtils/getUsername.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { moduleExportFileName } from '../../export_api/core/exportFileName.js';

/**
 * Every category_budget account the caller has ever had (closed included), keyed by id.
 * Client accountIds must be checked against it: verifyToken proves who, not which accounts. Each entry
 * carries its first and last reported month, which handlers narrow by when no ids are named.
 */
const getOwnedBudgetAccounts = async (userId, timeZone) => {
 const accounts = await getAccountsByType(userId, 'category_budget', timeZone);
 return new Map(accounts.map((a) => [a.accountId, a]));
};

/**
 * The ids whose reporting window overlaps the span asked about; the default set when the client names none.
 * It follows the span, not today's state, and overlap not containment: a category opened or closed
 * halfway through the span belongs in it. A status is the case where from and to are the same month.
 */
const idsOverlapping = (owned, from, to) =>
 [...owned.values()]
  .filter(
   (account) =>
    account.startMonth <= to &&
    (account.closedMonth === null || account.closedMonth >= from),
  )
  .map((account) => account.accountId);

/**
 * Answers a failed validation with error.issues: Zod 4 removed ZodError.errors, and reading it yields
 * undefined, which JSON.stringify drops. Same shape as validateRequest.js in the auth module.
 */
const respondWithZodIssues = (res, error) =>
 res.status(400).json({
  status: 400,
  message: 'Validation Error',
  errors: error.issues.map((issue) => ({
   field: issue.path.join('.'),
   message: issue.message,
   code: issue.code,
  })),
 });

/** POST /api/fintrack/budget/accounts/status */
export async function getBudgetAccountsStatus(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { accountIds: requestedIds, month } = budgetAccountsStatusBodySchema.parse(req.body);

  // Resolved before the ownership map, whose month boundaries are cut on the owner's
  // calendar. Fetched once per request and passed to the service.
  const timeZone = await getUserTimeZone(pool, userId);

  const owned = await getOwnedBudgetAccounts(userId, timeZone);

  // Check EVERY element. Validating only the first would let a caller hide
  // foreign ids behind one of their own.
  if (requestedIds) {
   const foreign = requestedIds.filter((id) => !owned.has(id));
   if (foreign.length > 0) {
    return res.status(403).json({
     status: 403,
     message: `${foreign.length} account(s) not found or not owned by the authenticated user.`,
    });
   }
  }

  // An omitted accountIds asks for the whole set from the ownership map, so it needs no ownership check.
  // Narrowed to the reported month; with none named, the current month the server put on every map row.
  const reportedMonth = month ?? [...owned.values()][0]?.currentMonth ?? null;
  const accountIds =
   requestedIds ??
   (reportedMonth === null ? [] : idsOverlapping(owned, reportedMonth, reportedMonth));

  const response = await budgetCalculationService.getBudgetAccountsStatus(
   pool,
   accountIds,
   timeZone,
   month
  );

  res.status(200).json(response);
 } catch (error) {
  if (error.name === 'ZodError') {
   return respondWithZodIssues(res, error);
  }
  // 422 from the month resolver: the month is well formed but later than the current
  // one, which no schema can see. Anything without a status is unexpected.
  if (error.status) {
   return res.status(error.status).json({ status: error.status, message: error.message });
  }
  next(error);
 }
}

/** PUT /api/fintrack/budget/accounts/:accountId/current */
export async function setCurrentBudget(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { accountId } = currentBudgetParamsSchema.parse(req.params);
  // Forwarded whole, not rebuilt field by field: a field the schema validates but a
  // hand-written literal omits would reach the service as undefined.
  const allocation = currentBudgetBodySchema.parse(req.body);

  // Ownership is enforced inside the service, in the same transaction as the write;
  // checking here would leave a window between the check and the update.
  const timeZone = await getUserTimeZone(pool, userId);

  const result = await budgetAllocationService.setCurrentMonthBudget(
   pool,
   userId,
   accountId,
   allocation,
   timeZone
  );

  res.status(200).json(result);
 } catch (error) {
  if (error.name === 'ZodError') {
   return respondWithZodIssues(res, error);
  }
  // The service raises 400, 403 and 422 with a status already attached; anything
  // without one is unexpected and belongs to the error handler.
  if (error.status) {
   return res.status(error.status).json({ status: error.status, message: error.message });
  }
  next(error);
 }
}

/** GET /api/fintrack/budget/accounts/:accountId/series */
export async function getBudgetAccountSeries(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { accountId } = seriesParamsSchema.parse(req.params);
  const { from, to } = seriesQuerySchema.parse(req.query);

  const timeZone = await getUserTimeZone(pool, userId);

  // Ownership only, no narrowing: the client named one account and the series reports
  // no month outside its own window. A closed category answers, since its past is what
  // a twelve-month series is for.
  const owned = await getOwnedBudgetAccounts(userId, timeZone);
  if (!owned.has(accountId)) {
   return res.status(403).json({
    status: 403,
    message: 'Account not found or not owned by the authenticated user.',
   });
  }

  const response = await budgetCalculationService.getBudgetAccountSeries(
   pool,
   accountId,
   { from, to },
   timeZone
  );

  res.status(200).json(response);
 } catch (error) {
  if (error.name === 'ZodError') {
   return respondWithZodIssues(res, error);
  }
  // 422 from the range resolver: the query parsed, the values are simply not
  // answerable together. Anything without a status is unexpected.
  if (error.status) {
   return res.status(error.status).json({ status: error.status, message: error.message });
  }
  next(error);
 }
}

// Named by the months the data covers, not the download day, so two exports of the
// same range are named alike; a single-month range keeps that month as its name.
const rangeLabel = (first, last) => (first === last ? first : `${first}_${last}`);

/**
 * Write the budget export in the requested format. Shared by the no-accounts and normal
 * answers so the empty file comes from the same converter and carries the header row.
 */
const sendBudgetExport = async (res, { format, filename, accounts, detail }) => {
 res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

 if (format === 'xlsx') {
  const workbook = await writeXlsxWorkbook(buildBudgetSeriesSheets(accounts, detail));

  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  return res.status(200).send(workbook);
 }

 res.setHeader('Content-Type', CSV_CONTENT_TYPE);
 return res.status(200).send(convertSeriesToCSV(accounts, detail));
};

/**
 * GET /api/fintrack/budget/export?accountId=&from=&to=&format=csv|xlsx
 *
 * One summary row per account per month in either writer, followed by the movement detail.
 */
export async function exportCSV(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { accountId, from, to, format } = exportQuerySchema.parse(req.query);

  // The username is for the filename only; read in the same round trip as the zone.
  const [timeZone, username] = await Promise.all([
   getUserTimeZone(pool, userId),
   getUsername(pool, userId),
  ]);

  const owned = await getOwnedBudgetAccounts(userId, timeZone);

  if (accountId && !owned.has(accountId)) {
   return res.status(403).json({
    status: 403,
    message: 'Account not found or not owned by the authenticated user.',
   });
  }

  // Computed wide on purpose: the default set is narrowed before the service resolves the real range, which
  // sits inside this one; an extra category costs an empty section, a missing one is silent data loss.
  // The second read runs only for an owner with no account, who still needs a month to name the empty file.
  const currentMonth =
   [...owned.values()][0]?.currentMonth ?? (await getCurrentMonth(pool, timeZone));
  const ends = [from ?? currentMonth, to ?? currentMonth].filter(Boolean).sort();

  const filenameFor = (period) =>
   moduleExportFileName({ dataset: 'budget', period, format, username });

  // An owner with no budget account gets a well-formed empty file in the requested
  // format, header row included, not plain text: the browser was already told a
  // spreadsheet is coming.
  if (owned.size === 0) {
   return sendBudgetExport(res, {
    format,
    filename: filenameFor(rangeLabel(ends[0], ends[ends.length - 1])),
    accounts: [],
    detail: { rows: [], window: detailWindowFor(ends[ends.length - 1]) },
   });
  }

  const accountIds = accountId
   ? [accountId]
   : idsOverlapping(owned, ends[0] ?? '', ends[ends.length - 1] ?? '9999-12-01');

  // The default span is 1, not the 12 that /series uses: an export with no range is
  // the current month, and a year would change what an existing request means.
  const series = await budgetCalculationService.getBudgetAccountsSeries(
   pool,
   accountIds,
   { from, to },
   timeZone,
   1
  );

  // Thirteen months ending at the summary's last month, the same depth as the debt
  // export. The summary keeps its own range; the detail block names its own window.
  const detailWindow = detailWindowFor(series.to);

  // The account set is resolved over the widened window, not the summary's range:
  // narrowing to the summary's accounts would drop the movements of a category that
  // existed ten months ago but not this month.
  const detailAccountIds = accountId
   ? [accountId]
   : idsOverlapping(owned, detailWindow.from, detailWindow.to);

  const detail = {
   rows: await getModuleTransactionRows(
    pool,
    userId,
    { from: detailWindow.from, to: detailWindow.to, accountIds: detailAccountIds },
    timeZone,
   ),
   window: detailWindow,
  };

  return sendBudgetExport(res, {
   format,
   filename: filenameFor(rangeLabel(series.from, series.to)),
   accounts: series.accounts,
   detail,
  });
 } catch (error) {
  if (error.name === 'ZodError') {
   return respondWithZodIssues(res, error);
  }
  if (error.status) {
   return res.status(error.status).json({ status: error.status, message: error.message });
  }
  next(error);
 }
}
