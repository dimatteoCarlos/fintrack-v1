// Detail rows under the budget, pocket and debt export summaries. Reads through getTransactionsDataset,
// so closed accounts are named as in GET /api/export/movements; the caller passes the summary's
// account ids so rows and totals describe the same accounts.

import { createError } from '../../utils/errorHandling.js';
import {
 EXPORT_ROW_LIMIT,
 getTransactionsDataset,
} from '../db/transactionDatasetRepository.js';
import { toTransactionDataset } from '../core/toTransactionDataset.js';

/**
 * One module's transactions for one period, capped: the row at position LIMIT + 1 is never
 * delivered, only its presence is read. An empty account set returns no rows without a query.
 *
 * @param {string} userId - from the token, never from the client
 * @param {{from: (string|null), to: (string|null), accountIds: number[]}} scope -
 *  from/to as 'YYYY-MM-01'; `to` covers its whole month
 * @param {string} timeZone - IANA zone of the account owner
 * @returns {Promise<object[]>} rows in TRANSACTIONS_DATASET_COLUMNS' keys
 */
export async function getModuleTransactionRows(
 pool,
 userId,
 { from, to, accountIds },
 timeZone = 'UTC',
) {
 if (!Array.isArray(accountIds) || accountIds.length === 0) {
  return [];
 }

 const rows = await getTransactionsDataset(
  pool,
  userId,
  { from, to, search: null, movementType: null, accountIds },
  timeZone,
  EXPORT_ROW_LIMIT + 1,
 );

 if (rows.length > EXPORT_ROW_LIMIT) {
  throw createError(
   422,
   `This period matches more than ${EXPORT_ROW_LIMIT} transactions. Narrow the period and try again.`,
  );
 }

 return toTransactionDataset(rows).rows;
}
