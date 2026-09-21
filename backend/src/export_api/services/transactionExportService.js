// Orchestrates GET /api/export/movements: ownership control, category resolution, the row cap
// and the dataset handed to a writer. No financial logic: every figure moved is `tr.amount` or
// a stored FX audit column, never summed or converted here.

import { createError } from '../../utils/errorHandling.js';
import {
 EXPORT_ROW_LIMIT,
 getOwnedAccountIds,
 getCategoryAccountIds,
 getTransactionsDataset,
} from '../db/transactionDatasetRepository.js';
import { toTransactionDataset } from '../core/toTransactionDataset.js';
import { exportFileName } from '../core/exportFileName.js';
import { writeCsv } from '../core/writers/writeCsv.js';
import { writeXlsx } from '../core/writers/writeXlsx.js';

const CONTENT_TYPES = {
 csv: 'text/csv',
 xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Intersection of two id arrays, in the left side's order; used when a request narrows by
 * both accountIds and category, which asks for what both agree on.
 */
const intersect = (a, b) => {
 const bSet = new Set(b);
 return a.filter((id) => bSet.has(id));
};

/**
 * @param {string} timeZone - IANA zone of the account owner
 * @param {string} username - name of the account owner, for the filename
 * @returns {Promise<{buffer: (string|Buffer), filename: string, contentType: string, rowCount: number}>}
 */
export async function exportTransactions(pool, userId, request, timeZone, username) {
 const { from, to, search, movementType, category, accountIds: requestedIds, format } = request;

 const owned = await getOwnedAccountIds(pool, userId);
 const ownedSet = new Set(owned);

 // Check every element, not only the first: a foreign id behind an owned one must
 // still answer 403.
 if (requestedIds) {
  const foreign = requestedIds.filter((id) => !ownedSet.has(id));
  if (foreign.length > 0) {
   throw createError(403, `${foreign.length} account(s) not found or not owned by the authenticated user.`);
  }
 }

 let accountIds = requestedIds ?? null;

 if (category) {
  const categoryIds = await getCategoryAccountIds(pool, userId, category);
  if (categoryIds.length === 0) {
   throw createError(404, `No expense category named '${category}'.`);
  }
  accountIds = accountIds ? intersect(accountIds, categoryIds) : categoryIds;
 }

 const generatedAt = new Date();

 const rows = await getTransactionsDataset(
  pool,
  userId,
  { from, to, search, movementType, accountIds },
  timeZone,
  EXPORT_ROW_LIMIT + 1,
 );

 // The row at position LIMIT + 1 is never delivered; its presence means the period
 // must be narrower.
 if (rows.length > EXPORT_ROW_LIMIT) {
  throw createError(422, `This request matches more than ${EXPORT_ROW_LIMIT} rows. Narrow the period and try again.`);
 }

 const meta = {
  generatedAt: generatedAt.toISOString(),
  from: from ?? null,
  to: to ?? null,
  search: search ?? null,
  movementType: movementType ?? null,
  category: category ?? null,
  rowCount: rows.length,
 };

 const dataset = toTransactionDataset(rows, meta);
 const filename = exportFileName({ from, to, format, username });
 const contentType = CONTENT_TYPES[format];

 const buffer = format === 'xlsx'
  ? await writeXlsx(dataset, { sheetName: 'Transactions' })
  : writeCsv(dataset);

 return { buffer, filename, contentType, rowCount: rows.length };
}
