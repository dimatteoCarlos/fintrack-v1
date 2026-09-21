// How one budget reads (ok / near / over), decided once so every screen agrees on the same row.
// A presentation threshold over the served isOverBudget and executionPercentage; nothing is recomputed.
// In helpers/ because the account-detail hero sits outside the budget tree.

// Business rule, not a derivation: nothing in the model to read it from.
export const BUDGET_NEAR_LIMIT_PERCENT = 75;

export type BudgetStatusLevel = 'ok' | 'near' | 'over';

// Class appended by the shared StatusSquare; 'ok' is the bare square, hence ''.
const SQUARE_CLASS: Record<BudgetStatusLevel, string> = {
 ok: '',
 near: 'warning',
 over: 'alert',
};

/**
 * A withheld percentage reads as `ok`: the server nulls the figures of a
 * multi-currency set, and a share that cannot be computed was never measured
 * against the threshold, so painting it amber would state an unmeasured proximity.
 */
export const budgetStatusLevel = (
 executionPercentage: number | null | undefined,
 isOverBudget: boolean | null | undefined,
): BudgetStatusLevel => {
 if (isOverBudget === true) return 'over';

 return typeof executionPercentage === 'number' &&
  executionPercentage >= BUDGET_NEAR_LIMIT_PERCENT
  ? 'near'
  : 'ok';
};

/** The same decision, as the string StatusSquare takes. */
export const budgetSquareState = (
 executionPercentage: number | null | undefined,
 isOverBudget: boolean | null | undefined,
): string => SQUARE_CLASS[budgetStatusLevel(executionPercentage, isOverBudget)];

/**
 * Nothing budgeted and nothing spent is "no budget", not a budget met: the server withholds
 * executionPercentage there (no denominator). Spending against a zero budget returns false.
 */
export const isUnbudgeted = (
 budgetAmount: number | null | undefined,
 actualSpent: number | null | undefined,
): boolean => budgetAmount === 0 && actualSpent === 0;

/**
 * The word printed beside the remainder. Empty when there is no side: figures
 * still on the wire, or nothing budgeted and nothing spent. The word carries the
 * sign, so callers print Math.abs of the amount beside it.
 */
export const budgetRemainWord = (
 budgetAmount: number | null | undefined,
 actualSpent: number | null | undefined,
 remainingBudget: number | null | undefined,
): 'over' | 'left' | '' =>
 remainingBudget === null ||
 remainingBudget === undefined ||
 isUnbudgeted(budgetAmount, actualSpent)
  ? ''
  : remainingBudget < 0
   ? 'over'
   : 'left';
