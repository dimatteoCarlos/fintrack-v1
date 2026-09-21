// One page of a server-paged list: page navigation and a page-size selector. It computes
// only the page count from the server's row total; everything else arrives as a prop, so
// it cannot disagree with the list above it. Nothing here knows what a row is.

import './styles/pagination-styles.css';

// A short list and not a free number field: the endpoint caps the size at 100. The first
// size is the default and matches the page's teaser. Not exported, to keep fast refresh.
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

type PaginationProps = {
 page: number;
 pageSize: number;
 // Size of the whole set, not of the current page: it makes "page 2 of 7" possible and
 // tells an empty filter from a last page.
 totalRows: number;
 onPageChange: (page: number) => void;
 onPageSizeChange: (pageSize: number) => void;
 // Plural noun for the row count and the screen reader labels; required, since "1-5 of 43"
 // alone names nothing.
 itemLabel: string;
 // A page is loading: the controls go inert instead of vanishing, so the block keeps its height.
 isBusy?: boolean;
};

export const Pagination = ({
 page,
 pageSize,
 totalRows,
 onPageChange,
 onPageSizeChange,
 itemLabel,
 isBusy = false,
}: PaginationProps) => {
 // At least 1, so an empty set reads as "page 1 of 1" rather than "1 of 0".
 const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));

 const firstRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
 // Bounded by the total, not the page size: the last page is short.
 const lastRow = Math.min(page * pageSize, totalRows);

 return (
  <div className='pagination'>
   {/* role="status" announces a page change; the count is the only text that says the
       list moved. */}
   <p className='pagination__count' role='status'>
    {totalRows === 0
     ? `No ${itemLabel}`
     : `${firstRow}-${lastRow} of ${totalRows} ${itemLabel}`}
   </p>

   <div className='pagination__controls'>
    {/* No size choice when the whole set fits the smallest page: every option
        would show the same rows. */}
    {totalRows > PAGE_SIZE_OPTIONS[0] && (
     <label className='pagination__size'>
      <span className='pagination__sizeLabel'>Rows</span>

      <select
       className='pagination__select'
       value={pageSize}
       disabled={isBusy}
       // The caller must return to page 1: keeping the number could land on page 7 of a
       // list that now has 3, an empty answer that looks like a filter with no matches.
       onChange={(event) => onPageSizeChange(Number(event.target.value))}
       aria-label={`${itemLabel} per page`}
      >
       {PAGE_SIZE_OPTIONS.map((size) => (
        <option key={size} value={size}>
         {size}
        </option>
       ))}
      </select>
     </label>
    )}

    {/* Hidden for a single page: inert arrows around "1 / 1" add nothing to the count.
        pageCount holds while a page loads, so the row keeps its height. */}
    {pageCount > 1 && (
     <div className='pagination__pager'>
      <button
       type='button'
       className='pagination__step'
       onClick={() => onPageChange(page - 1)}
       disabled={isBusy || page <= 1}
       aria-label='Previous page'
      >
       {/* A stroked chevron, not the ‹ glyph, which renders too thin to read at this size. */}
       <svg
        className='pagination__icon'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
       >
        <polyline points='15 18 9 12 15 6' />
       </svg>
      </button>

      <span className='pagination__page'>
       {page} / {pageCount}
      </span>

      <button
       type='button'
       className='pagination__step'
       onClick={() => onPageChange(page + 1)}
       disabled={isBusy || page >= pageCount}
       aria-label='Next page'
      >
       <svg
        className='pagination__icon'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
       >
        <polyline points='9 18 15 12 9 6' />
       </svg>
      </button>
     </div>
    )}
   </div>
  </div>
 );
};
