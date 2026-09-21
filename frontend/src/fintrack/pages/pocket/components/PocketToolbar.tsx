// Search, sort and quick-filter controls for the pocket list. Values arrive as props so the caller can
// back them with the URL: opening a pocket's detail unmounts this list. Filtering changes what is
// listed, never what is reported.

import ChevronDownSvg from '../../../../assets/pocketSvg/ChevronDownSvg.svg?react';
import ClearSvg from '../../../../assets/pocketSvg/ClearSvg.svg?react';
import SearchSvg from '../../../../assets/pocketSvg/SearchSvg.svg?react';
import SortDirectionSvg from '../../../../assets/pocketSvg/SortDirectionSvg.svg?react';
import { POCKET_STATUS_WORD } from '../../../helpers/pocketStatus';
import type {
 PocketQuickFilter,
 PocketSortDirection,
 PocketSortKey,
} from '../hooks/usePocketListFilter';
import '../styles/pocketToolbar.css';

const SORT_OPTIONS: { value: PocketSortKey; label: string }[] = [
 { value: 'date', label: 'Deadline' },
 { value: 'name', label: 'Name' },
 { value: 'remaining', label: 'Still to allocate' },
];

// 'All' first, then the seven levels in POCKET_STATUS_WORD order (same as the server's POCKET_LEVELS);
// the orthogonal value goes last because it is not an eighth level.
const FILTER_OPTIONS: { value: PocketQuickFilter; label: string }[] = [
 { value: 'all', label: 'All' },
 { value: 'completed', label: POCKET_STATUS_WORD.completed },
 // The only option not using its level's own word: in this ordered list "Above"
 // is clear, but on a card beside an amount it would not say above what.
 { value: 'aboveTarget', label: 'Above' },
 { value: 'ahead', label: POCKET_STATUS_WORD.ahead },
 { value: 'onTrack', label: POCKET_STATUS_WORD.onTrack },
 { value: 'behind', label: POCKET_STATUS_WORD.behind },
 { value: 'atRisk', label: POCKET_STATUS_WORD.atRisk },
 { value: 'overdue', label: POCKET_STATUS_WORD.overdue },
 // One word, not "Funding not covered": a select is as wide as its longest
 // option, so a longer label would widen the whole strip. Same word as the
 // hero's coverage row.
 { value: 'uncovered', label: 'Uncovered' },
];

const SEARCH_MAX_LENGTH = 50;

type PocketToolbarProps = {
 search: string;
 onSearchChange: (value: string) => void;
 sort: PocketSortKey;
 onSortChange: (value: PocketSortKey) => void;
 direction: PocketSortDirection;
 onDirectionChange: (value: PocketSortDirection) => void;
 quickFilter: PocketQuickFilter;
 onQuickFilterChange: (value: PocketQuickFilter) => void;
 matched: number;
 total: number;
 isFiltered: boolean;
};

function PocketToolbar({
 search,
 onSearchChange,
 sort,
 onSortChange,
 direction,
 onDirectionChange,
 quickFilter,
 onQuickFilterChange,
 matched,
 total,
 isFiltered,
}: PocketToolbarProps) {
 // Filtered down to nothing: a message, never a blank list, so the reader knows
 // the term or filter emptied the board and not a lack of pockets.
 const isEmpty = isFiltered && matched === 0;
 const isSubset = isFiltered && matched > 0;

 return (
  <div className='pocketToolbar'>
   <div className='pocketToolbar__fields'>
    <div className='pocketToolbar__query'>
     <SearchSvg className='pocketToolbar__icon' />

     <input
      type='search'
      className='pocketToolbar__search'
      value={search}
      onChange={(event) => onSearchChange(event.target.value)}
      placeholder='Search'
      aria-label='Search pockets'
      autoComplete='off'
      maxLength={SEARCH_MAX_LENGTH}
     />

     {/* Present on every term, not only once the result has gone blank: a
         term that still matches rows has to be undoable too. */}
     {search && (
      <button
       type='button'
       className='pocketToolbar__reset'
       onClick={() => onSearchChange('')}
       aria-label='Clear search'
      >
       <ClearSvg />
      </button>
     )}
    </div>

    <div className='pocketToolbar__sort'>
     <div className='pocketToolbar__selectBox'>
      <select
       className='pocketToolbar__select'
       value={sort}
       onChange={(event) => onSortChange(event.target.value as PocketSortKey)}
       aria-label='Sort by'
      >
       {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
         {option.label}
        </option>
       ))}
      </select>

      <ChevronDownSvg className='pocketToolbar__icon pocketToolbar__icon--trailing' />
     </div>

     {/* One toggle, not two arrows: the select's chevron already means "this
         opens", and direction is a separate question. */}
     <button
      type='button'
      className={`pocketToolbar__direction${
       direction === 'asc' ? ' is-ascending' : ''
      }`}
      onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
      aria-label={
       direction === 'asc'
        ? 'Sorted ascending, switch to descending'
        : 'Sorted descending, switch to ascending'
      }
     >
      <SortDirectionSvg />
     </button>
    </div>

    <div className='pocketToolbar__selectBox pocketToolbar__selectBox--filter'>
     <select
      className='pocketToolbar__select'
      value={quickFilter}
      onChange={(event) =>
       onQuickFilterChange(event.target.value as PocketQuickFilter)
      }
      aria-label='Filter'
     >
      {FILTER_OPTIONS.map((option) => (
       <option key={option.value} value={option.value}>
        {option.label}
       </option>
      ))}
     </select>

     <ChevronDownSvg className='pocketToolbar__icon pocketToolbar__icon--trailing' />
    </div>

   </div>

   {/* Collapses to nothing while there is no count to report, so the bar is
       one line whenever the reader is not narrowing the board. */}
   <p className='pocketToolbar__status' role='status'>
    {isEmpty && (
     <span className='pocketToolbar__message'>
      {search ? `No pockets match “${search}”` : 'No pockets match this filter'}
     </span>
    )}

    {isSubset && (
     <span className='pocketToolbar__message'>
      Showing {matched} of {total}
     </span>
    )}
   </p>
  </div>
 );
}

export default PocketToolbar;
