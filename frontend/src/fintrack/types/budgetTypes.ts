// Response contract of the /budget module; if this file and the server disagree, the server changes.
// A budget is one amount for one expense account and month, in force until a later row replaces it.

import { CurrencyType } from './types.ts';

// PUT /budget/accounts/:accountId/current, sent { amount, month, appliesUntil }.

// The one appliesUntil value that is not a month. A wire-contract term: a repeated literal is one typo
// from a 400 nothing here would catch.
export const OPEN_ENDED = 'openEnded';

export type BudgetWriteRequest = {
 // The figure as typed, in `currency` — NOT converted here. The server owns the
 // rate, and a client that converted first would decide the stored amount with
 // a rate the server never saw.
 amount: number;
 // The currency the amount is stated in. Required, with no default: sending
 // none is what made the server read 50000 cop as 50000 usd.
 currency: CurrencyType;
 // First month the amount applies to, as 'YYYY-MM-01'.
 month: string;
 // Last month it applies to, or OPEN_ENDED. Neither bound is defaulted: the
 // server refuses to guess how far a save reaches, and so does the client.
 appliesUntil: string;
};

export type BudgetWriteResponse = {
 accountId: number;
 // The month written, always the first of the month as text: 2026-08-01.
 budgetMonth: string;
 // What was stored, in the account's currency.
 budgetAmount: number;
 // What was typed, in which currency, plus the rate. It differs from the stored figure whenever the
 // badge names another currency; stating only the stored one reads as a correction the user did not make.
 originalAmount: number;
 originalCurrency: CurrencyType;
 currency: CurrencyType;
 exchangeRate: number;
 // Echoed back in the request's vocabulary — OPEN_ENDED rather than the null
 // the repository stores — so the response reads back as what was sent.
 appliesUntil: string;
 // What the month after the range goes back to, and which month that is. Both
 // null together on an open-ended save, which terminates nothing. restoresTo
 // is 0 when no amount governed that month.
 restoresTo: number | null;
 restoresFrom: string | null;
 // The months whose stored decision this write replaced, ascending. Empty when
 // the write replaced none, never absent.
 overwrittenMonths: string[];
};

// The budget_allocation key of POST /accounts. The account PATCH neither writes
// a budget nor returns this key.
export type AccountBudgetAllocation = {
 accountId: number;
 budgetMonth: string;
 budgetAmount: number;
};

// The four values of category_nature_types, seeded by migration 005 and by the
// runtime initializer. A closed union rather than string: the level-2 row maps a
// nature to a tag, and the compiler is what makes that map exhaustive.
export type BudgetNature = 'must' | 'need' | 'want' | 'other';

// One account in POST /budget/accounts/status. Every monetary field is a number:
// no budget in force resolves to 0, and spending against it leaves a negative
// remainingBudget — the amount the user went into the red by.
export type BudgetAccountStatus = {
 accountId: number;
 accountName: string;
 // Repeated on every row so a row read outside its group still says what it
 // belongs to. No component joins it back to categories[].
 categoryName: string;
 // Both nullable: the columns are, and the level-2 row renders them. A missing
 // one is a dash, never an empty string the layout collapses.
 subcategory: string | null;
 // Per account and not per category, because it varies within one — which is
 // what makes it worth showing beside a subcategory.
 nature: BudgetNature | null;
 // Day the account was registered; never rendered. A tracker form reads it to stop offering a
 // category before it existed. A null is treated as open: the server refuses the movement anyway.
 accountStartDate: string | null;
 // The day the account was closed. Same shipping rule as accountStartDate;
 // null means still open.
 closedDate: string | null;
 currency: CurrencyType;
 budgetAmount: number;
 // Renders the "this month only" line when it differs from budgetAmount. The
 // comparison is on amounts, not on whether a row exists at M+1.
 nextMonthBudget: number;
 actualSpent: number;
 remainingBudget: number;
 // The only null in the contract: there is no percentage of a budget of 0.
 executionPercentage: number | null;
 isOverBudget: boolean;
};

// The header figures, summed by the server from the rows above so no component
// adds amounts up.
export type BudgetStatusTotals = {
 // null when no account was requested. All accounts share the accounting
 // currency, so a mixed set is not reachable.
 currency: CurrencyType | null;
 budgetAmount: number;
 actualSpent: number;
 remainingBudget: number;
 executionPercentage: number | null;
};

// Accounts folded by category, summed from the same rounded rows so a group header reconciles.
// Fields are nullable only for a category mixing currencies (ruled out by the single accounting
// currency): an alert via meta.notices, while the account rows keep their amounts.
export type BudgetCategoryStatus = {
 categoryName: string;
 currency: CurrencyType | null;
 // How many accounts the group folds. Served so no component counts them.
 accountCount: number;
 budgetAmount: number | null;
 actualSpent: number | null;
 remainingBudget: number | null;
 executionPercentage: number | null;
 isOverBudget: boolean | null;
};

export type BudgetAccountsStatusResponse = {
 // The month every figure below is about: the one requested, or the current one
 // on the owner's calendar when none was. Read it rather than assuming "now".
 referenceMonth: string;
 // One entry per REQUESTED account, budgeted or not. When the request omits
 // accountIds, "requested" means every budget account the user owns.
 accounts: BudgetAccountStatus[];
 // Ordered by categoryName. One entry per category present in accounts[].
 categories: BudgetCategoryStatus[];
 totals: BudgetStatusTotals;
 meta: BudgetMeta;
};

// One month of GET /budget/accounts/:accountId/series. No currency and no
// nextMonthBudget: the currency is stated once at the top of the series, and the
// next month is the next entry of the array.
export type BudgetMonthStatus = {
 month: string;
 budgetAmount: number;
 actualSpent: number;
 remainingBudget: number;
 executionPercentage: number | null;
 isOverBudget: boolean;
};

export type BudgetSeriesTotals = {
 budgetAmount: number;
 actualSpent: number;
 remainingBudget: number;
 // Recomputed from the sums, never averaged across the months.
 executionPercentage: number | null;
 monthsOverBudget: number;
 // Divided by every month in the range, including those with no budget.
 averageMonthlySpend: number;
};

export type BudgetSeriesResponse = {
 accountId: number;
 accountName: string;
 currency: CurrencyType;
 from: string;
 to: string;
 // Every month between from and to is present, gaps included: the carry-forward
 // fill happens in SQL so the client never re-derives it.
 months: BudgetMonthStatus[];
 totals: BudgetSeriesTotals;
};

// Always an object, and notices is always an array. No null check needed.
export type BudgetMeta = {
 notices: string[];
 // Current month on the owner's calendar, 'YYYY-MM-01'; NOT referenceMonth. It is the month
 // selector's ceiling and the client cannot derive it: its clock is not that calendar.
 currentMonth: string;
};

// One shape for every endpoint; errors appears only when Zod produced issues.
// No 404 by design: 403 covers missing and foreign accounts alike, so callers
// cannot walk the id space to learn which accounts belong to other users.
export type BudgetErrorIssue = {
 field: string;
 message: string;
 code: string;
};

export type BudgetErrorResponse = {
 status: number;
 message: string;
 errors?: BudgetErrorIssue[];
};
