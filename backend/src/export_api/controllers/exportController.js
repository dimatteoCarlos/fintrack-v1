// HTTP handlers for the data export module. Same order as the other controllers
// (requireUserId, Zod parse, service) so a rejection reads alike across modules.

import { exportMovementsQuerySchema, exportStatementQuerySchema } from '../validation/exportValidators.js';
import { exportTransactions } from '../services/transactionExportService.js';
import { exportStatement } from '../services/statementExportService.js';
import { pool } from '../../db/config/configDB.js';
import { requireUserId } from '../../utils/authUtils/requireUserId.js';
import { getUsername } from '../../utils/authUtils/getUsername.js';
import { getUserTimeZone } from '../../utils/fintrackUtils/date-utils/getUserTimeZone.js';
import { resolveWindowOr422 } from '../../fintrack_api/controllers/overviewController.js';

/**
 * Mirrors overviewController.js's respondWithZodIssues. It reads error.issues,
 * the Zod 4 name for the issue list; without it a 400 went out with an empty body.
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

/** GET /api/export/movements */
export async function getMovementsExport(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { from, to, search, movementType, category, accountIds, format } =
   exportMovementsQuerySchema.parse(req.query);

  const [timeZone, username] = await Promise.all([
   getUserTimeZone(pool, userId),
   getUsername(pool, userId),
  ]);

  const { buffer, filename, contentType, rowCount } = await exportTransactions(
   pool,
   userId,
   { from, to, search, movementType, category, accountIds, format },
   timeZone,
   username,
  );

  // One audit line per export. No amounts or row contents go into the log.
  console.log('[export] transactions', {
   userId,
   dataset: 'transactions',
   format,
   from: from ?? null,
   to: to ?? null,
   search: search ?? null,
   movementType: movementType ?? null,
   category: category ?? null,
   accountIds: accountIds ?? null,
   rowCount,
   generatedAt: new Date().toISOString(),
  });

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
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

/** GET /api/export/statement */
export async function getStatementExport(req, res, next) {
 try {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { month, format } = exportStatementQuerySchema.parse(req.query);

  const [timeZone, username] = await Promise.all([
   getUserTimeZone(pool, userId),
   getUsername(pool, userId),
  ]);

  // Same ceiling as GET /overview: a future month passes the schema and is
  // refused here, against the owner's calendar.
  const window = await resolveWindowOr422(res, timeZone, month);
  if (!window) return;

  const { buffer, filename, contentType, rowCount } = await exportStatement(
   pool,
   userId,
   { window },
   timeZone,
   format,
   username,
  );

  console.log('[export] statement', {
   userId,
   dataset: 'statement',
   format,
   referenceMonth: window.referenceMonth,
   rowCount,
   generatedAt: new Date().toISOString(),
  });

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
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
