// Level-1 activity block: every movement over a chosen period, with its own search, filter and pager.

import { useEffect, useMemo, useRef, useState } from 'react';

import ChevronDownSvg from '../../../../assets/debtsSvg/ChevronDownSvg.svg?react';
import ClearSvg from '../../../../assets/debtsSvg/ClearSvg.svg?react';
import SearchSvg from '../../../../assets/debtsSvg/SearchSvg.svg?react';

import { notifyError } from '../../../../auth/auth_utils/notification';
import { downloadMovementsExport, ExportFormat } from '../../../api/exportApi';
import { useClickOutside } from '../../../editionAndDeletion/hooks/useClickOutside';
import { formatDateToDDMMYYYY } from '../../../helpers/functions';
import { Pagination } from '../../../general_components/pagination/Pagination';
import { useOverviewStore } from '../../../stores/useOverviewStore';
import {
 OVERVIEW_ACTIVITY_MOVEMENT_TYPES,
 OverviewActivityMovementType,
} from '../../../types/overviewTypes';
import { useOverviewActivity } from '../hooks/useOverviewActivity';
import LastMovements, { LastMovementType } from './LastMovements';
import PanelState from './PanelState';

import '../styles/recentActivity-styles.css';

// Matches the endpoint's ceiling (80 in overviewValidators.js); a longer term answers 400.
const SEARCH_MAX_LENGTH = 80;

// Wire values mapped to reader-facing labels: 'pnl' and 'account-opening' are
// identifiers, not what a person calls the thing.
const MOVEMENT_LABELS: Record<OverviewActivityMovementType, string> = {
 expense: 'Expenses',
 income: 'Income',
 investment: 'Investments',
 debt: 'Debt',
 pocket: 'Pockets',
 transfer: 'Transfers',
 receive: 'Received',
 'account-opening': 'Account openings',
 pnl: 'Realised results',
 'account-closure': 'Account closures',
 'balance-reversal': 'Balance reversals',
};

// 'month' is the default because the page is cut by month; opening on the whole
// history put old movements under figures that cover thirty days.
type PeriodKey = 'all' | 'month' | 'quarter' | 'year';

const DEFAULT_PERIOD: PeriodKey = 'month';

const PERIOD_LABELS: Record<PeriodKey, string> = {
 all: 'All time',
 month: 'This month',
 quarter: 'Last 3 months',
 year: 'Last 12 months',
};

// 'YYYY-MM-01' minus n months, as the endpoint's 'YYYY-MM'. Built from the
// parts, not Date: 'YYYY-MM-01' parses as UTC midnight, the previous month west
// of Greenwich.
const monthsBefore = (month: string, count: number) => {
 const [year, monthNumber] = month.split('-').map(Number);
 const zeroBased = year * 12 + (monthNumber - 1) - count;

 return `${Math.floor(zeroBased / 12)}-${String((zeroBased % 12) + 1).padStart(2, '0')}`;
};

// Inclusive 'YYYY-MM' bounds of a period. currentMonth is the server's month, not the browser
// clock's (timezones can disagree); never null because the list mounts only once it has arrived.
const periodBounds = (period: PeriodKey, currentMonth: string) => {
 if (period === 'all') return { from: null, to: null };

 const to = currentMonth.slice(0, 7);
 const back = period === 'month' ? 0 : period === 'quarter' ? 2 : 11;

 return { from: monthsBefore(currentMonth, back), to };
};

// Mounts only once the month is known (it arrives with the page payload) so the block makes one request;
// opening unbounded and narrowing later would fetch twice and flash the whole history.
function RecentActivity() {
 const currentMonth = useOverviewStore((state) => state.currentMonth);
 const pageError = useOverviewStore((state) => state.error);
 const refreshOverview = useOverviewStore((state) => state.refreshOverview);

 if (!currentMonth) {
  return (
   <article className='recentActivity ruledSection'>
    <PanelState
     title='Recent activity'
     subject='The activity list'
     isLoading={pageError === null}
     error={pageError}
     onRetry={refreshOverview}
    />
   </article>
  );
 }

 return <ActivityList currentMonth={currentMonth} />;
}

// Composes LastMovements (title, subtitle and list) instead of a second renderer
// for one row shape; this adds the controls above it and the pager below it.
function ActivityList({ currentMonth }: { currentMonth: string }) {
 const { query, data, isLoading, error, narrow, goToPage, refetch } =
  useOverviewActivity(periodBounds(DEFAULT_PERIOD, currentMonth));

 // Export is a side action on the active query, not a second fetch: it never
 // touches `query` or the list's loading state, so rows do not move during a download.
 const [isExporting, setIsExporting] = useState(false);
 const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
 const exportRef = useRef<HTMLDivElement>(null);

 useClickOutside(exportRef, () => setIsExportMenuOpen(false), isExportMenuOpen);

 // On the document, not the menu, so Escape works from the moment the menu paints.
 useEffect(() => {
  if (!isExportMenuOpen) return;

  const handleKeyDown = (event: KeyboardEvent) => {
   if (event.key === 'Escape') setIsExportMenuOpen(false);
  };

  document.addEventListener('keydown', handleKeyDown);

  return () => document.removeEventListener('keydown', handleKeyDown);
 }, [isExportMenuOpen]);

 async function handleExport(format: ExportFormat) {
  setIsExporting(true);

  try {
   await downloadMovementsExport({
    search: query.search || undefined,
    movementType: query.movementType === 'all' ? undefined : query.movementType,
    from: query.from,
    to: query.to,
    format,
   });
  } catch (cause) {
   notifyError(cause instanceof Error ? cause.message : 'The export could not be completed.');
  } finally {
   setIsExporting(false);
  }
 }

 // Derived from the bounds, not held as second state, so the select and the
 // request cannot disagree.
 const period: PeriodKey = useMemo(() => {
  if (!query.from) return 'all';
  if (query.from === query.to) return 'month';

  return query.from === periodBounds('quarter', currentMonth).from
   ? 'quarter'
   : 'year';
 }, [query.from, query.to, currentMonth]);

 const rows: LastMovementType[] | null = useMemo(
  () =>
   data
    ? data.transactions.rows.map((row) => ({
       // Closed accounts are marked the way the level-2 lists mark them, and the
       // date names when, not merely that.
       accountName:
        row.account_name === null ? 'closed account' : row.account_name,
       closedLabel:
        row.account_name !== null && row.account_is_closed
         ? `(closed on ${formatDateToDDMMYYYY(row.account_closed_at)})`
         : null,
       record: row.amount,
       description: row.description,
       note: row.note,
       movementType: row.movement_type_name,
       date: row.transaction_actual_date,
       currency: row.currency_code as LastMovementType['currency'],
       transactionId: row.transaction_id,
      }))
    : null,
  [data],
 );

 // What the list is bounded by, in the reader's terms; no fixed row count is
 // named because the page size is the reader's choice.
 const subtitle = `${PERIOD_LABELS[period]}${
  query.movementType === 'all' ? '' : ` · ${MOVEMENT_LABELS[query.movementType]}`
 }`;

 // PanelState and LastMovements each draw the heading, so the block always has one title.
 const isFirstLoad = isLoading && data === null;
 const showPanel = isFirstLoad || error !== null;

 // Filters go through request parameters so the count covers the whole set, not one page. Controls sit in
 // the list's header slot (above the article they read as the previous block's bottom) and are hidden
 // while the panel shows the first load or an error.
 const controls = (
   <div className='recentActivity__controls'>
    <div className='recentActivity__query'>
     <SearchSvg className='recentActivity__icon' />

     <input
      type='search'
      className='recentActivity__search'
      value={query.search}
      onChange={(event) => narrow({ search: event.target.value })}
      placeholder='Search movements'
      aria-label='Search movements'
      autoComplete='off'
      maxLength={SEARCH_MAX_LENGTH}
     />

     {query.search && (
      <button
       type='button'
       className='recentActivity__reset'
       onClick={() => narrow({ search: '' })}
       aria-label='Clear search'
      >
       <ClearSvg />
      </button>
     )}
    </div>

    <div className='recentActivity__selectBox'>
     <select
      className='recentActivity__select'
      value={query.movementType}
      onChange={(event) =>
       narrow({
        movementType: event.target.value as OverviewActivityMovementType | 'all',
       })
      }
      aria-label='Filter by kind of movement'
     >
      <option value='all'>All movements</option>

      {OVERVIEW_ACTIVITY_MOVEMENT_TYPES.map((value) => (
       <option key={value} value={value}>
        {MOVEMENT_LABELS[value]}
       </option>
      ))}
     </select>

     <ChevronDownSvg className='recentActivity__icon recentActivity__icon--trailing' />
    </div>

    <div className='recentActivity__selectBox'>
     <select
      className='recentActivity__select'
      value={period}
      onChange={(event) =>
       narrow(periodBounds(event.target.value as PeriodKey, currentMonth))
      }
      aria-label='Period'
     >
      {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((value) => (
       <option key={value} value={value}>
        {PERIOD_LABELS[value]}
       </option>
      ))}
     </select>

     <ChevronDownSvg className='recentActivity__icon recentActivity__icon--trailing' />
    </div>
   </div>
 );

 // Beside the title, not in the bordered controls row: an export acts on the
 // whole list without narrowing it, and a fourth segment collapsed the search field.
 const exportControl = (
   <div className='recentActivity__export' ref={exportRef}>
    <button
     type='button'
     className='recentActivity__exportTrigger'
     onClick={() => setIsExportMenuOpen((open) => !open)}
     disabled={isExporting}
     aria-haspopup='true'
     aria-expanded={isExportMenuOpen}
    >
     <span className='recentActivity__exportLabel'>
      {isExporting ? 'Exporting…' : 'Export'}
     </span>

     <ChevronDownSvg className='recentActivity__icon recentActivity__icon--trailing' />
    </button>

    {isExportMenuOpen && (
     <div className='recentActivity__exportMenu' role='menu'>
      <button
       type='button'
       className='recentActivity__exportOption'
       role='menuitem'
       onClick={() => {
        setIsExportMenuOpen(false);
        handleExport('csv');
       }}
      >
       CSV
      </button>

      <button
       type='button'
       className='recentActivity__exportOption'
       role='menuitem'
       onClick={() => {
        setIsExportMenuOpen(false);
        handleExport('xlsx');
       }}
      >
       XLSX
      </button>
     </div>
    )}
   </div>
 );

 return (
  <article className='recentActivity ruledSection'>
   {/* Skeleton and error-with-retry belong to PanelState; empty is ListContent's. The skeleton shows only
       for the first answer: later page or term changes keep the rows and mark the pager busy. */}
   {showPanel ? (
    <PanelState
     title='Recent activity'
     subject='The activity list'
     isLoading={isFirstLoad}
     error={error}
     onRetry={refetch}
    />
   ) : (
    <LastMovements
     data={rows}
     title='Recent activity'
     subtitle={subtitle}
     titleAction={exportControl}
     /* Above the rows: the narrowing frames the list before it is read, and the
        page-size control belongs with the search and filter. It goes through the
        list component because the heading is drawn there. */
     listHeader={
      <>
       {controls}

       {data && (
        <Pagination
         page={data.transactions.page}
         pageSize={data.transactions.pageSize}
         totalRows={data.transactions.totalRows}
         onPageChange={goToPage}
         onPageSizeChange={(pageSize) => narrow({ pageSize })}
         itemLabel='movements'
         isBusy={isLoading}
        />
       )}
      </>
     }
    />
   )}
  </article>
 );
}

export default RecentActivity;
