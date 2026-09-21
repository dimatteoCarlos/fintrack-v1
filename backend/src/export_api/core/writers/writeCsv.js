// Turns a resolved { columns, rows } dataset into an RFC 4180 CSV document; computes nothing.
// The formula guard is type-based: only 'text' cells can be read as a formula, and a 'number'
// cell keeps a leading '-' as a sign.

const TEXT = 'text';
const NUMBER = 'number';
const DATE = 'date';
const BOOLEAN = 'boolean';

const guardFormula = (raw) => (/^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw);

// RFC 4180 text field: quoted only when it holds a delimiter, quote, CR or LF; quotes doubled.
const escapeCsvText = (value) => {
 const raw = value === null || value === undefined ? '' : String(value);
 const guarded = guardFormula(raw);
 return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

const formatCsvCell = (value, type) => {
 if (value === null || value === undefined) return '';
 switch (type) {
  case NUMBER:
   return Number.isFinite(Number(value)) ? String(value) : '';
  case BOOLEAN:
   return value ? 'true' : 'false';
  case DATE:
   return String(value);
  case TEXT:
  default:
   return escapeCsvText(value);
 }
};

/**
 * @param {{columns: Array<{key: string, label: string, type: 'text'|'number'|'date'|'boolean'}>,
 *  rows: object[]}} dataset - resolved; no further lookups
 * @param {{bom?: boolean}} [options] - bom defaults to true
 * @returns {string} CSV text, CRLF row endings, optional leading UTF-8 BOM
 */
export function writeCsv({ columns, rows }, { bom = true } = {}) {
 const header = columns.map((column) => escapeCsvText(column.label)).join(',');
 const body = rows.map((row) =>
  columns.map((column) => formatCsvCell(row[column.key], column.type)).join(','),
 );

 // CRLF is the RFC 4180 line ending; some strict importers reject bare LF.
 const text = [header, ...body].join('\r\n');
 return bom ? `﻿${text}` : text;
}
