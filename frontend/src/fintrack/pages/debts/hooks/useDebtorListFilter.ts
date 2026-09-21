// In-memory search, sort and debtor/lender filter for the debtor list. It only changes which rows are
// listed and never touches a header figure.

import { useMemo } from 'react';
import { DebtorListType } from '../../../types/responseApiTypes';

export type DebtorSortKey = 'balance' | 'name';
export type DebtorSortDirection = 'asc' | 'desc';

// Balance leads with the largest magnitude; name leads A to Z.
export const DEFAULT_SORT_DIRECTION: Record<DebtorSortKey, DebtorSortDirection> = {
 balance: 'desc',
 name: 'asc',
};

export type DebtorQuickFilter = 'all' | 'debtor' | 'lender';

type DebtorListFilterInput = {
 rows: DebtorListType[];
 search: string;
 sort: DebtorSortKey;
 direction: DebtorSortDirection;
 quickFilter: DebtorQuickFilter;
};

type DebtorListFilterResult = {
 rows: DebtorListType[];
 matched: number;
 total: number;
 isFiltered: boolean;
};

// Accent- and case-insensitive, the same fold budget's and pocket's search use.
const fold = (value: string) =>
 value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .trim();

// Same test the row runs to choose its word (ListOfDebtors.tsx), shared so the two cannot drift. Reads
// total_debt_balance's sign, not debt_payable + debt_receivable: both are positive magnitudes, so their
// sum is a net only because one of them is zero per row.
const transactionTypeOf = (row: DebtorListType): 'debtor' | 'lender' =>
 row.total_debt_balance < 0 ? 'lender' : 'debtor';

export function useDebtorListFilter({
 rows,
 search,
 sort,
 direction,
 quickFilter,
}: DebtorListFilterInput): DebtorListFilterResult {
 return useMemo(() => {
  const term = fold(search);

  const filtered = rows.filter((row) => {
   if (quickFilter !== 'all' && transactionTypeOf(row) !== quickFilter) {
    return false;
   }
   if (!term) return true;

   return fold(row.account_name).includes(term);
  });

  // Sorted on a copy: the input may be the fetch hook's own state and sort mutates in place.
  const sorted = [...filtered].sort((a, b) => {
   const flip = direction === 'desc' ? -1 : 1;

   const result =
    sort === 'name'
     ? a.account_name.localeCompare(b.account_name) * flip
     : (Math.abs(a.total_debt_balance) - Math.abs(b.total_debt_balance)) * flip;

   // The name breaks every tie, always ascending: debtors owing the same amount would otherwise
   // reorder between renders for no reason the reader asked for.
   return result !== 0 ? result : a.account_name.localeCompare(b.account_name);
  });

  return {
   rows: sorted,
   matched: sorted.length,
   total: rows.length,
   isFiltered: term.length > 0 || quickFilter !== 'all',
  };
 }, [rows, search, sort, direction, quickFilter]);
}
