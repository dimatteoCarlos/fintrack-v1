// The trend block: one small line chart per domain that has a series.

import { currencyFormat } from '../../../helpers/functions';
import { CardTitle } from '../../../general_components/CardTitle';
import CollapsibleBlock from './CollapsibleBlock';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { useOverviewStore } from '../../../stores/useOverviewStore';
import { monthLabel } from '../helpers/monthLabel';
import { OverviewTrendPoint } from '../../../types/overviewTypes';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

// The plot is a 0-100 box on both axes stretched to the card, so these are percentages of its height. The
// band leaves room at both ends for the stroke and marker, real pixels the box edge would cut in half.
const PLOT_PADDING = 10;
const PLOT_BAND = 100 - PLOT_PADDING * 2;

// The series differ in kind and the nature says so on each chart: income and expense are monthly sums;
// the pocket series is the committed total at each month's close, so cumulative (MONTHLY_ALLOCATED_QUERY).
// 'Committed to pockets' matches the goals card: a pocket is a plan.
const SERIES: {
 key: 'income' | 'expense' | 'pocket';
 label: string;
 nature: 'flow' | 'position';
}[] = [
 { key: 'income', label: 'Income', nature: 'flow' },
 { key: 'expense', label: 'Expense', nature: 'flow' },
 { key: 'pocket', label: 'Allocated to pockets', nature: 'position' },
];

// 'YYYY-MM' to 'Apr'; trend months have no day to drop, unlike the card windows.
const shortMonth = (month: string) => {
 const [year, monthNumber] = month.split('-').map(Number);

 return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', {
  month: 'short',
 });
};

// Scaled to this series' largest month, not a scale shared across the three: income and expense differ by
// an order of magnitude. Each chart shows how a domain moved, not which is bigger; the scale starts at zero
// so a point's height is the figure's size, not its rank in the window.
const ratioOf = (value: number, peak: number) => {
 if (peak <= 0) return 0;

 return Math.abs(value) / peak;
};

// The signed scale runs from the lowest month to the highest with zero always
// inside it, so a loss sits under the zero line instead of at a gain's height.
const signedRatioOf = (value: number, floor: number, ceiling: number) => {
 const span = ceiling - floor;

 if (span <= 0) return 0;

 return (value - floor) / span;
};

// 'Aug 25'. Thirteen months name the same month at both ends, so a sparse axis
// carries the year.
const shortMonthYear = (month: string) => {
 const [year, monthNumber] = month.split('-').map(Number);

 return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', {
  month: 'short',
  year: '2-digit',
 });
};

// A month sits at the centre of its share of the width: the axis below is a row
// of equal cells with the name centred in each, so dividing by the gaps would put
// the first point on the card's edge, half a cell from its month name.
const positionX = (index: number, count: number) =>
 ((index + 0.5) / count) * 100;

// Exported for the level-2 screen, so two screens cannot disagree about the same numbers. No chart library:
// one polyline in an inline svg plus positioned-element markers, so var(--token) resolves on both and each
// month's figure stays reachable; a library earns its place only with a coordinate system.
export const TrendChart = ({
 label,
 nature,
 points,
 currency,
 isSigned = false,
 axis = 'every',
}: {
 label: string;
 nature: 'flow' | 'position';
 points: OverviewTrendPoint[];
 currency: string;
 // Draws the value with its sign and a dashed zero line. Off by default, so the
 // level-1 block keeps plotting magnitudes.
 isSigned?: boolean;
 // 'sparse' names the first, middle and last month only: thirteen names do not
 // fit a 360px row.
 axis?: 'every' | 'sparse';
}) => {
 const peak = Math.max(...points.map((point) => Math.abs(point.value)), 0);
 const floor = Math.min(...points.map((point) => point.value), 0);
 const ceiling = Math.max(...points.map((point) => point.value), 0);

 const zeroY = PLOT_PADDING + (1 - signedRatioOf(0, floor, ceiling)) * PLOT_BAND;

 const middleIndex = Math.floor((points.length - 1) / 2);
 const isNamed = (index: number) =>
  axis === 'every' ||
  index === 0 ||
  index === middleIndex ||
  index === points.length - 1;

 const plotted = points.map((point, index) => {
  const ratio = isSigned
   ? signedRatioOf(point.value, floor, ceiling)
   : ratioOf(point.value, peak);

  return {
   month: point.month,
   x: positionX(index, points.length),
   // The svg y axis grows downward and the marker is placed from the bottom,
   // so the same ratio is read from opposite ends of the band.
   y: PLOT_PADDING + (1 - ratio) * PLOT_BAND,
   bottom: PLOT_PADDING + ratio * PLOT_BAND,
   title: `${shortMonth(point.month)}: ${currencyFormat(
    currency,
    point.value,
    formatNumberCountry,
   )}`,
  };
 });

 return (
  <article className='trendChart'>
   {/* The same head as the domain cards, with its own label class:
       .domainCard__label capitalises every word, which is wrong for a phrase. */}
   <div className='domainCard__head'>
    <span className='trendChart__label'>{label}</span>
    <span className='domainCard__scope'>{nature}</span>
   </div>

   {/* Marker titles are reachable only by pointer (not focusable, not announced
       on their own), so the plot names itself with the whole series for screen
       reader and keyboard users. */}
   <div
    className='trendChart__plot'
    role='img'
    aria-label={`${label}, ${
     nature === 'flow' ? 'per month' : 'closing balance of each month'
    }, last ${points.length} months${
     isSigned ? ', months under the dashed line are below zero' : ''
    }. ${plotted.map((point) => point.title).join('. ')}`}
   >
    {/* Stretched to the card on both axes, so the stroke is fixed-width rather
        than in box units, which would be thicker on a wide card. */}
    <svg
     className='trendChart__line'
     viewBox='0 0 100 100'
     preserveAspectRatio='none'
     aria-hidden='true'
    >
     {isSigned && (
      <line
       className='trendChart__zero'
       vectorEffect='non-scaling-stroke'
       x1='0'
       x2='100'
       y1={zeroY}
       y2={zeroY}
      />
     )}
     <polyline
      className='trendChart__stroke'
      vectorEffect='non-scaling-stroke'
      points={plotted.map((point) => `${point.x},${point.y}`).join(' ')}
     />
    </svg>

    {/* Markers are elements, not svg circles: a circle in the stretched box
        would come out as an ellipse. They also carry each point's figure, and
        the chart is not decoration, so it is not aria-hidden. */}
    <div className='trendChart__markers'>
     {plotted.map((point) => (
      <span
       className='trendChart__marker'
       key={point.month}
       style={{ left: `${point.x}%`, bottom: `${point.bottom}%` }}
       title={point.title}
      />
     ))}
    </div>
   </div>

   {/* Every cell stays in a sparse axis, so a name keeps sitting under its point. */}
   <div
    className={`trendChart__axis${
     axis === 'sparse' ? ' trendChart__axis--sparse' : ''
    }`}
   >
    {points.map((point, index) => (
     <span key={point.month}>
      {!isNamed(index)
       ? null
       : axis === 'sparse'
       ? shortMonthYear(point.month)
       : shortMonth(point.month)}
     </span>
    ))}
   </div>
  </article>
 );
};

function TrendCharts() {
 const charts = useOverviewStore((state) => state.charts);
 const domainCards = useOverviewStore((state) => state.domainCards);
 const referenceMonth = useOverviewStore((state) => state.referenceMonth);

 if (!charts) return null;

 // Figures are in the accounting currency, which the cards publish per domain;
 // taken from the income card so the tooltip cannot name a currency the figures
 // are not in.
 const currency = domainCards?.income.currency ?? DEFAULT_CURRENCY;

 // An absent key means the domain has no series; an empty array would mean it
 // has one that is blank.
 const drawn = SERIES.filter(({ key }) => charts.trend[key] !== undefined);

 if (drawn.length === 0) return null;

 // The window's length as served, never a literal 6: the subtitle names the
 // months the charts actually draw.
 const monthCount = Math.max(
  ...drawn.map(({ key }) => (charts.trend[key] as OverviewTrendPoint[]).length),
 );

 // The block folds as a whole, not chart by chart, unlike the domain cards: the
 // three curves are read against each other, and closing one would leave a
 // comparison of two under a block that says three.
 return (
  <CollapsibleBlock
   head={
    <CardTitle
     subtitle={`${monthCount} months to ${monthLabel(referenceMonth)}`}
    >
     Trend
    </CardTitle>
   }
   isRuled
  >
   <section className='domainCards'>
    {drawn.map(({ key, label, nature }) => (
     <TrendChart
      key={key}
      label={label}
      nature={nature}
      points={charts.trend[key] as OverviewTrendPoint[]}
      currency={currency}
     />
    ))}
   </section>
  </CollapsibleBlock>
 );
}

export default TrendCharts;
