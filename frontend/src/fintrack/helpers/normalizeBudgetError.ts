// Keeps the error envelope whole: normalizeError flattens a 400 to the constant
// 'Validation Error', while the controller's errors[] names each offending field.
// Budget screens use this reader; normalizeError stays for sentence-only callers.

import { BudgetErrorIssue, BudgetErrorResponse } from '../types/budgetTypes.ts';

const isIssue = (value: unknown): value is BudgetErrorIssue =>
 typeof value === 'object' &&
 value !== null &&
 typeof (value as BudgetErrorIssue).field === 'string' &&
 typeof (value as BudgetErrorIssue).message === 'string';

export const normalizeBudgetError = (error: unknown): BudgetErrorResponse => {
 const body =
  typeof error === 'object' && error !== null && 'response' in error
   ? (error as { response?: { data?: Partial<BudgetErrorResponse> } }).response
      ?.data
   : undefined;

 // A rejected request that never reached the server has no envelope: no status
 // to report and no field to blame, so it keeps its own sentence.
 if (!body) {
  return {
   status: 0,
   message:
    error instanceof Error ? error.message : 'The budget could not be saved.',
  };
 }

 return {
  status: typeof body.status === 'number' ? body.status : 500,
  message: body.message ?? 'The budget could not be saved.',
  errors: Array.isArray(body.errors) ? body.errors.filter(isIssue) : undefined,
 };
};
