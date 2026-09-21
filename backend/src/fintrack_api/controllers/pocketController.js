// HTTP handlers for the Pocket module. The owner's time zone is resolved once per request so dates fall
// on the user's calendar. No 404: a missing pocket and another user's both answer 403, so the id space
// cannot be walked; otherwise as in budget: 400 what a schema sees, 422 what it cannot, 401 no session.

import { pool } from '../../db/config/configDB.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { getUsername } from '../../utils/authUtils/getUsername.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { moduleExportFileName } from '../../export_api/core/exportFileName.js';
import { pocketBoardService } from '../services/pocket_services/services/pocketBoardService.js';
import { pocketDetailService } from '../services/pocket_services/services/pocketDetailService.js';
import { pocketWriteService } from '../services/pocket_services/services/pocketWriteService.js';
import { pocketAllocationService } from '../services/pocket_services/services/pocketAllocationService.js';
import {
 getCalendarToday,
 getPocketHistoryForUser,
} from '../services/pocket_services/db/pocketRepository.js';
import {
 convertPocketBoardToCSV,
 buildPocketBoardSheets,
 CSV_CONTENT_TYPE,
 XLSX_CONTENT_TYPE,
} from '../../utils/fintrackUtils/exportUtils.js';
import { writeXlsxWorkbook } from '../../export_api/core/writers/writeXlsx.js';
import {
 pocketParamsSchema,
 createPocketBodySchema,
 updatePocketBodySchema,
 allocationBodySchema,
 boardQuerySchema,
 pocketExportQuerySchema,
} from '../../validation/zod/pocketValidators.js';

/**
 * Zod 4 renamed the issue list: ZodError.errors is undefined, which
 * JSON.stringify drops, so a 400 would never say which field failed. Same shape
 * as the budget module and validateRequest.js.
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

/**
 * Turn a service error into its response. An error with a status is a domain decision (403, 422);
 * one without goes to the error middleware, so a real defect is never reported as a business rule.
 */
const respondWithServiceError = (res, next, error) => {
 if (error.name === 'ZodError') {
  return respondWithZodIssues(res, error);
 }

 if (error.status) {
  return res
   .status(error.status)
   .json({ status: error.status, message: error.message });
 }

 return next(error);
};

/**
 * Resolve the requested month on the owner's calendar, or answer 422 for a later
 * one. Shared by the board and its export: the ceiling belongs to the request,
 * not to the response format.
 *
 * @returns {Promise<string|null>} 'YYYY-MM-01', or null after a 422 was sent
 * (the same convention as requireUserId)
 */
const resolveMonthOr422 = async (res, timeZone, month) => {
 const today = await getCalendarToday(pool, timeZone);
 const currentMonth = `${today.slice(0, 7)}-01`;
 const monthStart = month ?? currentMonth;

 if (monthStart > currentMonth) {
  res.status(422).json({
   status: 422,
   message: `month ${monthStart.slice(0, 7)} is later than the current month ${currentMonth.slice(0, 7)}.`,
  });
  return null;
 }

 return monthStart;
};

/**
 * GET /api/fintrack/pocket/board?month=YYYY-MM
 *
 * The month defaults to the current one on the owner's calendar, never the client's (zones disagree
 * for hours a day). A later month is refused with 422, not clamped, which would answer another month.
 */
export async function getPocketBoard(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const query = boardQuerySchema.safeParse(req.query);

  if (!query.success) {
   return respondWithZodIssues(res, query.error);
  }

  const timeZone = await getUserTimeZone(pool, userId);
  const monthStart = await resolveMonthOr422(res, timeZone, query.data.month);
  if (!monthStart) return;

  const board = await pocketBoardService.getBoard(
   pool,
   userId,
   timeZone,
   monthStart,
  );

  // 200 with an empty pockets[] and a null-figured summary, never 400: owning no
  // pocket is a valid question with the answer "none", and a 400 would make an
  // empty board indistinguishable from a broken request.
  return res.status(200).json({
   status: 200,
   message: 'Pocket board retrieved successfully',
   data: board,
  });
 } catch (error) {
  return next(error);
 }
}

/**
 * GET /api/fintrack/pocket/export?month=YYYY-MM&format=csv|xlsx
 *
 * The board plus every commitment and release behind it, in either writer; month ceiling from
 * resolveMonthOr422. The record is the allocation ledger, not bank transactions (no money moves).
 */
export async function exportPocketBoard(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const query = pocketExportQuerySchema.safeParse(req.query);

  if (!query.success) {
   return respondWithZodIssues(res, query.error);
  }

  // The username is used for the filename only; read with the zone in one round trip.
  const [timeZone, username] = await Promise.all([
   getUserTimeZone(pool, userId),
   getUsername(pool, userId),
  ]);

  const monthStart = await resolveMonthOr422(res, timeZone, query.data.month);
  if (!monthStart) return;

  const board = await pocketBoardService.getBoard(
   pool,
   userId,
   timeZone,
   monthStart,
  );

  // The filename carries the month the data is about, not the download date, so
  // two exports of one month are named alike.
  const nameFor = (format) =>
   moduleExportFileName({
    dataset: 'pocket',
    period: monthStart.slice(0, 7),
    format,
    username,
   });

  // Every allocation and release up to this month's close: a ceiling and no floor (unlike the
  // thirteen months budget and debt read), since a floor would break equality with Allocated.
  const allocations = await getPocketHistoryForUser(
   pool,
   userId,
   monthStart,
   timeZone,
  );

  // Either writer answers 200 with headers and no rows, never 400, for the same
  // reason getPocketBoard answers an empty board with 200.
  if (query.data.format === 'xlsx') {
   const workbook = await writeXlsxWorkbook(
    buildPocketBoardSheets(board.pockets, allocations),
   );

   res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
   res.setHeader('Content-Disposition', `attachment; filename="${nameFor('xlsx')}"`);
   return res.status(200).send(workbook);
  }

  res.setHeader('Content-Type', CSV_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${nameFor('csv')}"`);
  return res.status(200).send(
   convertPocketBoardToCSV(board.pockets, allocations),
  );
 } catch (error) {
  // The row cap raises a 422 with its status; without this it would answer 500.
  return respondWithServiceError(res, next, error);
 }
}

/** GET /api/fintrack/pocket/:pocketId */
export async function getPocketDetail(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { pocketId } = pocketParamsSchema.parse(req.params);

  const timeZone = await getUserTimeZone(pool, userId);
  const detail = await pocketDetailService.getDetail(
   pool,
   userId,
   pocketId,
   timeZone,
  );

  return res.status(200).json({
   status: 200,
   message: 'Pocket retrieved successfully',
   data: detail,
  });
 } catch (error) {
  return respondWithServiceError(res, next, error);
 }
}

/** POST /api/fintrack/pocket */
export async function createPocket(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const body = createPocketBodySchema.parse(req.body);

  // A pocket owes no instalment for a month it has no deadline in, so
  // desired_date (the commitment) cannot be today or in the past.
  const timeZone = await getUserTimeZone(pool, userId);
  const today = await getCalendarToday(pool, timeZone);

  if (body.desiredDate <= today) {
   return res.status(422).json({
    status: 422,
    message: 'Desired date must be in the future',
   });
  }

  const pocketId = await pocketWriteService.createPocket(userId, body);

  // The whole detail payload, not just the id: the next screen is the detail
  // screen, and a second request for the pocket just written would learn nothing.
  const detail = await pocketDetailService.getDetail(
   pool,
   userId,
   pocketId,
   timeZone,
  );

  return res.status(201).json({
   status: 201,
   message: 'Pocket created successfully',
   data: detail,
  });
 } catch (error) {
  return respondWithServiceError(res, next, error);
 }
}

/** PATCH /api/fintrack/pocket/:pocketId */
export async function editPocket(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { pocketId } = pocketParamsSchema.parse(req.params);
  const body = updatePocketBodySchema.parse(req.body);

  // Same rule as creation, checked only when a date is sent: the client omits
  // an unchanged one, so an overdue pocket can still be renamed.
  const timeZone = await getUserTimeZone(pool, userId);

  if (body.desiredDate !== undefined) {
   const today = await getCalendarToday(pool, timeZone);
   if (body.desiredDate <= today) {
    return res.status(422).json({
     status: 422,
     message: 'Desired date must be in the future',
    });
   }
  }

  await pocketWriteService.editPocket(userId, pocketId, body);

  // Recomputed figures come back with the write: a new target moves the gap and
  // the monthly pace it implies, which is derived here, never on the client.
  const detail = await pocketDetailService.getDetail(
   pool,
   userId,
   pocketId,
   timeZone,
  );

  return res.status(200).json({
   status: 200,
   message: 'Pocket updated successfully',
   data: detail,
  });
 } catch (error) {
  return respondWithServiceError(res, next, error);
 }
}

/**
 * Commit money to a pocket, or release it; one handler for both, the client always sending a positive
 * amount. Answers with the whole detail payload since one decision changes hero, sources and history.
 */
const writeAllocation = async (direction, req, res, next) => {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { pocketId } = pocketParamsSchema.parse(req.params);
  const body = allocationBodySchema.parse(req.body);

  await pocketAllocationService[direction](userId, pocketId, body);

  const timeZone = await getUserTimeZone(pool, userId);
  const detail = await pocketDetailService.getDetail(
   pool,
   userId,
   pocketId,
   timeZone,
  );

  return res.status(201).json({
   status: 201,
   message:
    direction === 'allocate'
     ? 'Funds allocated successfully'
     : 'Funds released successfully',
   data: detail,
  });
 } catch (error) {
  return respondWithServiceError(res, next, error);
 }
};

/** DELETE /api/fintrack/pocket/:pocketId */
export async function deletePocketById(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { pocketId } = pocketParamsSchema.parse(req.params);

  const result = await pocketWriteService.removePocket(userId, pocketId);

  // What each account gets back travels in the answer, matching what the
  // confirmation promised. No impact report runs first: deleting a pocket moves
  // no money.
  return res.status(200).json({
   status: 200,
   message: 'Pocket deleted successfully',
   data: result,
  });
 } catch (error) {
  return respondWithServiceError(res, next, error);
 }
}

/** POST /api/fintrack/pocket/:pocketId/allocations */
export const allocateToPocket = (req, res, next) =>
 writeAllocation('allocate', req, res, next);

/** POST /api/fintrack/pocket/:pocketId/releases */
export const releaseFromPocket = (req, res, next) =>
 writeAllocation('release', req, res, next);
