// Turns a resolved { columns, rows, meta } dataset into an XLSX workbook; computes nothing.
// The formula guard is type-based (as in writeCsv.js): only 'text' cells are guarded, so
// numbers, dates and booleans keep their type and a negative amount stays sortable.

import ExcelJS from 'exceljs';

const TEXT = 'text';
const NUMBER = 'number';
const DATE = 'date';
const BOOLEAN = 'boolean';

const guardFormula = (raw) => (/^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw);

const toCellValue = (value, type) => {
 if (value === null || value === undefined) return null;
 switch (type) {
  case NUMBER:
   return Number.isFinite(Number(value)) ? Number(value) : null;
  case BOOLEAN:
   return Boolean(value);
  case DATE:
   return value instanceof Date ? value : new Date(value);
  case TEXT:
  default:
   return guardFormula(String(value));
 }
};

// Shared by writeXlsx and writeXlsxWorkbook so the header freeze, autofilter and
// formula guard cannot drift between them.
const appendDataSheet = (workbook, sheetName, { columns, rows }) => {
 const sheet = workbook.addWorksheet(sheetName);

 sheet.columns = columns.map((column) => ({
  header: column.label,
  key: column.key,
  width: Math.max(column.label.length + 2, 12),
  style: column.type === NUMBER ? { numFmt: '#,##0.00' } : undefined,
 }));

 rows.forEach((row) => {
  const record = {};
  columns.forEach((column) => {
   record[column.key] = toCellValue(row[column.key], column.type);
  });
  sheet.addRow(record);
 });

 sheet.views = [{ state: 'frozen', ySplit: 1 }];
 sheet.autoFilter = {
  from: { row: 1, column: 1 },
  to: { row: 1, column: columns.length },
 };
 sheet.getRow(1).font = { bold: true };

 return sheet;
};

/**
 * @param {{columns: Array<{key: string, label: string, type: 'text'|'number'|'date'|'boolean'}>,
 *  rows: object[], meta?: Record<string, string|number>}} dataset - meta becomes a
 *  second "Metadata" sheet when present
 */
export async function writeXlsx({ columns, rows, meta }, { sheetName = 'Sheet1' } = {}) {
 const workbook = new ExcelJS.Workbook();
 appendDataSheet(workbook, sheetName, { columns, rows });

 // Never user_id: meta identifies the file's contents, not its owner.
 if (meta && Object.keys(meta).length > 0) {
  const metaSheet = workbook.addWorksheet('Metadata');
  metaSheet.columns = [
   { header: 'Field', key: 'field', width: 20 },
   { header: 'Value', key: 'value', width: 40 },
  ];
  Object.entries(meta).forEach(([field, value]) => {
   metaSheet.addRow({ field, value: value === null || value === undefined ? '' : String(value) });
  });
  metaSheet.getRow(1).font = { bold: true };
 }

 return workbook.xlsx.writeBuffer();
}

/**
 * Several named sheets in one workbook (the period statement). Unlike writeXlsx it adds
 * no Metadata sheet from `meta`; the caller passes that sheet as one more entry.
 *
 * @param {Array<{name: string, columns: Array<{key: string, label: string,
 *  type: 'text'|'number'|'date'|'boolean'}>, rows: object[]}>} sheets - in
 *  workbook order
 */
export async function writeXlsxWorkbook(sheets) {
 const workbook = new ExcelJS.Workbook();
 sheets.forEach(({ name, columns, rows }) => appendDataSheet(workbook, name, { columns, rows }));

 return workbook.xlsx.writeBuffer();
}
