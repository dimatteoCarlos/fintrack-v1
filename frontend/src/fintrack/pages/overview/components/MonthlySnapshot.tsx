// One card per domain, headlined by the typical active month rather than the month itself.

import { currencyFormat } from '../../../helpers/functions';
import { CardTitle } from '../../../general_components/CardTitle';
import CollapsibleBlock from './CollapsibleBlock';
import { StatusSquare } from '../../../general_components/boxComponents/BoxComponents';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { useOverviewStore } from '../../../stores/useOverviewStore';
import { monthLabel } from '../helpers/monthLabel';
import {
 MonthlySnapshot as MonthlySnapshotRow,
 MonthlySnapshotDomain,
} from '../../../types/overviewTypes';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

const NO_FIGURE = '—';

// Dead band: within this share of the twelve-month mean the month is ordinary,
// or the indicator would fire on rounding.
const NORMAL_BAND = 0.15;
// Past this share the deviation is loud rather than merely worth a look.
const LOUD_BAND = 0.4;

// Months per window, which the active count is read against: an average over
// one active month and over twelve print the same but are different claims.
const WINDOW_MONTHS = { m3: 3, m12: 12 };

// Spending above the typical month is unfavourable; earning and saving above it
// are favourable. A favourable month is calm at any size: the band grades only
// the unfavourable side.
const FAVOURABLE_WHEN_ABOVE: Record<MonthlySnapshotDomain, boolean> = {
 income: true,
 expense: false,
 pocket: true,
};

const DOMAIN_LABEL: Record<MonthlySnapshotDomain, string> = {
 income: 'Income',
 expense: 'Expense',
 // Named after the Pocket screen this card summarises; "net committed" because the row is
 // the month's movement, not the allocated balance.
 pocket: 'Pockets · net committed',
};

const money = (currency: string, value: number) =>
 currencyFormat(currency, value, formatNumberCountry);

type Tier = 'calm' | 'watch' | 'alert' | 'unknown';

// Tier to the class StatusSquare appends (vocabulary of helpers/pocketStatus.ts). 'calm' is the bare
// square; 'unknown' has no counterpart there and lives in overview-styles.css. Status tokens stay
// legible as text on --color-surface-app (5.13:1, 6.15:1, 5.70:1).
const SQUARE_CLASS: Record<Tier, string> = {
 calm: '',
 watch: 'warning',
 alert: 'alert',
 unknown: 'unknown',
};

// Read against the twelve-month mean, never the three-month one: a mean that
// moves fast cannot say whether a month is unusual.
const tierOf = (row: MonthlySnapshotRow): Tier => {
 const { varianceVsAverage, activeMonthAverage12m } = row;

 // Null (no comparable month) and 0 are different answers: null renders as
 // unknown, since calm would assert something nobody measured.
 if (varianceVsAverage === null || !activeMonthAverage12m) return 'unknown';

 const favourable =
  varianceVsAverage === 0 ||
  varianceVsAverage > 0 === FAVOURABLE_WHEN_ABOVE[row.domain];

 if (favourable) return 'calm';

 const share = Math.abs(varianceVsAverage) / Math.abs(activeMonthAverage12m);

 if (share <= NORMAL_BAND) return 'calm';
 if (share <= LOUD_BAND) return 'watch';

 return 'alert';
};

// Says "this month" rather than naming it: the card head already prints the
// month (snapshot__period).
const againstLine = (variance: number | null) => {
 if (variance === null) return 'no comparable month yet';

 if (variance === 0) return 'this month is exactly at this average';

 return variance > 0
  ? 'this month is above this average'
  : 'this month is below this average';
};

const Baseline = ({
 label,
 value,
 currency,
 activeMonths,
 windowMonths,
}: {
 label: string;
 value: number | null;
 currency: string;
 activeMonths: number;
 windowMonths: number;
}) => (
 <div className='snapshot__baseline'>
  <span className='snapshot__label'>{label}</span>
  <span className='snapshot__figure'>
   {value === null ? NO_FIGURE : money(currency, value)}
  </span>
  {/* The denominator, because a mean hides it: one active month and twelve
      print the same way. */}
  <span className='snapshot__weight'>
   {activeMonths} of {windowMonths} active
  </span>
 </div>
);

const SnapshotCard = ({
 row,
 month,
}: {
 row: MonthlySnapshotRow;
 month: string | null;
}) => {
 const tier = tierOf(row);

 return (
  <article className='snapshot'>
   <div className='snapshot__head'>
    <span className='snapshot__domain'>{DOMAIN_LABEL[row.domain]}</span>
    <span className='snapshot__period'>{monthLabel(month, 'short')}</span>
   </div>

   {/* The typical active month over twelve; the month's own figure is already
       on the domain card above, so it appears as a baseline below. */}
   <div className='snapshot__actual'>
    {row.activeMonthAverage12m === null
     ? NO_FIGURE
     : money(row.currency, row.activeMonthAverage12m)}
   </div>

   {/* The denominator, directly under the headline mean it qualifies. */}
   <div className='snapshot__weight'>
    typical active month · {row.activeMonths12m} of {WINDOW_MONTHS.m12} active
   </div>

   {/* The square and the delta are one reading: they share a row and both take the tier. */}
   <div className='snapshot__variance'>
    <StatusSquare alert={SQUARE_CLASS[tier]} />
    <span className={`snapshot__delta snapshot__delta--${tier}`}>
     {row.varianceVsAverage === null
      ? NO_FIGURE
      : `${row.varianceVsAverage > 0 ? '+' : ''}${money(
         row.currency,
         row.varianceVsAverage,
        )}`}
    </span>
    <span className='snapshot__against'>
     {againstLine(row.varianceVsAverage)}
    </span>
   </div>

   <div className='snapshot__baselines'>
    <Baseline
     label='Active mean · 3m'
     value={row.activeMonthAverage3m}
     currency={row.currency}
     activeMonths={row.activeMonths3m}
     windowMonths={WINDOW_MONTHS.m3}
    />
    {/* The month itself is one of the two operands of the variance above, so it
        stays on screen and the difference can be checked. */}
    <div className='snapshot__baseline'>
     <span className='snapshot__label'>{monthLabel(month, 'short')}</span>
     <span className='snapshot__figure'>
      {money(row.currency, row.domainMonthlyActual)}
     </span>
     <span className='snapshot__weight'>this month</span>
    </div>
    <div className='snapshot__baseline'>
     <span className='snapshot__label'>Year to date</span>
     <span className='snapshot__figure'>
      {money(row.currency, row.yearToDate)}
     </span>
     {/* Unlike the two means, every month counts, active or not: a total has no
         denominator to protect. */}
     <span className='snapshot__weight'>every month counted</span>
    </div>
   </div>
  </article>
 );
};

function MonthlySnapshot() {
 const monthlySnapshot = useOverviewStore((state) => state.monthlySnapshot);
 const referenceMonth = useOverviewStore((state) => state.referenceMonth);

 // Nothing has arrived yet; the layout above owns the skeleton and the error retry.
 if (!monthlySnapshot || monthlySnapshot.length === 0) return null;

 // Folds as a whole, not row by row: the subtitle compares against the months
 // that had activity, and closing some rows would leave a comparison against a
 // set no longer shown.
 return (
  <CollapsibleBlock
   // The hairline every section that follows another carries (Trend, Pareto,
   // category donut); without it the heading reads as a caption of the pnl card above.
   isRuled
   head={
    <CardTitle subtitle='Each month against the months that had activity, its own year to date beside it'>
     Monthly snapshot
    </CardTitle>
   }
  >
   <section className='domainCards'>
    {monthlySnapshot.map((row) => (
     <SnapshotCard key={row.domain} row={row} month={referenceMonth} />
    ))}
   </section>
  </CollapsibleBlock>
 );
}

export default MonthlySnapshot;
