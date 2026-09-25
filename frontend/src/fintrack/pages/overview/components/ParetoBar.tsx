// One ranked total drawn as a single stacked bar, with the legend that reads it.

import { ReactNode, useId, useState } from 'react';
import { currencyFormat } from '../../../helpers/functions';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import {
 NO_SHARE,
 RankedRow,
 categoryInk,
 countNoun,
 foldZeroRows,
 othersLabel,
 percent,
} from '../helpers/rankedBreakdown';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

// Where the Pareto reading is taken. 0.8 is the reading's own definition rather
// than a preference, so it is a default and not a required prop; a caller with
// a different convention still passes its own.
export const CONCENTRATION_MARK = 0.8;

// A ranked row plus the running share only this reading needs. DonutChart.tsx
// draws the same array, so the row shape and the colour (categoryInk) are shared
// rather than copied.
export type ParetoRow = RankedRow & {
 // 0-1, this row plus every row above it: what makes the reading a Pareto and
 // not a ranking. A donut has no use for it.
 cumulativeShare: number;
 // Drawn after the name when the domain classifies its rows: today each
 // pocket's status mark and word, as the pocket board shows them.
 status?: ReactNode;
};

// Generic: the server returns every ranking (expense, income, investment, debt, pocket) already ranked with
// a running share. No chart library: the bar is a flex row of width-driven segments, so var(--token)
// resolves on each and the figures stay reachable per row.
type ParetoBarProps = {
 // Shares are the server's, so a segment's width and the figure beside it come
 // from the same arithmetic. Colour comes from the rank, never the amount.
 rows: ParetoRow[];
 currency: string;
 // The denominator of the shares, stated once above the bar.
 total: number;
 totalLabel: string;
 // Plural noun the foot counts: 'categories', 'sources', 'accounts'.
 unitLabel: string;
 // Shown under the foot for what the bar cannot draw, e.g. expense with no category.
 caption?: string;
 concentrationMark?: number;
};

function ParetoBar({
 rows,
 currency,
 total,
 totalLabel,
 unitLabel,
 caption,
 concentrationMark = CONCENTRATION_MARK,
}: ParetoBarProps) {
 const money = (value: number) =>
  currencyFormat(currency, value, formatNumberCountry);

 // The reading's denominator, not rows.length: a category with a plan and no
 // spending is listed but does not count toward how few categories carry the month.
 const spendingCount = rows.filter((row) => row.amount > 0).length;

 // Index of the last row inside the reading; -1 when the ranking is so flat
 // that no row reaches the mark.
 const concentrationIndex = rows.findIndex(
  (row) => row.cumulativeShare >= concentrationMark,
 );

 // The Others row opens closed: a category that spent nothing is detail.
 const { spending, folded } = foldZeroRows(rows);
 const [isOthersOpen, setIsOthersOpen] = useState(false);
 // Unique per mount, because the bar can render on level 1 and level 2.
 const foldId = `paretoBar-folded${useId()}`;

 return (
  <figure className='paretoBar'>
   <div className='paretoBar__head'>
    <span className='paretoBar__total'>{money(total)}</span>
    <span className='paretoBar__totalLabel'>{totalLabel}</span>
   </div>

   {/* Hidden from screen readers: the legend below already lists every figure
       the bar encodes, and exposing both would recite each amount twice. */}
   <div className='paretoBar__track' aria-hidden='true'>
    {/* Filtered after the index is taken: the index is the rank and drives the
        colour, so a zero row leaves the bar without renumbering the rows under it. */}
    {rows.map((row, index) =>
     row.amount > 0 ? (
      <span
       className='paretoBar__segment'
       key={row.key}
       style={{
        width: percent(row.share),
        // The row's ink as a var() reference the stylesheet consumes, so the
        // eight values stay in tokens.css.
        ['--rankedRow-ink' as string]: categoryInk(index),
       }}
      />
     ) : null,
    )}

    {/* Drawn over the segments: the mark falls inside the row that crosses it,
        which is the row that carries the reading. */}
    {concentrationIndex !== -1 && (
     <span
      className='paretoBar__mark'
      style={{ left: percent(concentrationMark) }}
     />
    )}
   </div>

   <ul className='paretoBar__legend'>
    {spending.map((row) => (
     <li
      className={
       row.index === concentrationIndex
        ? 'paretoBar__row paretoBar__row--concentration'
        : 'paretoBar__row'
      }
      key={row.key}
     >
      {/* Same square and same categoryInk call as the bar, so the legend
          identifies a segment. */}
      <span
       className='paretoBar__swatch'
       aria-hidden='true'
       style={{ ['--rankedRow-ink' as string]: categoryInk(row.index) }}
      />

      <span className='paretoBar__name'>{row.label}</span>

      {row.status && <span className='paretoBar__status'>{row.status}</span>}

      {row.isFlagged && (
       <span className='paretoBar__flag'>over budget</span>
      )}

      <span className='paretoBar__amount'>{money(row.amount)}</span>

      {/* The row's own share, the width of its segment. The running total lives in the foot line. */}
      <span className='paretoBar__cumulative'>{percent(row.share)}</span>
     </li>
    ))}

    {/* The zero rows fold under one Others row. They stay mounted and hidden so
        aria-controls always names elements that exist. */}
    {folded.length > 0 && (
     <li className='paretoBar__row paretoBar__row--empty'>
      <span
       className='paretoBar__swatch paretoBar__swatch--others'
       aria-hidden='true'
      />

      <button
       type='button'
       className={`rankedOthers__toggle rankedOthers__toggle--pareto${
        isOthersOpen ? ' is-active' : ''
       }`}
       aria-expanded={isOthersOpen}
       aria-controls={folded.map((row) => `${foldId}-${row.index}`).join(' ')}
       onClick={() => setIsOthersOpen((isOpen) => !isOpen)}
      >
       <span className='rankedOthers__label'>
        {othersLabel(folded.length, unitLabel)}
       </span>
       <span className='paretoBar__amount'>{money(0)}</span>
       <span className='rankedOthers__chevron' aria-hidden='true' />
       <span className='paretoBar__cumulative'>{NO_SHARE}</span>
      </button>
     </li>
    )}

    {folded.map((row) => (
     <li
      className='paretoBar__row paretoBar__row--empty paretoBar__row--member'
      id={`${foldId}-${row.index}`}
      key={row.key}
      hidden={!isOthersOpen}
     >
      {/* Hollow: the row keeps its rank colour and draws no segment. */}
      <span
       className='paretoBar__swatch paretoBar__swatch--empty'
       aria-hidden='true'
       style={{ ['--rankedRow-ink' as string]: categoryInk(row.index) }}
      />

      <span className='paretoBar__name'>{row.label}</span>

      {row.status && <span className='paretoBar__status'>{row.status}</span>}

      {row.isFlagged && (
       <span className='paretoBar__flag'>over budget</span>
      )}

      <span className='paretoBar__amount'>{money(row.amount)}</span>

      {/* A row that spent nothing prints no running share: zero rows would
          otherwise report 100.0%, and the dash says the row adds nothing. */}
      <span className='paretoBar__cumulative'>{NO_SHARE}</span>
     </li>
    ))}
   </ul>

   <figcaption className='paretoBar__foot'>
    {/* Names the white line in words so the reader need not guess its meaning.
        "The top N carry it", not "N reach it": only the last counted row reaches
        the mark, and the reading is about the group, not each row. */}
    {concentrationIndex !== -1 && (
     <span>
      the white line marks {percent(concentrationMark)}: the top{' '}
      {concentrationIndex + 1} of {spendingCount}{' '}
      {countNoun(spendingCount, unitLabel)} carry it
     </span>
    )}

    {caption && <span className='paretoBar__caption'>{caption}</span>}
   </figcaption>
  </figure>
 );
}

export default ParetoBar;
