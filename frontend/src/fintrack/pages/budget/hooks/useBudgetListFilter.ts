// In-memory search, sort and over-budget filter for budget lists, generic over the row shape (level 1
// rows are categories, level 2 rows are accounts). Filtering never changes the totals: the header keeps
// the server's figures, hence `matched` and `total` alongside the rows.

import { useMemo } from 'react';

// Keys name what the reader looks for, not the field: `execution` is the served percentage and
// `remaining` is what is left.
export type BudgetSortKey =
 | 'name'
 | 'subcategory'
 | 'spent'
 | 'remaining'
 | 'execution';

export type BudgetSortDirection = 'asc' | 'desc';

// Each key's starting direction puts the most useful row first: the biggest spender, the tightest
// remainder (`remaining` ascends so the overspent lead), the fullest budget.
export const DEFAULT_SORT_DIRECTION: Record<
 BudgetSortKey,
 BudgetSortDirection
> = {
 name: 'asc',
 subcategory: 'asc',
 spent: 'desc',
 remaining: 'asc',
 execution: 'desc',
};

export type BudgetQuickFilter = 'all' | 'over';

// Every figure is nullable for one case: the server withholds the totals of a multi-currency set rather
// than adding them at an implicit 1:1. A withheld figure is not a zero and never sorts as one.
type BudgetFilterableRow = {
 actualSpent: number | null;
 remainingBudget: number | null;
 executionPercentage: number | null;
 isOverBudget: boolean | null;
};

type BudgetListFilterInput<Row extends BudgetFilterableRow> = {
 rows: Row[];
 search: string;
 sort: BudgetSortKey;
 // Chosen by the reader, never derived here; DEFAULT_SORT_DIRECTION supplies the starting value per key.
 direction: BudgetSortDirection;
 quickFilter: BudgetQuickFilter;
 // What a search term is matched against: level 1 gives the category name, level 2 the account name
 // and its subcategory. The 'subcategory' sort reads index 1.
 searchableText: (row: Row) => (string | null)[];
 // What a name sort orders by, and the tiebreaker of every other sort.
 sortName: (row: Row) => string;
};

type BudgetListFilterResult<Row> = {
 rows: Row[];
 // What the list shows against what it holds; the caller must say so on screen, since a filtered list
 // that does not announce itself reads as a short one.
 matched: number;
 total: number;
 isFiltered: boolean;
};

// Accent- and case-insensitive: "aseo" finds "Aseo Hogar" and "energia" finds "Energía" (NFD form with
// the combining marks dropped).
const fold = (value: string) =>
 value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .trim();

// A withheld figure sorts last in every direction; comparing it as 0 would rank a category whose total
// could not be computed among the healthy ones.
const compareNullable = (
 a: number | null,
 b: number | null,
 direction: 'asc' | 'desc',
) => {
 if (a === null && b === null) return 0;
 if (a === null) return 1;
 if (b === null) return -1;
 return direction === 'asc' ? a - b : b - a;
};

const compareText = (a: string | null, b: string | null) => {
 if (!a && !b) return 0;
 if (!a) return 1;
 if (!b) return -1;
 return a.localeCompare(b);
};

export function useBudgetListFilter<Row extends BudgetFilterableRow>({
 rows,
 search,
 sort,
 direction,
 quickFilter,
 searchableText,
 sortName,
}: BudgetListFilterInput<Row>): BudgetListFilterResult<Row> {
 return useMemo(() => {
  const term = fold(search);

  const filtered = rows.filter((row) => {
   if (quickFilter === 'over' && row.isOverBudget !== true) return false;
   if (!term) return true;

   return searchableText(row).some(
    (text) => text !== null && fold(text).includes(term),
   );
  });

  // Sorted on a copy: the store's array is shared with other readers and sort mutates in place.
  const sorted = [...filtered].sort((a, b) => {
   let result = 0;

   // Text compares one way and is negated; amounts take the direction inside compareNullable, which
   // checks null first so a withheld figure sorts last in both directions.
   const flip = direction === 'desc' ? -1 : 1;

   switch (sort) {
    case 'spent':
     result = compareNullable(a.actualSpent, b.actualSpent, direction);
     break;
    case 'remaining':
     result = compareNullable(a.remainingBudget, b.remainingBudget, direction);
     break;
    case 'execution':
     result = compareNullable(
      a.executionPercentage,
      b.executionPercentage,
      direction,
     );
     break;
    case 'subcategory':
     result =
      compareText(searchableText(a)[1] ?? null, searchableText(b)[1] ?? null) *
      flip;
     break;
    case 'name':
    default:
     result = compareText(sortName(a), sortName(b)) * flip;
   }

   // The name breaks every tie, always ascending: a direction-following tiebreaker would reorder equal
   // figures for no reason the reader asked for.
   return result !== 0 ? result : compareText(sortName(a), sortName(b));
  });

  return {
   rows: sorted,
   matched: sorted.length,
   total: rows.length,
   isFiltered: term.length > 0 || quickFilter !== 'all',
  };
 }, [rows, search, sort, direction, quickFilter, searchableText, sortName]);
}
