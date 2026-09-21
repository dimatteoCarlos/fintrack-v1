// Search, sort and filter controls for the debtor list. Stateless: values arrive as props and the caller
// keeps them in the URL, since opening a debtor's detail unmounts this list. States no figure of its own.

import ChevronDownSvg from '../../../../assets/debtsSvg/ChevronDownSvg.svg?react';
import ClearSvg from '../../../../assets/debtsSvg/ClearSvg.svg?react';
import SearchSvg from '../../../../assets/debtsSvg/SearchSvg.svg?react';
import SortDirectionSvg from '../../../../assets/debtsSvg/SortDirectionSvg.svg?react';
import type {
 DebtorQuickFilter,
 DebtorSortDirection,
 DebtorSortKey,
} from '../hooks/useDebtorListFilter';
import '../styles/debtsToolbar.css';

const SORT_OPTIONS: { value: DebtorSortKey; label: string }[] = [
 { value: 'balance', label: 'Balance' },
 { value: 'name', label: 'Name' },
];

// A 'lender' row lent net money to the owner (the hero's "you owe"); a 'debtor' row owes the owner net
// money (the hero's "you're owed"). Labels reuse the hero's wording so the control shows no word absent
// from the rest of the screen.
const FILTER_OPTIONS: { value: DebtorQuickFilter; label: string }[] = [
 { value: 'all', label: 'All' },
 { value: 'debtor', label: "You're owed" },
 { value: 'lender', label: 'You owe' },
];

const SEARCH_MAX_LENGTH = 28;

type DebtsToolbarProps = {
 search: string;
 onSearchChange: (value: string) => void;
 sort: DebtorSortKey;
 onSortChange: (value: DebtorSortKey) => void;
 direction: DebtorSortDirection;
 onDirectionChange: (value: DebtorSortDirection) => void;
 quickFilter: DebtorQuickFilter;
 onQuickFilterChange: (value: DebtorQuickFilter) => void;
 matched: number;
 total: number;
 isFiltered: boolean;
};

function DebtsToolbar({
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
}: DebtsToolbarProps) {
 const isEmpty = isFiltered && matched === 0;
 const isSubset = isFiltered && matched > 0;

 return (
  <div className='debtsToolbar'>
   <div className='debtsToolbar__fields'>
    <div className='debtsToolbar__query'>
     <SearchSvg className='debtsToolbar__icon' />

     <input
      type='search'
      className='debtsToolbar__search'
      value={search}
      onChange={(event) => onSearchChange(event.target.value)}
      placeholder='Search'
      aria-label='Search debtors'
      autoComplete='off'
      maxLength={SEARCH_MAX_LENGTH}
     />

     {search && (
      <button
       type='button'
       className='debtsToolbar__reset'
       onClick={() => onSearchChange('')}
       aria-label='Clear search'
      >
       <ClearSvg />
      </button>
     )}
    </div>

    <div className='debtsToolbar__sort'>
     <div className='debtsToolbar__selectBox'>
      <select
       className='debtsToolbar__select'
       value={sort}
       onChange={(event) => onSortChange(event.target.value as DebtorSortKey)}
       aria-label='Sort by'
      >
       {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
         {option.label}
        </option>
       ))}
      </select>

      <ChevronDownSvg className='debtsToolbar__icon debtsToolbar__icon--trailing' />
     </div>

     <button
      type='button'
      className={`debtsToolbar__direction${
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

    <div className='debtsToolbar__selectBox debtsToolbar__selectBox--filter'>
     <select
      className='debtsToolbar__select'
      value={quickFilter}
      onChange={(event) =>
       onQuickFilterChange(event.target.value as DebtorQuickFilter)
      }
      aria-label='Filter'
     >
      {FILTER_OPTIONS.map((option) => (
       <option key={option.value} value={option.value}>
        {option.label}
       </option>
      ))}
     </select>

     <ChevronDownSvg className='debtsToolbar__icon debtsToolbar__icon--trailing' />
    </div>
   </div>

   <p className='debtsToolbar__status' role='status'>
    {isEmpty && (
     <span className='debtsToolbar__message'>
      {search ? `No debtors match “${search}”` : 'No debtors match this filter'}
     </span>
    )}

    {isSubset && (
     <span className='debtsToolbar__message'>
      Showing {matched} of {total}
     </span>
    )}
   </p>
  </div>
 );
}

export default DebtsToolbar;
