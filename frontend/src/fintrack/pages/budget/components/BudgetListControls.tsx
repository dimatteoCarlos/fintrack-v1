// Search, sort and over-budget controls for a budget list. Stateless: every value arrives as a prop so
// the caller can keep it in the URL, and filtering never changes the header's server totals.

import React, { useEffect, useRef, useState } from 'react';

// Imported with '?react' so the SVG accepts a className (a bare .svg import is typed `string`). The files
// carry no width or height: the stylesheet sizes them off the control's font size.
import ChevronDownSvg from '../../../../assets/budgetListControlsSvg/ChevronDownSvg.svg?react';
import ClearSvg from '../../../../assets/budgetListControlsSvg/ClearSvg.svg?react';
import OverBudgetSvg from '../../../../assets/budgetListControlsSvg/OverBudgetSvg.svg?react';
import SearchSvg from '../../../../assets/budgetListControlsSvg/SearchSvg.svg?react';
import SortDirectionSvg from '../../../../assets/budgetListControlsSvg/SortDirectionSvg.svg?react';
import SortSvg from '../../../../assets/budgetListControlsSvg/SortSvg.svg?react';

import type {
 BudgetQuickFilter,
 BudgetSortDirection,
 BudgetSortKey,
} from '../hooks/useBudgetListFilter';
import { useClickOutside } from '../../../editionAndDeletion/hooks/useClickOutside';
import '../styles/budgetListControls.css';

// Labels belong to the caller: level 1 has no subcategory to order by and level 2 does.
export type BudgetSortOption = {
 value: BudgetSortKey;
 label: string;
};

// `unavailable` covers a failed request and an empty month: there is nothing to search either way.
export type BudgetListState = 'ready' | 'loading' | 'unavailable';

// Screen-reader and tooltip text, since the toggle has no room for it on screen. Not a caller prop:
// both levels filter on the same served isOverBudget, so no level could reword it.
const OVER_FILTER_LABEL = 'Over budget';

// Names the group behind the trigger; a label copied from one option would hide the other.
const MENU_LABEL = 'Budget attention';

// Matches the heading of the variance screen, where the term "variance" (spent against budget, not the
// statistical quantity) is explained in the caption instead of in this menu entry.
const VARIANCE_LABEL = 'Spent vs budget';

type BudgetListControlsProps = {
 search: string;
 onSearchChange: (value: string) => void;
 // Accessible name of the search field; the placeholder stays the single word "Search".
 searchLabel: string;
 // Longest name this level can hold: level 1 searches categories, level 2 accounts.
 searchMaxLength: number;
 sort: BudgetSortKey;
 onSortChange: (value: BudgetSortKey) => void;
 sortOptions: BudgetSortOption[];
 direction: BudgetSortDirection;
 onDirectionChange: (value: BudgetSortDirection) => void;
 quickFilter: BudgetQuickFilter;
 onQuickFilterChange: (value: BudgetQuickFilter) => void;
 matched: number;
 total: number;
 isFiltered: boolean;
 state?: BudgetListState;
 // Absent at level 2: the trigger then stays a one-tap toggle instead of a single-entry menu.
 onOpenVariance?: () => void;
};

function BudgetListControls({
 search,
 onSearchChange,
 searchLabel,
 searchMaxLength,
 sort,
 onSortChange,
 sortOptions,
 direction,
 onDirectionChange,
 quickFilter,
 onQuickFilterChange,
 matched,
 total,
 isFiltered,
 state = 'ready',
 onOpenVariance,
}: BudgetListControlsProps) {
 const isReady = state === 'ready';
 const isLoading = state === 'loading';

 // Declared above the early return below: a hook called after it would run on some renders and not others.
 const [isMenuOpen, setIsMenuOpen] = useState(false);
 const menuRef = useRef<HTMLDivElement>(null);
 const hasMenu = onOpenVariance !== undefined;

 useClickOutside(menuRef, () => setIsMenuOpen(false), isMenuOpen);

 // Escape closes the menu, as in the export menus; click-outside alone strands keyboard users.
 useEffect(() => {
  if (!isMenuOpen) return;

  const onKeyDown = (event: KeyboardEvent) => {
   if (event.key === 'Escape') setIsMenuOpen(false);
  };

  document.addEventListener('keydown', onKeyDown);

  return () => document.removeEventListener('keydown', onKeyDown);
 }, [isMenuOpen]);

 // Nothing to filter: render nothing rather than disabled controls, which would still claim space.
 if (state === 'unavailable' || (isReady && total === 0)) return null;

 // Filtered to nothing: a message, never a blank area, so the reader knows the term emptied the list.
 const isEmpty = isReady && isFiltered && matched === 0;
 const isSubset = isReady && isFiltered && matched > 0;

 // A native <select> because it takes `value`, so a page opened on ?sort=spent shows a matching control
 // (the shared DropDownSelection is uncontrolled). It yields a string; the cast holds because every
 // option is a BudgetSortKey.
 const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) =>
  onSortChange(event.target.value as BudgetSortKey);

 return (
  <div className='budgetListControls'>
   {/* Anchors the menu. It cannot be the strip: .budgetListControls__fields has
       overflow: hidden, which would clip an absolutely positioned child. */}
   <div className='budgetListControls__bar' ref={menuRef}>
    <div className='budgetListControls__fields'>
     <div className='budgetListControls__query'>
      <SearchSvg className='budgetListControls__icon' />

      <input
       type='search'
       className='budgetListControls__search'
       value={search}
       onChange={(event) => onSearchChange(event.target.value)}
       // One word on screen (a longer one is cut mid-word); the caller's full phrase is the aria-label.
       placeholder='Search'
       aria-label={searchLabel}
       autoComplete='off'
       maxLength={searchMaxLength}
       disabled={isLoading}
      />

      {/* Shown for any non-empty term, so a term that matched rows can also be cleared. */}
      {search && !isLoading && (
       <button
        type='button'
        className='budgetListControls__reset'
        onClick={() => onSearchChange('')}
        aria-label='Clear search'
       >
        <ClearSvg />
       </button>
      )}
     </div>

     <div className='budgetListControls__sort'>
      <div className='budgetListControls__selectBox'>
       {/* An icon instead of a text label, which would cost the search field width;
           the select's aria-label is its only name. */}
       <SortSvg className='budgetListControls__icon' />

       <select
        className='budgetListControls__select'
        value={sort}
        onChange={handleSortChange}
        aria-label='Sort by'
        disabled={isLoading}
       >
        {sortOptions.map((option) => (
         <option key={option.value} value={option.value}>
          {option.label}
         </option>
        ))}
       </select>

       {/* An SVG, not a ▾ character (an OS fallback font would not match the icons'
           stroke weight). Inside this box so it stays over the select, not the direction button. */}
       <ChevronDownSvg className='budgetListControls__icon budgetListControls__icon--trailing' />
      </div>

      {/* One toggle whose arrow shows the current direction; two arrows beside the
          select's chevron would be three similar glyphs with two meanings. */}
      <button
       type='button'
       className={`budgetListControls__direction${
        direction === 'asc' ? ' is-ascending' : ''
       }`}
       onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
       aria-label={
        direction === 'asc'
         ? 'Sorted ascending, switch to descending'
         : 'Sorted descending, switch to ascending'
       }
       disabled={isLoading}
      >
       <SortDirectionSvg />
      </button>
     </div>

     {/* Menu trigger when the variance screen is offered, else a toggle (aria-haspopup/expanded vs
         aria-pressed, never both); is-active tracks the filter, not the menu. Outside the
         <p role='status'> below, since a control in a live region is re-announced on each count change. */}
     {hasMenu ? (
      <button
       type='button'
       className={`budgetListControls__filter${
        quickFilter === 'over' ? ' is-active' : ''
       }`}
       onClick={() => setIsMenuOpen((open) => !open)}
       aria-haspopup='menu'
       aria-expanded={isMenuOpen}
       aria-label={MENU_LABEL}
       title={MENU_LABEL}
       disabled={isLoading}
      >
       <OverBudgetSvg />
      </button>
     ) : (
      <button
       type='button'
       className={`budgetListControls__filter${
        quickFilter === 'over' ? ' is-active' : ''
       }`}
       onClick={() =>
        onQuickFilterChange(quickFilter === 'over' ? 'all' : 'over')
       }
       aria-pressed={quickFilter === 'over'}
       aria-label={OVER_FILTER_LABEL}
       title={OVER_FILTER_LABEL}
       disabled={isLoading}
      >
       <OverBudgetSvg />
      </button>
     )}
    </div>

    {/* The filter entry is a menuitemcheckbox (its checked state is announced); the
        variance entry leaves for another screen and is a plain menuitem. Both close
        the menu, which would otherwise cover the rows the filter just changed. */}
    {hasMenu && isMenuOpen && (
     <ul
      className='budgetListControls__menu'
      role='menu'
      aria-label={MENU_LABEL}
     >
      <li role='none'>
       <button
        type='button'
        role='menuitemcheckbox'
        aria-checked={quickFilter === 'over'}
        className='budgetListControls__menuItem'
        onClick={() => {
         onQuickFilterChange(quickFilter === 'over' ? 'all' : 'over');
         setIsMenuOpen(false);
        }}
       >
        {OVER_FILTER_LABEL}
       </button>
      </li>

      <li role='none'>
       <button
        type='button'
        role='menuitem'
        className='budgetListControls__menuItem'
        onClick={() => {
         setIsMenuOpen(false);
         onOpenVariance?.();
        }}
       >
        {VARIANCE_LABEL}
       </button>
      </li>
     </ul>
    )}
   </div>

   {/* Collapses to nothing while empty, so the bar stays one line when not filtering. */}
   <p className='budgetListControls__status' role='status'>
    {isEmpty && (
     <span className='budgetListControls__message'>
      {search ? `No results for “${search}”` : 'No results'}
     </span>
    )}

    {isSubset && (
     <span className='budgetListControls__message'>
      Showing {matched} of {total}
     </span>
    )}
   </p>
  </div>
 );
}

export default BudgetListControls;
