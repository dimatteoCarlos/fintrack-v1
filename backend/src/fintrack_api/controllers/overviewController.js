// HTTP handlers for the Overview module. Current month: resolved on the owner's calendar, never accepted.
// No account id is accepted: the account set derives from the token's user id, so no ownership check.
// A domain with no calculator yet answers 501: a 404 would blame the URL and a 400 the domain.

import {
 overviewActivityQuerySchema,
 overviewDomainParamsSchema,
 overviewDomainQuerySchema,
 overviewPageQuerySchema,
} from '../../validation/zod/overviewValidators.js';

import { overviewPageService } from '../services/overview_services/services/overviewPageService.js';
import { overviewActivityService } from '../services/overview_services/services/overviewActivityService.js';

import { overviewExpenseService } from '../services/overview_services/services/overviewExpenseService.js';
import { overviewIncomeService } from '../services/overview_services/services/overviewIncomeService.js';
import { overviewPnlService } from '../services/overview_services/services/overviewPnlService.js';
import { overviewDebtService } from '../services/overview_services/services/overviewDebtService.js';
import { overviewPocketService } from '../services/overview_services/services/overviewPocketService.js';
import { overviewInvestmentService } from '../services/overview_services/services/overviewInvestmentService.js';
import { makeReportingWindow, servedWindow } from '../services/overview_services/core/monthArithmetic.js';
import { getCurrentMonth } from '../services/budget_services/db/budgetTransactionRepository.js';
import { pool } from '../../db/config/configDB.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { todayInZone } from '../../utils/fintrackUtils/date-utils/resolveZonedWindow.js';

// Calculator per domain. Each entry is wrapped instead of passing a bare method
// reference: no service reads `this` today, but a detached reference breaks the
// day one of them does.
const DOMAIN_CALCULATORS = {
 expense: (...args) => overviewExpenseService.getExpenseDomainData(...args),
 income: (...args) => overviewIncomeService.getIncomeDomainData(...args),
 pnl: (...args) => overviewPnlService.getPnlDomainData(...args),
 debt: (...args) => overviewDebtService.getDebtDomainData(...args),
 pocket: (...args) => overviewPocketService.getPocketDomainData(...args),
 investment: (...args) => overviewInvestmentService.getInvestmentDomainData(...args),
};

/**
 * Answer a failed validation with its issues, in the same shape as budgetController. Zod 4 has no
 * ZodError.errors (it would serialize as an empty body); an unrecognized key has an empty path, so its
 * name comes from issue.keys.
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
 * Resolve the reporting window, or answer 422 for a month later than the current one.
 * The ceiling belongs to the request, not to a domain, so it lives here once; exported so the export
 * controllers answer the same 422 with the same message.
 *
 * @returns {Promise<object|null>} the window, or null after a 422 was sent (the
 * same convention as requireUserId)
 */
export const resolveWindowOr422 = async (res, timeZone, month) => {
 const currentMonth = await getCurrentMonth(pool, timeZone);

 // 422, not 400: the request is well formed but the month is later than any that
 // exists on the owner's calendar, a relationship no schema can see.
 if (month && month > currentMonth) {
  res.status(422).json({
   status: 422,
   message: `month ${month.slice(0, 7)} is later than the current month ${currentMonth.slice(0, 7)}.`,
  });
  return null;
 }

 // The day is read here, not in the window builder, so the whole request works
 // from one instant even when it crosses midnight.
 return makeReportingWindow(month ?? currentMonth, currentMonth, todayInZone(timeZone));
};

/** GET /api/fintrack/overview */
export async function getOverview(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { month } = overviewPageQuerySchema.parse(req.query);

  const timeZone = await getUserTimeZone(pool, userId);
  const window = await resolveWindowOr422(res, timeZone, month);
  if (!window) return;

  const data = await overviewPageService.getOverviewPage(pool, userId, { window }, timeZone);

  res.status(200).json({
   status: 200,
   message: 'Overview retrieved successfully',
   // The window is attached here, not by the services (as in the domain response
   // below): the server reports the period it used and the client never infers it
   // from its clock, whereas six calculators could each name a different period.
   data: { ...data, window: servedWindow(window) },
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

/** GET /api/fintrack/overview/:domain */
export async function getOverviewDomain(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { domain } = overviewDomainParamsSchema.parse(req.params);
  const { month, page, pageSize, analysis, category } =
   overviewDomainQuerySchema.parse(req.query);

  // Only the expense domain has categories; elsewhere it is refused, not ignored, as a 200 with the whole
  // domain would look like an answer to a slice request. The schema cannot see it: domain is a path param.
  if (category && domain !== 'expense') {
   return res.status(400).json({
    status: 400,
    message: `category narrows the expense domain only; ${domain} has no categories.`,
   });
  }

  const calculator = DOMAIN_CALCULATORS[domain];

  if (!calculator) {
   return res.status(501).json({
    status: 501,
    message: `The ${domain} calculator is not implemented yet.`,
   });
  }

  // Zone and window are resolved once per request and passed down: no service
  // resolves identity itself, and six calculators shifting their own months could
  // disagree about which month a page reports.
  const timeZone = await getUserTimeZone(pool, userId);
  const window = await resolveWindowOr422(res, timeZone, month);
  if (!window) return;

  // analysis is the same key for every calculator; one with no level-2 section
  // ignores it.
  const data = await calculator(
   pool,
   userId,
   { window, page, pageSize, analysis, category },
   timeZone,
  );

  res.status(200).json({
   status: 200,
   message: `Overview data for domain ${domain} retrieved successfully`,
   data: { ...data, window: servedWindow(window) },
  });
 } catch (error) {
  if (error.name === 'ZodError') {
   return respondWithZodIssues(res, error);
  }
  // A repository's createError carries its own status; anything without one is
  // unexpected and goes to the error handler.
  if (error.status) {
   return res.status(error.status).json({ status: error.status, message: error.message });
  }
  next(error);
 }
}

/**
 * GET /api/fintrack/overview/activity
 *
 * Deliberately no month ceiling: this filters rows (no per-month figure), and refusing a future bound would
 * hide future-dated rows that every balance counts. No reporting window: the reader owns the period.
 */
export async function getOverviewActivity(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { from, to, search, movementType, page, pageSize } =
   overviewActivityQuerySchema.parse(req.query);

  const timeZone = await getUserTimeZone(pool, userId);

  const data = await overviewActivityService.getActivity(
   pool,
   userId,
   { from, to, search, movementType, page, pageSize },
   timeZone,
  );

  res.status(200).json({
   status: 200,
   message: 'Overview activity retrieved successfully',
   data,
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
