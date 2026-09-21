// Level 2: one domain, for the month the layout above is already showing.

import { useMemo } from 'react';
import {
 Link,
 useLocation,
 useParams,
 useSearchParams,
} from 'react-router-dom';

import { CardTitle } from '../../general_components/CardTitle';
import { Pagination } from '../../general_components/pagination/Pagination';
import LastMovements, { LastMovementType } from './components/LastMovements';
import PanelState from './components/PanelState';
import {
 FullAnalysisStatus,
 useOverviewDomain,
} from './hooks/useOverviewDomain';
import { currencyFormat } from '../../helpers/functions';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../helpers/constants';
import { monthLabel } from './helpers/monthLabel';
import { pocketLink } from './helpers/levelThreeLink';
import { DOMAIN_SCREENS } from './domains/domainScreens';
import {
 CardOf,
 DomainScreen,
 isAnalysisOf,
 isCardOf,
} from './domains/domainScreen';
import {
 GetOverviewDomainData,
 OverviewAllocationRow,
 OverviewAnalysis,
 OverviewDomain as OverviewDomainName,
 OverviewTransactionRow,
} from '../../types/overviewTypes';

import './styles/overview-styles.css';
import './styles/overview-domain-styles.css';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

// A path segment is whatever was typed, so a name absent from the registry never
// becomes a request. An own-key test and not `in`, which would accept
// 'constructor' and every other name on Object.prototype.
const isDomain = (value: string | undefined): value is OverviewDomainName =>
 value !== undefined &&
 Object.prototype.hasOwnProperty.call(DOMAIN_SCREENS, value);

// A closed account keeps its name, marked, so the reader does not look for it
// among the live ones; a null name falls back to the caller's fixed label.
const accountLabel = (name: string | null, isClosed: boolean, unnamed: string) => {
 if (name === null) return unnamed;

 return isClosed ? `${name} (closed)` : name;
};

// Maps the server's columns to the row shape LastMovements reads. account_name is nullable: the LEFT
// join in transactionRowShape.js keeps movements of a closed account, which deletes its row.
const toTransactionRow = (row: OverviewTransactionRow): LastMovementType => ({
 accountName: accountLabel(row.account_name, row.account_is_closed, 'closed account'),
 record: row.amount,
 description: row.description,
 // transaction_local_date and not transaction_actual_date: the latter is an
 // instant, and a day rendered from it is the previous day for readers west of
 // Greenwich.
 date: row.transaction_local_date,
 currency: row.currency_code as LastMovementType['currency'],
 transactionId: row.transaction_id,
});

// The pocket page's rows are allocations: mapped as transactions they would read
// "closed account" (no account_name) and open a detail with no transaction id.
const isAllocationRow = (
 row: OverviewTransactionRow | OverviewAllocationRow,
): row is OverviewAllocationRow => 'allocationId' in row;

const toAllocationRow = (
 row: OverviewAllocationRow,
 origin: string,
): LastMovementType => {
 const amount = Number(row.amount);
 const account = accountLabel(
  row.sourceAccountName,
  row.sourceAccountIsClosed,
  'a closed account',
 );
 // The word beside the sign, as PocketDetail.tsx states it: a negative row
 // released money back to the account, and a bare minus reads as a spend.
 const source =
  amount < 0 ? `Released to ${account}` : `Committed from ${account}`;

 return {
  accountName: row.pocketName,
  record: amount,
  description: source,
  note: source,
  date: row.allocationDate,
  currency: row.currency as LastMovementType['currency'],
  link: pocketLink(row.pocketId, origin),
  rowKey: row.allocationId,
 };
};

type DomainViewProps<D extends OverviewDomainName> = {
 domain: D;
 card: CardOf<D>;
 answer: GetOverviewDomainData;
 analysis: OverviewAnalysis | null;
 isLoading: boolean;
 fullStatus: FullAnalysisStatus;
 selectedCategory: string | null;
 goToPage: (next: number) => void;
 setPageSize: (next: number) => void;
 narrowToCategory: (next: string | null) => void;
 refetch: () => void;
 requestFullAnalysis: () => void;
};

// Generic over the domain so the registry entry, the card and the analysis are
// proven to belong to the same one before the composition receives them.
function DomainView<D extends OverviewDomainName>({
 domain,
 card,
 answer,
 analysis,
 isLoading,
 fullStatus,
 selectedCategory,
 goToPage,
 setPageSize,
 narrowToCategory,
 refetch,
 requestFullAnalysis,
}: DomainViewProps<D>) {
 const screen: DomainScreen<D> = DOMAIN_SCREENS[domain];
 const { Composition } = screen;
 const served = answer.window;
 const { pathname, search } = useLocation();
 // The search keeps the month, so the pocket's back arrow returns to it.
 const origin = `${pathname}${search}`;

 const rows = useMemo(() => {
  const pageRows: Array<OverviewTransactionRow | OverviewAllocationRow> =
   answer.transactions.rows;

  return pageRows.map((row) =>
   isAllocationRow(row) ? toAllocationRow(row, origin) : toTransactionRow(row),
  );
 }, [answer.transactions.rows, origin]);

 return (
  <section className='overviewDomain'>
   {/* Carries the search because the month lives there: a bare path would land on
       level 1 with no month and refetch the current one. */}
   <Link
    className='overviewDomain__back'
    to={{ pathname: '/fintrack/overview', search }}
    viewTransition
   >
    <span className='overviewDomain__backArrow' aria-hidden='true'>
     ←
    </span>
    Back to Overview
   </Link>

   {/* The month is the layout's but is stated here too: the screen can be opened
       by url, and movements with no period named are from an unknown month. */}
   <CardTitle
    legend={
     <span className='overviewDomain__amount'>
      {currencyFormat(
       card.currency,
       screen.headline.amountOf(card),
       formatNumberCountry,
      )}
     </span>
    }
    subtitle={monthLabel(served.referenceMonth)}
    subLegend={screen.headline.nature}
   >
    {screen.label}
   </CardTitle>

   <Composition
    card={card}
    analysis={isAnalysisOf(analysis, domain) ? analysis : null}
    answer={answer}
    isLoading={isLoading}
    onRetry={refetch}
    fullStatus={fullStatus}
    onRequestFullAnalysis={requestFullAnalysis}
    selectedCategory={selectedCategory}
    onSelectCategory={narrowToCategory}
   />

   {/* The count is the server's and follows the narrowing, so the subtitle states
       what the pager pages. It is the only place the selected category appears in
       words, for a reader who scrolled past the pressed chip. */}
   <LastMovements
    data={rows}
    title={screen.list.title}
    subtitle={
     <>
      {selectedCategory && (
       <>
        <span className='lastMovements__scope'>{selectedCategory}</span>
        {' · '}
       </>
      )}
      {`${answer.transactions.totalRows} in ${monthLabel(
       served.referenceMonth,
      )}`}
     </>
    }
    listHeader={
     <Pagination
      page={answer.transactions.page}
      pageSize={answer.transactions.pageSize}
      totalRows={answer.transactions.totalRows}
      onPageChange={goToPage}
      onPageSizeChange={setPageSize}
      itemLabel={screen.list.itemLabel}
      isBusy={isLoading}
     />
    }
   />
  </section>
 );
}

// Mounts inside OverviewLayout's Outlet, which owns the month in the URL, so stepping it here steps
// the hero and picker too. Only the shared shell lives here; each domain composes its own body in domains/.
function OverviewDomain() {
 const { domain } = useParams();
 const [searchParams] = useSearchParams();
 const monthParam = searchParams.get('month') ?? undefined;
 // The way back out of a mistyped segment keeps the month too.
 const { search } = useLocation();

 // Narrowed before the hook, so the request is never composed from a segment
 // the registry does not know. The fallback is never rendered: a hook cannot be
 // called conditionally, and the guard below returns first.
 const domainName: OverviewDomainName = isDomain(domain) ? domain : 'expense';

 const {
  query,
  data,
  analysis,
  isLoading,
  error,
  fullStatus,
  goToPage,
  setPageSize,
  narrowToCategory,
  refetch,
  requestFullAnalysis,
 } = useOverviewDomain(domainName, monthParam);

 if (!isDomain(domain)) {
  return (
   <section className='overviewDomain'>
    <Link
     className='overviewDomain__back'
     to={{ pathname: '/fintrack/overview', search }}
     viewTransition
    >
     <span className='overviewDomain__backArrow' aria-hidden='true'>
      ←
     </span>
     Back to Overview
    </Link>

    <CardTitle>Not a domain</CardTitle>

    <p className='overviewDomain__note'>
     {/* The six are named because a mistyped segment is the only way to arrive
         here. */}
     The overview breaks down into{' '}
     {Object.values(DOMAIN_SCREENS)
      .map((screen) => screen.label)
      .join(', ')
      .toLowerCase()}
     .
    </p>
   </section>
  );
 }

 const label = DOMAIN_SCREENS[domain].label;

 // An answer for another domain is still in hand for one request after the
 // segment changes; it is not this screen's, so it counts as not arrived.
 const hasAnswer = data !== null && isCardOf(data.card, domain);

 // The skeleton is only for the first answer: a page step with rows already on
 // screen keeps them and marks the pager busy, since a skeleton on every step
 // would make the list jump.
 const isFirstLoad = isLoading && !hasAnswer;

 if (isFirstLoad || error !== null) {
  return (
   <section className='overviewDomain'>
    <PanelState
     title={label}
     subject={`The ${label.toLowerCase()} detail`}
     isLoading={isFirstLoad}
     error={error}
     onRetry={refetch}
    />
   </section>
  );
 }

 if (!data || !isCardOf(data.card, domain)) return null;

 return (
  <DomainView
   domain={domain}
   card={data.card}
   answer={data}
   analysis={analysis}
   isLoading={isLoading}
   fullStatus={fullStatus}
   selectedCategory={query.category}
   goToPage={goToPage}
   setPageSize={setPageSize}
   narrowToCategory={narrowToCategory}
   refetch={refetch}
   requestFullAnalysis={requestFullAnalysis}
  />
 );
}

export default OverviewDomain;
