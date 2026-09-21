// The only frontend client for /budget; outside pages/ because the account editor and budget page share it.
// Errors propagate untouched: the envelope's per-issue field and code would be flattened by normalizeError.

import { authFetch } from '../../auth/auth_utils/authFetch.ts';
import {
 url_budget_account_current,
 url_budget_account_series,
 url_budget_accounts_status,
} from '../../urlConfig.ts';
import {
 BudgetAccountsStatusResponse,
 BudgetSeriesResponse,
 BudgetWriteRequest,
 BudgetWriteResponse,
} from '../types/budgetTypes.ts';

// month is optional and past-only; the server resolves the default on the owner's timezone.
// Absent arguments are omitted from the body (strict schema); no accountIds means every budget account.
export const getBudgetAccountsStatus = async (
 accountIds?: number[],
 month?: string,
): Promise<BudgetAccountsStatusResponse> => {
 const { data } = await authFetch<BudgetAccountsStatusResponse>(
  url_budget_accounts_status,
  {
   method: 'POST',
   data: {
    ...(accountIds ? { accountIds } : {}),
    ...(month ? { month } : {}),
   },
  },
 );

 return data;
};

// One object, not positionals: month and appliesUntil are both 'YYYY-MM-01' strings, easy to swap.
// Neither bound is defaulted: the server refuses to guess how far a save reaches.
export const setCurrentBudget = async (
 accountId: number,
 allocation: BudgetWriteRequest,
): Promise<BudgetWriteResponse> => {
 const { data } = await authFetch<BudgetWriteResponse>(
  url_budget_account_current(accountId),
  { method: 'PUT', data: allocation },
 );

 return data;
};

// Both bounds are optional and omitted when absent: the server defaults to the
// last twelve months, and a client default would be a second calendar to keep in sync.
export const getBudgetAccountSeries = async (
 accountId: number,
 range: { from?: string; to?: string } = {},
): Promise<BudgetSeriesResponse> => {
 const { data } = await authFetch<BudgetSeriesResponse>(
  url_budget_account_series(accountId),
  {
   method: 'GET',
   params: {
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
   },
  },
 );

 return data;
};
