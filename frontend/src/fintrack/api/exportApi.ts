// Every download the frontend issues. Absent keys are dropped, not sent empty:
// the endpoint schemas are strict and refuse a zero-length search.
// The movements export sends only the on-screen query (search, type, period).

import { downloadFile } from '../helpers/downloadFile';
import {
 url_budget_export,
 url_closed_accounts_export,
 url_debt_export,
 url_export_movements,
 url_export_statement,
 url_pocket_export,
} from '../../urlConfig';
import { OverviewActivityMovementType } from '../types/overviewTypes';
import {
 ClosedAccountOrderType,
 ClosedAccountSortKeyType,
} from '../editionAndDeletion/types/closedAccountsTypes';

export type ExportFormat = 'csv' | 'xlsx';

export type ExportMovementsQuery = {
 from?: string | null;
 to?: string | null;
 search?: string;
 movementType?: OverviewActivityMovementType;
 format: ExportFormat;
};

/**
 * Download the `transactions` dataset for the active activity query.
 *
 * @throws {Error} the server's own message when the request failed
 */
export const downloadMovementsExport = async (query: ExportMovementsQuery): Promise<void> => {
 const params: Record<string, string> = { format: query.format };

 if (query.from) params.from = query.from;
 if (query.to) params.to = query.to;
 if (query.search) params.search = query.search;
 if (query.movementType) params.movementType = query.movementType;

 await downloadFile(url_export_movements, params, `fintrack-movements.${query.format}`);
};

// The statement's own format union. Not ExportFormat above: that one is
// 'csv' | 'xlsx' for /export/movements and has no 'pdf' member.
export type StatementFormat = 'xlsx' | 'pdf';

export type ExportStatementQuery = {
 // 'YYYY-MM' or 'YYYY-MM-DD'/'YYYY-MM-01' — the backend's monthBound
 // validator accepts both.
 month: string;
 format: StatementFormat;
};

// 'YYYY-MM-01' sliced to 'YYYY-MM'. Used as the fallback filename when the
// server sends no Content-Disposition, and reused by the trigger's menu to
// name each format before it is chosen.
export const statementFileName = (month: string, format: StatementFormat): string =>
 `fintrack-statement-${month.slice(0, 7)}.${format}`;

/**
 * Download the period statement — one month, as a workbook or a PDF summary.
 *
 * @throws {Error} the server's own message when the request failed
 */
export const downloadStatementExport = async (query: ExportStatementQuery): Promise<void> => {
 await downloadFile(
  url_export_statement,
  { month: query.month, format: query.format },
  statementFileName(query.month, query.format),
 );
};

// Module list exports. The saved name comes from Content-Disposition; the fallback names below apply
// only when it is missing. The current month is never sent: the server resolves it on the owner's calendar.

// The URL carries 'YYYY-MM' and the month endpoints take the first of that
// month, so the day is added here, not at every call site. A value that already
// has a day is re-spelled, not appended to.
const firstOfMonth = (month: string): string => `${month.slice(0, 7)}-01`;

export type BudgetExportQuery = {
 format: ExportFormat;
 // One budget account instead of every one the owner holds. No screen sends it
 // yet: the category list exports the whole month.
 accountId?: number | string;
 // A historical range, both bounds as 'YYYY-MM-01'. A single month is the same
 // month on both.
 from?: string;
 to?: string;
};

/**
 * Download the budget rows for the month on screen.
 *
 * @throws {Error} the server's own message when the request failed
 */
export const downloadBudgetExport = async (
 query: BudgetExportQuery,
): Promise<void> => {
 const params: Record<string, string> = { format: query.format };

 if (query.accountId !== undefined) params.accountId = String(query.accountId);
 if (query.from) params.from = firstOfMonth(query.from);
 if (query.to) params.to = firstOfMonth(query.to);

 await downloadFile(
  url_budget_export,
  params,
  `fintrack-budget${query.from ? `-${query.from.slice(0, 7)}` : ''}.${query.format}`,
 );
};

// One optional month beside the format, which is all the pocket and debt
// exports take.
export type MonthExportQuery = {
 format: ExportFormat;
 // 'YYYY-MM' or 'YYYY-MM-01'; both are normalised to the first of the month.
 month?: string;
};

// Both endpoints below build the same two keys from the same rule.
const monthParams = (query: MonthExportQuery): Record<string, string> => ({
 format: query.format,
 ...(query.month ? { month: firstOfMonth(query.month) } : {}),
});

/**
 * Download the pocket board for the month on screen.
 *
 * @throws {Error} the server's own message when the request failed
 */
export const downloadPocketExport = async (
 query: MonthExportQuery,
): Promise<void> => {
 await downloadFile(
  url_pocket_export,
  monthParams(query),
  `fintrack-pockets${query.month ? `-${query.month.slice(0, 7)}` : ''}.${query.format}`,
 );
};

/**
 * Download the debtor list.
 *
 * @throws {Error} the server's own message when the request failed
 */
export const downloadDebtExport = async (
 query: MonthExportQuery,
): Promise<void> => {
 await downloadFile(
  url_debt_export,
  monthParams(query),
  `fintrack-debts${query.month ? `-${query.month.slice(0, 7)}` : ''}.${query.format}`,
 );
};

// The registry takes no month: a closure is dated and never repeats. The file is
// cut by the toolbar's search, type, sort and order so it matches the screen.
// The page size does not travel: the file carries every matching row.
export type ClosedAccountsExportQuery = {
 format: ExportFormat;
 search?: string;
 // account_types.account_type_name, e.g. 'bank'. Empty means every type and is
 // dropped rather than sent.
 type?: string;
 sort?: ClosedAccountSortKeyType;
 order?: ClosedAccountOrderType;
};

/**
 * Download the closed-account registry as the screen is filtering and sorting it.
 *
 * @throws {Error} the server's own message when the request failed
 */
export const downloadClosedAccountsExport = async (
 query: ClosedAccountsExportQuery,
): Promise<void> => {
 const params: Record<string, string> = { format: query.format };

 // Trimmed and dropped when empty, as useClosedAccounts does for the list
 // request, so the file and the screen use the same values.
 if (query.search?.trim()) params.search = query.search.trim();
 if (query.type) params.type = query.type;
 if (query.sort) params.sort = query.sort;
 if (query.order) params.order = query.order;

 await downloadFile(
  url_closed_accounts_export,
  params,
  `fintrack-closed-accounts.${query.format}`,
 );
};
