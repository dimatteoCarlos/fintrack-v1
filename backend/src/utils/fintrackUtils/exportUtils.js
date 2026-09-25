// Pure CSV/XLSX export helpers for the Budget, Pocket, Debt and closed-account modules.
// All converters share one RFC 4180 escaper so the formula-injection guard has one copy.

// One definition of what a transaction row looks like in a file.
import { TRANSACTIONS_DATASET_COLUMNS } from '../../export_api/core/toTransactionDataset.js';
// Same renderer as the movements export, so a detail block here is escaped and
// formatted identically.
import { writeCsv } from '../../export_api/core/writers/writeCsv.js';
import { POCKET_LEVEL_WORD } from '../../fintrack_api/services/pocket_services/core/pocketLevel.js';

// One Month column rather than Period Start / End: a row covers one calendar month.
// Frequency stays as a constant column, since a file whose columns change between
// versions breaks whatever the user built on top of it.
const COLUMNS = [
 'Account Name',
 'Subcategory',
 'Currency',
 'Frequency',
 'Month',
 'Budgeted',
 'Spent',
 'Remaining',
 'Execution %',
];

const FREQUENCY = 'monthly';

/**
 * Escape one CSV text field per RFC 4180 (quote on delimiter, quote, CR or LF; double quotes).
 * Text fields only: numbers bypass it, or the guard would read a negative's "-" as a formula.
 */
const escapeCsvField = (value) => {
 const raw = value === null || value === undefined ? '' : String(value);

 // CSV injection guard: spreadsheets evaluate a cell starting with = + - @ (or tab / CR)
 // as a formula, so an account named "=cmd|..." would run on open. A leading ' makes it text.
 const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;

 return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

// A formatted amount needs no quoting or injection guard (it comes from toFixed); escapeCsvField
// would prefix a negative with "'" and turn the cell into text.
const escapeCsvNumberField = (value) => value;

// toFixed throws on a non-number, so export must not be where a bad value surfaces. A null
// executionPercentage (budget 0) yields an empty cell; 0.00 would claim nothing was spent.
const formatAmount = (value) =>
 typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '';

// CRLF is the RFC 4180 line ending; some importers and every strict parser reject LF.
const CRLF = '\r\n';

// U+FEFF, the mark writeCsv prepends by default; it tells a spreadsheet the bytes
// are UTF-8 rather than its local code page.
const UTF8_BOM = '﻿';

// Response header for the module exports; names the charset the byte-order mark
// already encodes, for readers that trust the header.
export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/**
 * Join tables into one CSV with one empty record between blocks and no marker line (a marker
 * would parse as a data row). The BOM is added once here; without it `Café` opens as `CafÃ©`.
 *
 * @param {string[]} blocks - each block already rendered, header row included
 * @returns {string}
 */
const joinCsvBlocks = (blocks) => `${UTF8_BOM}${blocks.join(`${CRLF}${CRLF}`)}`;

// Renders a workbook sheet as a CSV block through the movements export's writer,
// so a file's second block and its second sheet stay identical. The BOM is off
// because joinCsvBlocks owns the start of the file.
const sheetToCsvBlock = ({ columns, rows }) => writeCsv({ columns, rows }, { bom: false });

/**
 * Convert a month series to CSV: one row per account per month, then the movements behind the
 * spend as a second block. Blocks match the workbook's sheets in order; neither format may say less.
 *
 * @param {Array<object>} accountsSeries - entries of { accountName, subcategory,
 *  currency, months: BudgetMonthStatus[] } from budgetCalculationService.
 * @param {{rows: object[], window: {from: string, to: string}}} [detail] -
 *  the detail rows and the months they were read over
 * @returns {string} CSV text including the header row.
 */
export function convertSeriesToCSV(accountsSeries, detail) {
 const accounts = Array.isArray(accountsSeries) ? accountsSeries : [];

 const body = accounts.flatMap((account) =>
  // Every month of the requested range, including the ones that resolve to 0.
  (Array.isArray(account.months) ? account.months : [])
   .map((m) =>
    [
     // The name comes from the series object alone, so no second source can
     // leave a blank cell.
     escapeCsvField(account.accountName ?? ''),
     // Read from category_budget_accounts; budgetPolicy does not carry it.
     escapeCsvField(account.subcategory ?? ''),
     // Upper case like the pocket and debt writers: ISO 4217 codes, read side by
     // side across files.
     escapeCsvField((account.currency ?? '').toUpperCase()),
     escapeCsvField(FREQUENCY),
     escapeCsvField(m.month),
     escapeCsvNumberField(formatAmount(m.budgetAmount)),
     escapeCsvNumberField(formatAmount(m.actualSpent)),
     escapeCsvNumberField(formatAmount(m.remainingBudget)),
     escapeCsvNumberField(formatAmount(m.executionPercentage)),
    ].join(','),
   ),
 );

 // Blocks two onward are the workbook's sheets two onward, rendered by the same
 // spec, so the two formats cannot carry different detail.
 const [, ...detailSheets] = buildBudgetSeriesSheets(accountsSeries, detail);

 return joinCsvBlocks([
  [COLUMNS.join(','), ...body].join(CRLF),
  ...detailSheets.map(sheetToCsvBlock),
 ]);
}

// A percentage or day count the service withheld. Unlike formatAmount it must not
// force two decimals: daysRemaining is a whole number, and 14.00 days is not a
// reading anyone wants.
const formatPlain = (value) =>
 value === null || value === undefined ? '' : String(value);

// Funding accounts are one count column, not a row per source: the board carries
// a count, not the breakdown, and a per-source file would be a different export.
const POCKET_COLUMNS = [
 'Pocket',
 'Currency',
 'Target',
 'Allocated',
 'Remaining',
 'Progress %',
 'Status',
 'Deadline',
 'Days Remaining',
 'Required Monthly',
 'Committed In Month',
 'Released In Month',
 'Funding Accounts',
 'Note',
 // Appended and never inserted: a reader's formulas address the columns above
 // by position.
 'Required by Month End',
 'Variance at Month End',
 'Coverage',
];

// The board's own words for a pocket's level and coverage. Coverage is blank for
// a pocket no account funds yet, which the board leaves unmarked too.
const pocketStatusWord = (level) => POCKET_LEVEL_WORD[level] ?? level ?? '';
const pocketCoverageWord = (pocket) =>
 pocket.uncovered ? 'Uncovered' : pocket.sourceCount > 0 ? 'Covered' : '';

/**
 * Convert a pocket board to CSV, one row per pocket in board order (a second ordering would
 * disagree with the screen). No summary row: a total in a data file is summed twice.
 * The commit and release ledger follows as a second block, matching the workbook's sheets.
 *
 * @param {Array<object>} pockets - the `pockets` array of pocketBoardService.getBoard.
 * @param {Array<object>} [allocations] - getPocketHistoryForUser's rows
 * @returns {string} CSV text including the header row.
 */
export function convertPocketBoardToCSV(pockets, allocations) {
 const rows = Array.isArray(pockets) ? pockets : [];

 const body = rows.map((pocket) =>
  [
   escapeCsvField(pocket.name ?? ''),
   escapeCsvField((pocket.currency ?? '').toUpperCase()),
   escapeCsvNumberField(formatAmount(pocket.target)),
   escapeCsvNumberField(formatAmount(pocket.allocated)),
   // Negative when over-funded, deliberately not clamped: the excess is the fact.
   escapeCsvNumberField(formatAmount(pocket.remaining)),
   escapeCsvNumberField(formatAmount(pocket.progress)),
   escapeCsvField(pocketStatusWord(pocket.level)),
   escapeCsvField(pocket.desiredDate ?? ''),
   escapeCsvNumberField(formatPlain(pocket.daysRemaining)),
   // Null after the deadline: the remainder is no monthly pace once the date has
   // passed, so the cell is empty.
   escapeCsvNumberField(formatAmount(pocket.requiredMonthly)),
   escapeCsvNumberField(formatAmount(pocket.committedInMonth)),
   escapeCsvNumberField(formatAmount(pocket.releasedInMonth)),
   escapeCsvNumberField(formatPlain(pocket.sourceCount)),
   escapeCsvField(pocket.note ?? ''),
   // Signed: positive is over what the plan requires, negative is short. Both
   // empty for a pocket with no plan window.
   escapeCsvNumberField(formatAmount(pocket.scheduledByClose)),
   escapeCsvNumberField(formatAmount(pocket.aheadAtClose)),
   escapeCsvField(pocketCoverageWord(pocket)),
  ].join(','),
 );

 // Blocks two onward are the workbook's sheets two onward, rendered by the same
 // spec: here, the commit and release ledger.
 const [, ...detailSheets] = buildPocketBoardSheets(pockets, allocations);

 return joinCsvBlocks([
  [POCKET_COLUMNS.join(','), ...body].join(CRLF),
  ...detailSheets.map(sheetToCsvBlock),
 ]);
}

// Balance is signed as the analysis serves it: positive is owed TO the owner,
// negative BY the owner. The Direction column states which, so the reader never
// infers the convention from the sign.
const DEBT_COLUMNS = [
 'Counterparty',
 'Direction',
 'Balance',
 'Currency',
 'As Of Month',
];

/**
 * Convert the debt analysis to CSV, one row per counterparty. The month is on every row, not in a
 * preamble line (no spreadsheet imports one cleanly). Two more blocks follow, matching the sheets:
 * the two figures by month, then the movements against the debtors.
 *
 * @param {Array<object>} byCounterparty - entries of { accountName, direction, balance }.
 * @param {string} asOfMonth - 'YYYY-MM', the close the balances were read at.
 * @param {string} currency - the accounting currency the analysis reports in.
 * @param {Array<object>} [legsOverTime] - entries of { month, receivable, payable }
 * @param {{rows: object[], window: {from: string, to: string}}} [detail] -
 *  the detail rows and the months they were read over
 * @returns {string} CSV text including the header row.
 */
export function convertDebtAnalysisToCSV(
 byCounterparty,
 asOfMonth,
 currency,
 legsOverTime,
 detail,
) {
 const rows = Array.isArray(byCounterparty) ? byCounterparty : [];

 const body = rows.map((row) =>
  [
   escapeCsvField(row.accountName ?? ''),
   escapeCsvField(row.direction ?? ''),
   escapeCsvNumberField(formatAmount(row.balance)),
   escapeCsvField((currency ?? '').toUpperCase()),
   escapeCsvField(asOfMonth ?? ''),
  ].join(','),
 );

 // Blocks two onward are the workbook's sheets two onward, rendered by the same
 // spec: the two figures month by month, then the movements against the debtors.
 const [, ...detailSheets] = buildDebtAnalysisSheets(
  byCounterparty,
  legsOverTime,
  asOfMonth,
  currency,
  detail,
 );

 return joinCsvBlocks([
  [DEBT_COLUMNS.join(','), ...body].join(CRLF),
  ...detailSheets.map(sheetToCsvBlock),
 ]);
}

// The two export formats and the default for a request that names none. Same pair
// and default as exportValidators.js declares for the movements export; shared so
// the Zod schemas cannot gain a format the writers do not have.
export const EXPORT_FORMATS = ['csv', 'xlsx'];
export const DEFAULT_EXPORT_FORMAT = 'csv';

// The workbook content type statementExportService and transactionExportService
// already send, named once so no endpoint answers a workbook under another type.
export const XLSX_CONTENT_TYPE =
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Pair field keys and cell types with the CSV header labels so one column list serves both writers;
 * the length check makes a column added in only one format an import-time failure.
 */
const withLabels = (fields, labels) => {
 if (fields.length !== labels.length) {
  throw new Error(
   `export column mismatch: ${fields.length} fields against ${labels.length} labels`,
  );
 }

 return fields.map((field, index) => ({ ...field, label: labels[index] }));
};

// Detail sheet under every module summary; columns come from the movements export.
// 'date' is retyped to 'text': toCellValue would build a UTC-midnight Date that reads back a day
// early west of UTC (rateDate stays 'date', an instant). Period Covered flags the wider window.
const MODULE_TRANSACTION_COLUMNS = [
 { key: 'period', label: 'Period Covered', type: 'text' },
 ...TRANSACTIONS_DATASET_COLUMNS.map((column) =>
  column.key === 'date' ? { ...column, type: 'text' } : column,
 ),
];

// 'YYYY-MM..YYYY-MM', the window the detail rows were read over.
const periodLabel = (window) =>
 window && window.from && window.to
  ? `${window.from.slice(0, 7)}..${window.to.slice(0, 7)}`
  : '';

// 'Transactions' is the name the period statement's workbook already gives this
// table, and it fits Excel's 31-character sheet name limit.
const transactionsSheet = (detail) => {
 const period = periodLabel(detail?.window);

 return {
  name: 'Transactions',
  columns: MODULE_TRANSACTION_COLUMNS,
  // Upper-cased here rather than in toTransactionDataset, where it belongs,
  // because changing that would alter the movements export's output. Without it
  // one sheet prints USD and the next usd.
  rows: (Array.isArray(detail?.rows) ? detail.rows : []).map((row) => ({
   ...row,
   period,
   currency: (row.currency ?? '').toUpperCase(),
   originalCurrency: (row.originalCurrency ?? '').toUpperCase(),
  })),
 };
};

// A calendar date or month stays 'text', never 'date': writeXlsx's toCellValue
// builds `new Date('2026-09-10')`, UTC midnight, which reads back as the day
// before in any zone west of UTC.
const BUDGET_SHEET_FIELDS = withLabels(
 [
  { key: 'accountName', type: 'text' },
  { key: 'subcategory', type: 'text' },
  { key: 'currency', type: 'text' },
  { key: 'frequency', type: 'text' },
  { key: 'month', type: 'text' },
  { key: 'budgetAmount', type: 'number' },
  { key: 'actualSpent', type: 'number' },
  { key: 'remainingBudget', type: 'number' },
  { key: 'executionPercentage', type: 'number' },
 ],
 COLUMNS,
);

const POCKET_SHEET_FIELDS = withLabels(
 [
  { key: 'name', type: 'text' },
  { key: 'currency', type: 'text' },
  { key: 'target', type: 'number' },
  { key: 'allocated', type: 'number' },
  { key: 'remaining', type: 'number' },
  { key: 'progress', type: 'number' },
  { key: 'level', type: 'text' },
  { key: 'desiredDate', type: 'text' },
  { key: 'daysRemaining', type: 'number' },
  { key: 'requiredMonthly', type: 'number' },
  { key: 'committedInMonth', type: 'number' },
  { key: 'releasedInMonth', type: 'number' },
  { key: 'sourceCount', type: 'number' },
  { key: 'note', type: 'text' },
  { key: 'scheduledByClose', type: 'number' },
  { key: 'aheadAtClose', type: 'number' },
  { key: 'coverage', type: 'text' },
 ],
 POCKET_COLUMNS,
);

// Amount keeps its sign: the allocations table is append-only (+300 becoming +250 is written as
// -50), so the sign separates a commitment from a release.
const ALLOCATION_SHEET_FIELDS = [
 { key: 'pocketName', label: 'Pocket', type: 'text' },
 { key: 'allocationDate', label: 'Date', type: 'text' },
 { key: 'amount', label: 'Amount', type: 'number' },
 { key: 'sourceAccountName', label: 'Source Account', type: 'text' },
];

const DEBT_SHEET_FIELDS = withLabels(
 [
  { key: 'accountName', type: 'text' },
  { key: 'direction', type: 'text' },
  { key: 'balance', type: 'number' },
  { key: 'currency', type: 'text' },
  { key: 'asOfMonth', type: 'text' },
 ],
 DEBT_COLUMNS,
);

// Both figures are positive magnitudes, as makeDebtAnalysis's foldLegs publishes
// them, so a reader plotting the two columns never flips one.
const DEBT_BY_MONTH_SHEET_FIELDS = [
 { key: 'month', label: 'Month', type: 'text' },
 { key: 'receivable', label: 'Receivable', type: 'number' },
 { key: 'payable', label: 'Payable', type: 'number' },
];

/**
 * The budget workbook's two sheets: the CSV's rows (currency upper-cased here and in
 * convertSeriesToCSV), then the movements behind the spend so a Spent figure can be traced.
 *
 * @param {Array<object>} accountsSeries - entries of { accountName, subcategory,
 *  currency, months: BudgetMonthStatus[] } from budgetCalculationService
 * @param {{rows: object[], window: {from: string, to: string}}} [detail] -
 *  the detail rows and the months they were read over
 * @returns {Array<{name: string, columns: object[], rows: object[]}>}
 */
export function buildBudgetSeriesSheets(accountsSeries, detail) {
 const accounts = Array.isArray(accountsSeries) ? accountsSeries : [];

 const rows = accounts.flatMap((account) =>
  (Array.isArray(account.months) ? account.months : []).map((m) => ({
   accountName: account.accountName ?? '',
   subcategory: account.subcategory ?? '',
   currency: (account.currency ?? '').toUpperCase(),
   // A constant, as in the CSV: dropping the column would break whatever the
   // reader built on top of it.
   frequency: FREQUENCY,
   month: m.month,
   budgetAmount: m.budgetAmount,
   actualSpent: m.actualSpent,
   remainingBudget: m.remainingBudget,
   // Null when the budget is 0; writeXlsx renders it empty, since 0 would claim
   // nothing was spent.
   executionPercentage: m.executionPercentage,
  })),
 );

 return [
  { name: 'Budget', columns: BUDGET_SHEET_FIELDS, rows },
  transactionsSheet(detail),
 ];
}

/**
 * The pocket workbook's two sheets: the board, then every commitment and release behind it.
 * Amounts are numbers (not the CSV's strings) so cells can be summed; no pockets yields
 * header-only sheets. No bank-movements sheet: a commitment moves no money.
 *
 * @param {Array<object>} pockets - the `pockets` array of pocketBoardService.getBoard
 * @param {Array<object>} allocations - getPocketHistoryForUser's rows
 * @returns {Array<{name: string, columns: object[], rows: object[]}>}
 */
export function buildPocketBoardSheets(pockets, allocations) {
 const boardRows = (Array.isArray(pockets) ? pockets : []).map((pocket) => ({
  ...pocket,
  currency: (pocket.currency ?? '').toUpperCase(),
  level: pocketStatusWord(pocket.level),
  coverage: pocketCoverageWord(pocket),
 }));

 const allocationRows = (Array.isArray(allocations) ? allocations : []).map((row) => ({
  ...row,
  // The repository returns NUMERIC as text; the cell must hold a number.
  amount: Number(row.amount),
 }));

 return [
  { name: 'Pockets', columns: POCKET_SHEET_FIELDS, rows: boardRows },
  { name: 'Allocations', columns: ALLOCATION_SHEET_FIELDS, rows: allocationRows },
 ];
}

/**
 * The debt workbook's three sheets: counterparty ranking, receivable and payable by month (a flat
 * net position can hide both legs doubling), then the movements against those debtors.
 * Both arrays are absent when there is no debt, so they are defaulted here to keep the sheets.
 *
 * @param {Array<object>} byCounterparty - entries of { accountName, direction, balance }
 * @param {Array<object>} legsOverTime - entries of { month, receivable, payable }
 * @param {string} asOfMonth - 'YYYY-MM', the close the balances were read at
 * @param {string} currency - the accounting currency the analysis reports in
 * @param {{rows: object[], window: {from: string, to: string}}} [detail] -
 *  the detail rows and the months they were read over
 * @returns {Array<{name: string, columns: object[], rows: object[]}>}
 */
export function buildDebtAnalysisSheets(
 byCounterparty,
 legsOverTime,
 asOfMonth,
 currency,
 detail,
) {
 const counterpartyRows = (Array.isArray(byCounterparty) ? byCounterparty : []).map((row) => ({
  ...row,
  currency: (currency ?? '').toUpperCase(),
  asOfMonth: asOfMonth ?? '',
 }));

 const legRows = Array.isArray(legsOverTime) ? legsOverTime : [];

 // Named for the two figures, not the internal word 'legs'; shortened from the
 // PDF's sentence because Excel limits a sheet name to 31 characters.
 return [
  { name: 'Counterparties', columns: DEBT_SHEET_FIELDS, rows: counterpartyRows },
  { name: 'Receivable & Payable by Month', columns: DEBT_BY_MONTH_SHEET_FIELDS, rows: legRows },
  transactionsSheet(detail),
 ];
}

// Closed-account registry columns in reading order. Close Reason is the point of this file (no
// other read reaches it) and goes last so its long free text does not push the others out of view.
const CLOSED_ACCOUNT_COLUMNS = [
 'Account Name',
 'Account Type',
 'Category',
 'Subcategory',
 'Category Nature',
 'Currency',
 'Starting Amount',
 'Start Date',
 'Created At',
 'Closed At',
 'Closed By',
 'Close Reason',
];

// The three calendar dates are 'text', never 'date' (see BUDGET_SHEET_FIELDS):
// the reader already renders them as 'YYYY-MM-DD' on the owner's calendar, and
// toCellValue would rebuild them at UTC midnight.
const CLOSED_ACCOUNT_SHEET_FIELDS = withLabels(
 [
  { key: 'accountName', type: 'text' },
  { key: 'accountTypeName', type: 'text' },
  { key: 'categoryName', type: 'text' },
  { key: 'subcategory', type: 'text' },
  { key: 'categoryNatureTypeName', type: 'text' },
  { key: 'currencyCode', type: 'text' },
  { key: 'accountStartingAmount', type: 'number' },
  { key: 'accountStartDate', type: 'text' },
  { key: 'accountCreatedAt', type: 'text' },
  { key: 'closedAt', type: 'text' },
  { key: 'closedBy', type: 'text' },
  { key: 'closeReason', type: 'text' },
 ],
 CLOSED_ACCOUNT_COLUMNS,
);

/**
 * The closed-account workbook's one sheet. No detail block: a row here is already a closure at
 * its finest grain. No closures yields a header-only sheet.
 *
 * @param {Array<object>} closures - getClosedAccountRegistryForExport's rows
 * @returns {Array<{name: string, columns: object[], rows: object[]}>}
 */
export function buildClosedAccountSheets(closures) {
 const rows = (Array.isArray(closures) ? closures : []).map((row) => ({
  ...row,
  // Upper case, like the other writers.
  currencyCode: (row.currencyCode ?? '').toUpperCase(),
  // NUMERIC arrives as text; the cell must hold a number. Null stays null, which
  // both writers render as empty: a registry row for an account erased before 035
  // carries no amount.
  accountStartingAmount:
   row.accountStartingAmount === null || row.accountStartingAmount === undefined
    ? null
    : Number(row.accountStartingAmount),
 }));

 return [{ name: 'Closed Accounts', columns: CLOSED_ACCOUNT_SHEET_FIELDS, rows }];
}

/**
 * Convert the closed-account registry to an RFC 4180 CSV document. Rendered from
 * the workbook's sheet spec with no hand-written row builder, so a column added
 * to CLOSED_ACCOUNT_SHEET_FIELDS reaches both formats or neither.
 *
 * @param {Array<object>} closures - getClosedAccountRegistryForExport's rows
 * @returns {string} CSV text including the header row.
 */
export function convertClosedAccountsToCSV(closures) {
 return joinCsvBlocks(buildClosedAccountSheets(closures).map(sheetToCsvBlock));
}
