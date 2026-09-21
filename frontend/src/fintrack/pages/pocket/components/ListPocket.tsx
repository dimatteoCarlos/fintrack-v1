// The pocket board's list: which rows show and in what order, the toolbar that
// narrows them, and the loading, error and empty states. Each row is a PocketCard.
import { useSearchParams } from 'react-router-dom';
import { usePocketBoardStore } from '../../../stores/usePocketBoardStore.ts';
import { NAME_MAX_LENGTHS } from '../../../validations/utils/inputConstraints/nameMaxLengths.ts';
import {
 DEFAULT_SORT_DIRECTION,
 usePocketListFilter,
 type PocketQuickFilter,
 type PocketSortDirection,
 type PocketSortKey,
} from '../hooks/usePocketListFilter.ts';
import PocketCard from './PocketCard.tsx';
import PocketToolbar from './PocketToolbar.tsx';

// Placeholder rows in the loading state: enough to avoid a jump when the real
// rows land, few enough not to imply a count.
const SKELETON_ROWS = 3;

// The bars one placeholder card draws, widest first, so it reads as the card it
// stands in for and not as equal blocks.
const SKELETON_BARS = ['title', 'note', 'bar', 'facts'];

// A URL can carry any value; an unrecognised key would leave the select with no
// matching option, so both fall back to the no-op: arrival order and no filter.
const SORT_KEYS: PocketSortKey[] = ['date', 'name', 'remaining'];
const toSortKey = (value: string | null): PocketSortKey =>
 SORT_KEYS.includes(value as PocketSortKey) ? (value as PocketSortKey) : 'date';

const FILTER_KEYS: PocketQuickFilter[] = [
 'all',
 'completed',
 'aboveTarget',
 'ahead',
 'onTrack',
 'behind',
 'atRisk',
 'overdue',
 'uncovered',
];
const toQuickFilter = (value: string | null): PocketQuickFilter =>
 FILTER_KEYS.includes(value as PocketQuickFilter)
  ? (value as PocketQuickFilter)
  : 'all';

const toSortDirection = (
 value: string | null,
 sort: PocketSortKey,
): PocketSortDirection =>
 value === 'asc' || value === 'desc' ? value : DEFAULT_SORT_DIRECTION[sort];

function ListPocket({ previousRoute }: { previousRoute: string }) {
 // The board is fetched by PocketLayout, which needs the same answer for its
 // header. This reads it; it does not ask for it again.
 const pockets = usePocketBoardStore((state) => state.pockets);
 const isLoading = usePocketBoardStore((state) => state.isLoading);
 // Month of the answer held in memory. While a new month loads it still names
 // the previous one; isLoading is what shows the skeleton instead of stale rows.
 const loadedMonth = usePocketBoardStore((state) => state.loadedMonth);
 const error = usePocketBoardStore((state) => state.error);
 const refreshBoard = usePocketBoardStore((state) => state.refreshBoard);
 const isLoaded = loadedMonth !== null;

 // Toolbar state lives in the URL, not useState: a pocket's detail route is
 // declared beside <Layout/>, so opening one unmounts this list and component
 // state would be lost on the way back.
 const [searchParams, setSearchParams] = useSearchParams();
 const search = (searchParams.get('q') ?? '').slice(
  0,
  NAME_MAX_LENGTHS.pocket_name,
 );
 const sort = toSortKey(searchParams.get('sort'));
 const direction = toSortDirection(searchParams.get('dir'), sort);
 const quickFilter = toQuickFilter(searchParams.get('status'));

 const setListParams = (values: Record<string, string>) => {
  setSearchParams(
   (previous) => {
    const next = new URLSearchParams(previous);
    Object.entries(values).forEach(([key, value]) => {
     if (value) next.set(key, value);
     else next.delete(key);
    });
    return next;
   },
   { replace: true },
  );
 };

 // Read unconditionally, ahead of the state guards below: a hook cannot sit
 // behind an early return. Filtering an empty or stale array while the board
 // is still loading costs nothing — the guards decide what actually renders.
 const {
  rows: visiblePockets,
  matched,
  total,
  isFiltered,
 } = usePocketListFilter({
  rows: pockets,
  search,
  sort,
  direction,
  quickFilter,
 });

 // Three distinct states: a failed request is not an empty board, and neither
 // is a request still in flight.
 if (error) {
  return (
   <article className='list__main__container pocketList'>
    <div className='pocketList__state'>
     <p className='pocketList__stateText'>
      The pocket board could not be loaded.
     </p>

     {/* Shows the served reason held by the store; one sentence for every
         failure is a dead end. */}
     <p className='pocketList__stateDetail'>{error}</p>

     <button
      type='button'
      className='pocketList__retry'
      onClick={() => {
       void refreshBoard();
      }}
     >
      Try again
     </button>
    </div>
   </article>
  );
 }

 if (isLoading || !isLoaded) {
  return (
   <article className='list__main__container pocketList'>
    {Array.from({ length: SKELETON_ROWS }, (_, index) => (
     <div
      className='pocketCard pocketList__skeleton'
      key={`pocket-skeleton-${index}`}
      aria-hidden='true'
     >
      {SKELETON_BARS.map((bar) => (
       <div
        className={`pocketList__skeletonBar pocketList__skeletonBar--${bar}`}
        key={`pocket-skeleton-${index}-${bar}`}
       ></div>
      ))}
     </div>
    ))}
   </article>
  );
 }

 // The hero owns the empty-board sentence; repeating it here would state it twice.
 if (pockets.length === 0) return null;

 return (
  <>
   <PocketToolbar
    search={search}
    onSearchChange={(value) => setListParams({ q: value })}
    sort={sort}
    // Direction is cleared, not carried: each key opens on its own default
    // (DEFAULT_SORT_DIRECTION); carrying it could open Remaining, whose default
    // is descending, sorted ascending.
    onSortChange={(value) =>
     setListParams({ sort: value === 'date' ? '' : value, dir: '' })
    }
    direction={direction}
    onDirectionChange={(value) => setListParams({ dir: value })}
    quickFilter={quickFilter}
    onQuickFilterChange={(value) =>
     setListParams({ status: value === 'all' ? '' : value })
    }
    matched={matched}
    total={total}
    isFiltered={isFiltered}
   />

   <article className='list__main__container pocketList'>
    {visiblePockets.map((pocket) => (
     <PocketCard
      pocket={pocket}
      previousRoute={previousRoute}
      key={`pocket-${pocket.pocketId}`}
     />
    ))}
   </article>
  </>
 );
}

export default ListPocket;
