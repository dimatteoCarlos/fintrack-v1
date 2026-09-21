// In-memory filter and sort over the pockets in the store; the hero keeps the server's own counts.
// The seven level filters mirror the server's levelCounts and take their words from POCKET_STATUS_WORD;
// 'uncovered' is orthogonal: a pocket can be uncovered at ANY level.

import { useMemo } from 'react';
import { PocketStatus } from '../../../types/pocketTypes';
import { PocketStatusLevel } from '../../../helpers/pocketStatus';

export type PocketSortKey = 'date' | 'name' | 'remaining';
export type PocketSortDirection = 'asc' | 'desc';

// Each key's starting direction: date and name lead with the earliest/first
// entry, remaining with the pocket furthest from its target.
export const DEFAULT_SORT_DIRECTION: Record<PocketSortKey, PocketSortDirection> = {
 date: 'asc',
 name: 'asc',
 remaining: 'desc',
};

// One value beside the seven levels, and it is orthogonal to all of them: a
// pocket can be completed and still uncovered, so this is not an eighth level.
// 'all' is the absence of a filter rather than a value the rows carry.
export type PocketQuickFilter = PocketStatusLevel | 'all' | 'uncovered';

type PocketListFilterInput = {
 rows: PocketStatus[];
 search: string;
 sort: PocketSortKey;
 direction: PocketSortDirection;
 quickFilter: PocketQuickFilter;
};

type PocketListFilterResult = {
 rows: PocketStatus[];
 matched: number;
 total: number;
 isFiltered: boolean;
};

// Accent- and case-insensitive, the same fold budget's search uses: "viajes"
// must find "Viajés".
const fold = (value: string) =>
 value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .trim();

const passesQuickFilter = (
 pocket: PocketStatus,
 quickFilter: PocketQuickFilter,
): boolean => {
 if (quickFilter === 'all') return true;
 if (quickFilter === 'uncovered') return pocket.uncovered;

 // Served, never derived: the server decides the level once, so all seven go
 // through this one comparison.
 return pocket.level === quickFilter;
};

export function usePocketListFilter({
 rows,
 search,
 sort,
 direction,
 quickFilter,
}: PocketListFilterInput): PocketListFilterResult {
 return useMemo(() => {
  const term = fold(search);

  const filtered = rows.filter((pocket) => {
   if (!passesQuickFilter(pocket, quickFilter)) return false;
   if (!term) return true;

   return fold(pocket.name).includes(term);
  });

  // Sorted on a copy: `rows` is the store's own array, shared with the hero
  // that tallies it, and Array.prototype.sort mutates in place.
  const sorted = [...filtered].sort((a, b) => {
   const flip = direction === 'desc' ? -1 : 1;

   let result: number;

   switch (sort) {
    case 'name':
     result = a.name.localeCompare(b.name) * flip;
     break;
    case 'remaining':
     result = (a.remaining - b.remaining) * flip;
     break;
    case 'date':
    default:
     // daysRemaining, not desiredDate: already a number, so there is no second
     // date parse to keep in step with formatCalendarDate.
     result = (a.daysRemaining - b.daysRemaining) * flip;
   }

   // The name breaks every tie, always ascending, so rows sharing a figure do
   // not reorder when the direction flips.
   return result !== 0 ? result : a.name.localeCompare(b.name);
  });

  return {
   rows: sorted,
   matched: sorted.length,
   total: rows.length,
   isFiltered: term.length > 0 || quickFilter !== 'all',
  };
 }, [rows, search, sort, direction, quickFilter]);
}
