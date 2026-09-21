// Endpoint URLs; the bases come from VITE_API_* (locally http://localhost:5000/api/ and its sub-paths).
export const BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

export const BASE_URL_AUTH: string = import.meta.env.VITE_API_BASE_URL_AUTH;


export const url_signup: string = BASE_URL_AUTH + 'sign-up';

export const url_signin: string = BASE_URL_AUTH + 'sign-in';

export const url_signout: string = BASE_URL_AUTH + 'sign-out';

export const url_refreshToken: string = BASE_URL_AUTH + 'refresh-token';

export const url_validate_session = BASE_URL_AUTH + 'validate-session';

export const url_change_password = BASE_URL + `user/change-password`;

export const url_update_user = BASE_URL + 'user/update-profile';

export const BASE_URL_APP: string = import.meta.env.VITE_API_URL_APP;

// New account of type bank, investment or income_source.
export const url_create_basic_account: string =
  BASE_URL_APP + 'account/new_account'; //account_type is dynamic

// Account list summary by account type, e.g. ?type=category_budget or ?type=expense.
export const url_summary_balance_ByType: string =
  BASE_URL_APP + 'dashboard/balance/summary/';

export const url_create_category_budget_account: string =
  BASE_URL_APP + 'account/new_account/category_budget';

// A pocket is a planning object, not an account: create it with url_pocket_create below.

export const url_create_debtor_account: string =
  BASE_URL_APP + 'account/new_account/debtor';

// GET /api/fintrack/debt/export?month=YYYY-MM-01
// The debtor list as a comma-separated file. The month is optional and the
// current one never travels: the server resolves it on the owner's calendar.
export const url_debt_export: string = BASE_URL_APP + 'debt/export';

export const url_get_account_by_id: string = BASE_URL_APP + 'account';

// Transactions of one account: /account/transactions/:account_id/?start=&end=
export const url_get_transactions_by_account_id: string =  BASE_URL_APP + 'account/transactions';
// Accounts of one type (id, name, type, currency, balance), excluding the slack account.
// Example: ?type=bank or ?type=category_budget.
export const url_get_accounts_by_type: string = BASE_URL_APP + 'account/type';
// Every account of every type, excluding the slack account.
export const url_get_all_accounting_accounts: string =  BASE_URL_APP + 'account/allAccounts/';
export const url_get_all_accounts = `${BASE_URL_APP}account/allAccounts`;
// Sum of balances of one account type; for pocket and category budget it also returns the total goal or
// budget, and it serves income source balances.
export const url_get_total_account_balance_by_type: string =
  BASE_URL_APP + 'dashboard/balance/type';

// Transfer between accounts, e.g. ?movement=expense.
export const url_movement_transaction_record: string =
  BASE_URL_APP + 'transaction/transfer-between-accounts';

// GET /api/fintrack/overview/?month=YYYY-MM, one request for the whole page. month is optional and
// past-only; omitted, the server uses the current month. Unlike budget, the result is wrapped as
// { status, message, data }; overviewApi.ts unwraps it.
export const url_get_overview: string = BASE_URL_APP + 'overview';

// Activity list with its own period, search, filter and pagination; separate because its period is the
// reader's, while every other figure of the page follows the reference month.
export const url_get_overview_activity: string =
  BASE_URL_APP + 'overview/activity';

// GET /api/fintrack/overview/:domain?month=YYYY-MM
// The domain is a path segment because it selects which of the six calculators answers.
// /overview/activity above is not a domain and does not go through here.
export const url_get_overview_domain = (domain: string): string =>
  BASE_URL_APP + 'overview/' + domain;

// Mounted off BASE_URL, not BASE_URL_APP: Data Export is a sibling backend module of /api/fintrack.
export const url_export_movements: string = BASE_URL + 'export/movements';
// The period statement, one reference month per request.
export const url_export_statement: string = BASE_URL + 'export/statement';

export const url_get_account_details_by_id_for_edition: string =
  BASE_URL_APP + 'account/details/';

export const url_patch_account_edit = BASE_URL_APP + 'account/edit';

// Budget module. The current month never travels: the server resolves it from the
// account owner's timezone. Only a historical range is sent, as from/to.

// POST /api/fintrack/budget/accounts/status  { accountIds: [] }
export const url_budget_accounts_status: string =
  BASE_URL_APP + 'budget/accounts/status';

// PUT /api/fintrack/budget/accounts/:accountId/current  { amount, month, appliesUntil }
export const url_budget_account_current = (accountId: string | number) =>
  `${BASE_URL_APP}budget/accounts/${accountId}/current`;

// GET /api/fintrack/budget/accounts/:accountId/series?from=&to=
export const url_budget_account_series = (accountId: string | number) =>
  `${BASE_URL_APP}budget/accounts/${accountId}/series`;

// GET /api/fintrack/budget/export?accountId=&from=&to=
// The month's budget rows as a CSV file; all parameters are optional and follow the block's rule above.
export const url_budget_export: string = BASE_URL_APP + 'budget/export';

// GET /api/fintrack/account/delete/report_of_affected_accounts/:targetAccountId
// Impact report of deleting an account (RTA method).
export const url_report_of_affected_accounts = (
  targetAccountId: string | number,
) =>
  `${BASE_URL_APP}account/delete/report_of_affected_accounts/${targetAccountId}`;

// DELETE /api/fintrack/account/delete/:targetAccountId, shared by the RTA, HARD
// and SOFT deletion methods.
export const url_account_delete = (targetAccountId: string | number) =>
  `${BASE_URL_APP}account/delete/${targetAccountId}`;

// GET /api/fintrack/account/delete/close_preview/:targetAccountId
// Three segments, so the single-segment '/:accountId' route declared above it in
// accountRoutes.js cannot swallow it.
export const url_account_close_preview = (targetAccountId: string | number) =>
  `${BASE_URL_APP}account/delete/close_preview/${targetAccountId}`;

// GET /api/fintrack/account/closed: one page of the closed-account registry.
// Registered before '/:accountId' in accountRoutes.js, or 'closed' would be read as an account id.
// Search, type, sort, order, page and limit go in the query string; unknown values fall back to page 1.
export const url_closed_accounts = (queryString: string = '') =>
  queryString
    ? `${BASE_URL_APP}account/closed?${queryString}`
    : `${BASE_URL_APP}account/closed`;

// GET /api/fintrack/account/closed/export?format=csv|xlsx&search=&sort=&order=&type=
// Unlike the other exports it sends the screen's search, type and sort, so the file matches the list
// on screen; page and limit are not sent: the file holds every matching row.
export const url_closed_accounts_export: string =
  BASE_URL_APP + 'account/closed/export';

export const url_currency_rates = BASE_URL_APP + 'currency/rates';

// The write path's conversion service, asked before writing: amount, rate, rate source and read time.
export const url_currency_convert = BASE_URL_APP + 'currency/convert';

export const url_get_transaction_by_id = BASE_URL_APP + 'transaction/';
// Pocket module. One request feeds the whole board so header totals and list cannot disagree.
// Identity comes from the token; nothing names the owner.

// GET /api/fintrack/pocket/board?month=YYYY-MM
// month is optional and only sent when the reader stepped back; the current month never travels.
export const url_pocket_board = (month?: string): string =>
 month
  ? `${BASE_URL_APP}pocket/board?month=${encodeURIComponent(month)}`
  : `${BASE_URL_APP}pocket/board`;

// POST /api/fintrack/pocket
// Answers 201 with the whole detail payload rather than an id, so the next screen needs no request.
export const url_pocket_create: string = BASE_URL_APP + 'pocket';

// GET /api/fintrack/pocket/:pocketId
// One request serves hero, funding accounts and allocation history so they cannot disagree.
// Takes a pocket id, never an account id: a different id space that also starts at 1.
export const url_pocket_detail = (pocketId: number | string): string =>
 BASE_URL_APP + `pocket/${pocketId}`;

// POST /api/fintrack/pocket/:pocketId/allocations
// Commits cash from one account to one goal; the amount is always positive (the server signs releases).
// No money moves: the account balance is untouched and its unassigned cash shrinks.
export const url_pocket_allocations = (pocketId: number | string): string =>
 BASE_URL_APP + `pocket/${pocketId}/allocations`;

// POST /api/fintrack/pocket/:pocketId/releases
// Same body as allocations, opposite effect. Separate URLs because the ceilings differ: committing is
// bounded by the account's uncommitted cash, releasing by what this pocket holds from that account.
export const url_pocket_releases = (pocketId: number | string): string =>
 BASE_URL_APP + `pocket/${pocketId}/releases`;

// GET /api/fintrack/pocket/export?month=YYYY-MM-01
// The board as a CSV file; month follows the url_pocket_board rule and is sent as the first of the month.
export const url_pocket_export: string = BASE_URL_APP + 'pocket/export';
