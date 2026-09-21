// Orchestrates GET /api/export/statement for both writers (four-sheet XLSX, multi-page PDF), in
// the shape of transactionExportService.js. No financial logic: every figure was already computed
// by statementService.js, statementReportService.js or the two repositories.

import { createError } from '../../utils/errorHandling.js';
import { statementService } from './statementService.js';
import { getStatementReportData } from './statementReportService.js';
import {
 EXPORT_ROW_LIMIT,
 getTransactionsDataset,
} from '../db/transactionDatasetRepository.js';
import { getAccountsAndBalances } from '../db/accountsAndBalancesRepository.js';
import { toTransactionDataset, TRANSACTIONS_DATASET_COLUMNS } from '../core/toTransactionDataset.js';
import { statementFileName } from '../core/exportFileName.js';
import { writeXlsxWorkbook } from '../core/writers/writeXlsx.js';
import { writeStatementPdf } from '../core/writers/writePdf.js';
import { KNOWN_LIMITS } from '../core/knownLimits.js';
import { ACCOUNTING_CURRENCY_CODE } from '../../fintrack_api/config/fintrackConfig.js';

const CONTENT_TYPES = {
 xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 pdf: 'application/pdf',
};

const EXECUTIVE_SUMMARY_COLUMNS = [
 { key: 'metric', label: 'Metric', type: 'text' },
 { key: 'month', label: 'Month', type: 'number' },
 { key: 'yearToDate', label: 'Year to date', type: 'number' },
 { key: 'notices', label: 'Notices', type: 'text' },
];

// The one place an internal metric name (composeExecutiveSummaryRows) becomes the label the
// XLSX shows. writePdf.js keeps its own labels: a PDF tile reads only four metrics.
const METRIC_LABELS = {
 income: 'Income',
 expenses: 'Expenses',
 netMonthlyFlow: 'Net monthly flow',
 savingsRate: 'Savings rate',
 netWorth: 'Net worth',
 liquidNetWorth: 'Liquid net worth',
 cashPosition: 'Cash position',
 freeCash: 'Free cash',
 netDebtPosition: 'Net debt position',
 receivable: 'Receivable',
 payable: 'Payable',
 pocketsCommitted: 'Committed in pockets',
};

const ACCOUNTS_AND_BALANCES_COLUMNS = [
 { key: 'accountId', label: 'Account ID', type: 'number' },
 { key: 'accountName', label: 'Account', type: 'text' },
 { key: 'accountType', label: 'Type', type: 'text' },
 { key: 'currency', label: 'Currency', type: 'text' },
 { key: 'balance', label: 'Balance', type: 'number' },
];

const METADATA_COLUMNS = [
 { key: 'field', label: 'Field', type: 'text' },
 { key: 'value', label: 'Value', type: 'text' },
];

const buildExecutiveSummaryRows = (rows) =>
 rows.map((row) => ({
  metric: METRIC_LABELS[row.metric] ?? row.metric,
  month: row.month,
  yearToDate: row.yearToDate,
  notices: row.notices.join(' '),
 }));

const buildMetadataRows = ({ generatedAt, referenceMonth, timeZone, transactionRowCount }) => [
 { field: 'Generated', value: generatedAt },
 { field: 'Period', value: referenceMonth.slice(0, 7) },
 { field: 'Time zone', value: timeZone },
 { field: 'Accounting currency', value: ACCOUNTING_CURRENCY_CODE },
 { field: 'Transaction rows', value: String(transactionRowCount) },
 ...KNOWN_LIMITS.map((text, index) => ({ field: `Note ${index + 1}`, value: text })),
];

/**
 * The reference month's transactions, read the same way for both writers: the PDF needs
 * the row count and the row-limit guard though it prints no transaction table.
 */
const getBoundedTransactionRows = async (pool, userId, referenceMonth, timeZone) => {
 const rows = await getTransactionsDataset(
  pool,
  userId,
  { from: referenceMonth, to: referenceMonth, search: null, movementType: null, accountIds: null },
  timeZone,
  EXPORT_ROW_LIMIT + 1,
 );
 // The row at position LIMIT + 1 is never delivered; only its presence is read.
 if (rows.length > EXPORT_ROW_LIMIT) {
  throw createError(422, `This month matches more than ${EXPORT_ROW_LIMIT} rows. Narrow the period and try again.`);
 }
 return rows;
};

const buildXlsx = async (pool, userId, { window }, timeZone, generatedAt) => {
 const { referenceMonth } = window;

 const [executiveSummary, transactionRows, accountsAndBalances] = await Promise.all([
  statementService.getExecutiveSummary(pool, userId, { window }, timeZone),
  getBoundedTransactionRows(pool, userId, referenceMonth, timeZone),
  getAccountsAndBalances(pool, userId, referenceMonth, timeZone),
 ]);

 const transactionsDataset = toTransactionDataset(transactionRows);

 const sheets = [
  {
   name: 'Executive Summary',
   columns: EXECUTIVE_SUMMARY_COLUMNS,
   rows: buildExecutiveSummaryRows(executiveSummary),
  },
  {
   name: 'Transactions',
   columns: TRANSACTIONS_DATASET_COLUMNS,
   rows: transactionsDataset.rows,
  },
  {
   name: 'Accounts & Balances',
   columns: ACCOUNTS_AND_BALANCES_COLUMNS,
   rows: accountsAndBalances,
  },
  {
   name: 'Metadata & Audit',
   columns: METADATA_COLUMNS,
   rows: buildMetadataRows({
    generatedAt: generatedAt.toISOString(),
    referenceMonth,
    timeZone,
    transactionRowCount: transactionRows.length,
   }),
  },
 ];

 const buffer = await writeXlsxWorkbook(sheets);

 return { buffer, rowCount: transactionRows.length };
};

const buildPdf = async (pool, userId, { window }, timeZone, generatedAt) => {
 const { referenceMonth } = window;

 const [reportData, transactionRows] = await Promise.all([
  getStatementReportData(pool, userId, { window }, timeZone),
  getBoundedTransactionRows(pool, userId, referenceMonth, timeZone),
 ]);

 const buffer = await writeStatementPdf(reportData, { generatedAt, timeZone });

 return { buffer, rowCount: transactionRows.length };
};

/**
 * @param {{window: object}} request - the resolved reporting window (makeReportingWindow's
 *  shape); only `referenceMonth` is read here
 * @param {string} timeZone - IANA zone of the account owner
 * @param {string} username - name of the account owner, for the filename
 * @returns {Promise<{buffer: Buffer, filename: string, contentType: string, rowCount: number}>}
 */
export async function exportStatement(pool, userId, { window }, timeZone, format = 'xlsx', username) {
 const generatedAt = new Date();

 const { buffer, rowCount } = format === 'pdf'
  ? await buildPdf(pool, userId, { window }, timeZone, generatedAt)
  : await buildXlsx(pool, userId, { window }, timeZone, generatedAt);

 const filename = statementFileName({ referenceMonth: window.referenceMonth, format, username });

 return {
  buffer,
  filename,
  contentType: CONTENT_TYPES[format],
  rowCount,
 };
}
