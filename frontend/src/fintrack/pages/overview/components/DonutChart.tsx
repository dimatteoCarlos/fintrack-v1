// One ranked total drawn as shares, from the same rows the ranking bar takes; generic for level-2 screens.
// No chart library, so var(--token) resolves on the SVG elements. Shares come from the server, so an
// arc's angle and the figure beside it cannot disagree; nothing here divides one amount by another.

import { useId, useState } from 'react';
import { currencyFormat } from '../../../helpers/functions';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import {
 RankedRow,
 categoryInk,
 foldZeroRows,
 othersLabel,
 percent,
} from '../helpers/rankedBreakdown';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

// The drawing box. A square viewBox in its own units, so the ring scales with
// whatever width the card gives it and nothing here is a pixel.
const BOX = 100;
const CENTRE = BOX / 2;

// Ring radius (the stroke's centre line) and thickness, in box units: the outer edge is 38 + 7 = 45,
// leaving 5 units for a focus ring on a clickable arc.
const RADIUS = 38;
const RING_WIDTH = 14;

const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// The cut between two arcs, in path units: without it adjacent arcs of similar
// colour read as one.
const ARC_GAP = 1.2;

// What a part is drawn at when its share is smaller than the gap: a category that
// spent something must never be drawn as nothing.
const MIN_ARC = 0.6;

type DonutChartProps = {
 rows: RankedRow[];
 currency: string;
 // The figure the shares are shares OF, printed in the hole. Without it the
 // percentages have no denominator on screen.
 total: number;
 totalLabel: string;
 // The plural noun the Others row counts, the same one ParetoBar's foot uses.
 unitLabel: string;
 // Under the legend, for what the ring cannot draw (e.g. uncategorised spending): never a slice, since
 // it sits outside the ranked set and angles would be shares of a different total than the percentages.
 caption?: string;
};

function DonutChart({
 rows,
 currency,
 total,
 totalLabel,
 unitLabel,
 caption,
}: DonutChartProps) {
 const money = (value: number) =>
  currencyFormat(currency, value, formatNumberCountry);

 // The same fold the bar's legend makes, opened and closed on its own.
 const { spending, folded } = foldZeroRows(rows);
 const [isOthersOpen, setIsOthersOpen] = useState(false);
 const foldId = `donutChart-folded${useId()}`;

 // Where each arc starts, in path units, accumulated over the rows BEFORE it.
 // Taken over every row and not only the drawn ones, so a row that spent
 // nothing contributes zero and moves nothing.
 let travelled = 0;

 return (
  <figure className='donutChart'>
   {/* Hidden from screen readers: the legend below lists every figure the ring
       encodes, so exposing both would recite each share twice. */}
   <div className='donutChart__ring'>
    <svg
     className='donutChart__svg'
     viewBox={`0 0 ${BOX} ${BOX}`}
     aria-hidden='true'
    >
     {/* Rotated so the first part starts at twelve o'clock, the reading
         convention for a ranking clockwise from the top. */}
     <g transform={`rotate(-90 ${CENTRE} ${CENTRE})`}>
      {/* The track under the parts: shows through the gaps and fills the circle
          when the parts do not close it. */}
      <circle
       className='donutChart__track'
       cx={CENTRE}
       cy={CENTRE}
       r={RADIUS}
       fill='none'
       strokeWidth={RING_WIDTH}
      />

      {rows.map((row, index) => {
       const start = travelled;
       travelled += row.share * CIRCUMFERENCE;

       // Filtered after the start is accumulated and the index taken: the index
       // is the rank the colour comes from, so a zero row must leave the ring
       // without renumbering or shifting the rows under it.
       if (row.amount <= 0) return null;

       const length = Math.max(row.share * CIRCUMFERENCE - ARC_GAP, MIN_ARC);

       return (
        <circle
         className='donutChart__arc'
         key={row.key}
         cx={CENTRE}
         cy={CENTRE}
         r={RADIUS}
         fill='none'
         strokeWidth={RING_WIDTH}
         strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
         // Negative, because the offset runs against the direction the dash
         // pattern is laid out: -start puts this arc's dash where the rows
         // above it stopped.
         strokeDashoffset={-start}
         style={{
          // The part's ink as a custom property the stylesheet reads; the same
          // categoryInk call as the bar keeps a category one colour in both.
          ['--rankedRow-ink' as string]: categoryInk(index),
         }}
        />
       );
      })}
     </g>
    </svg>

    {/* The hole carries the denominator. HTML over the drawing and not an svg
        text element, so the figure takes the same type tokens and the same
        currencyFormat every other amount on the page takes. */}
    <div className='donutChart__hole'>
     <span className='donutChart__total'>{money(total)}</span>
     <span className='donutChart__totalLabel'>{totalLabel}</span>
    </div>
   </div>

   <ul className='donutChart__legend'>
    {spending.map((row) => (
     <li className='donutChart__row' key={row.key}>
      {/* The same square the bar's legend draws, off the same categoryInk
          call, so a category is one colour across both drawings of the block. */}
      <span
       className='donutChart__swatch'
       aria-hidden='true'
       style={{ ['--rankedRow-ink' as string]: categoryInk(row.index) }}
      />

      <span className='donutChart__name'>{row.label}</span>

      <span className='donutChart__amount'>{money(row.amount)}</span>

      <span className='donutChart__share'>{percent(row.share)}</span>
     </li>
    ))}

    {/* The zero rows fold under one Others row, mounted and hidden so
        aria-controls always names elements that exist. */}
    {folded.length > 0 && (
     <li className='donutChart__row donutChart__row--empty'>
      <span
       className='donutChart__swatch donutChart__swatch--others'
       aria-hidden='true'
      />

      <button
       type='button'
       className={`rankedOthers__toggle rankedOthers__toggle--donut${
        isOthersOpen ? ' is-active' : ''
       }`}
       aria-expanded={isOthersOpen}
       aria-controls={folded.map((row) => `${foldId}-${row.index}`).join(' ')}
       onClick={() => setIsOthersOpen((isOpen) => !isOpen)}
      >
       <span className='rankedOthers__label'>
        {othersLabel(folded.length, unitLabel)}
       </span>
       <span className='donutChart__amount'>{money(0)}</span>
       <span className='rankedOthers__end'>
        <span className='rankedOthers__chevron' aria-hidden='true' />
        <span className='donutChart__share'>{percent(0)}</span>
       </span>
      </button>
     </li>
    )}

    {folded.map((row) => (
     <li
      className='donutChart__row donutChart__row--empty'
      id={`${foldId}-${row.index}`}
      key={row.key}
      hidden={!isOthersOpen}
     >
      {/* Hollow: the row keeps its rank colour and draws no arc. */}
      <span
       className='donutChart__swatch donutChart__swatch--empty'
       aria-hidden='true'
       style={{ ['--rankedRow-ink' as string]: categoryInk(row.index) }}
      />

      <span className='donutChart__name donutChart__name--member'>
       {row.label}
      </span>

      <span className='donutChart__amount'>{money(row.amount)}</span>

      <span className='donutChart__share'>{percent(row.share)}</span>
     </li>
    ))}
   </ul>

   {caption && <figcaption className='donutChart__foot'>{caption}</figcaption>}
  </figure>
 );
}

export default DonutChart;
