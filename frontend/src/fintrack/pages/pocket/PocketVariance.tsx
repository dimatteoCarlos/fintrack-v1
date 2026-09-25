//frontend/src/fintrack/pages/pocket/PocketVariance.tsx
// Plan variance: signed bars of each pocket's gap to its plan's line at month close. The second reading uses
// scheduledInMonth, not requiredMonthly, which is a whole month's pace and would paint short a pocket over its line.

import { Link, useLocation, useSearchParams } from 'react-router-dom';

import ArrowLeftSolidSvg from '../../../assets/budgetSvg/ArrowLeftSolidSvg.svg?react';

import {
 StatusSquare,
 StatusStar,
} from '../../general_components/boxComponents/BoxComponents.tsx';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../helpers/constants.ts';
import {
 currencyFormat,
 formatBudgetMonthLabel,
} from '../../helpers/functions.ts';
import {
 pocketMarkIsStar,
 pocketSquareClass,
 pocketStarTone,
} from '../../helpers/pocketStatus.ts';
import { usePocketBoardStore } from '../../stores/usePocketBoardStore.ts';
import { PocketStatus } from '../../types/pocketTypes.ts';
import { useCompactHeroOnScroll } from './hooks/useCompactHeroOnScroll.ts';

type VarianceView = 'close' | 'rate';

const VIEWS: { key: VarianceView; label: string }[] = [
 { key: 'close', label: 'At month end' },
 { key: 'rate', label: "This month's rate" },
];

// Anything but 'rate' is the default chart, so a stale or typed value cannot
// leave the screen blank.
const toView = (value: string | null): VarianceView =>
 value === 'rate' ? 'rate' : 'close';

// The name cell both charts share.
const VarianceName = ({ pocket }: { pocket: PocketStatus }) => (
 <span className='pocketVariance__name'>
  {/* The level, so the bar can be read against the status the card wears. */}
  {pocketMarkIsStar(pocket.level) ? (
   <StatusStar tone={pocketStarTone(pocket.level)} />
  ) : (
   <StatusSquare alert={pocketSquareClass(pocket.level)} />
  )}
  <span className='pocketVariance__nameText'>{pocket.name}</span>
  {pocket.uncovered && (
   <span className='pocketCoverage pocketCoverage--uncovered'>Uncovered</span>
  )}
 </span>
);

function PocketVariance() {
 const location = useLocation();
 const handleScroll = useCompactHeroOnScroll();

 // In the URL beside the month, so the view survives opening a pocket and
 // coming back. Replaced and merged, as the month is.
 const [searchParams, setSearchParams] = useSearchParams();
 const view = toView(searchParams.get('view'));
 const selectView = (next: VarianceView) =>
  setSearchParams(
   (previous) => {
    const params = new URLSearchParams(previous);
    if (next === 'rate') params.set('view', 'rate');
    else params.delete('view');
    return params;
   },
   { replace: true },
  );

 // Fetched by PocketLayout for the month in the URL; read here, not asked for again.
 const pockets = usePocketBoardStore((state) => state.pockets);
 const summary = usePocketBoardStore((state) => state.summary);
 const referenceMonth = usePocketBoardStore((state) => state.referenceMonth);
 const currentMonth = usePocketBoardStore((state) => state.currentMonth);
 const isLoading = usePocketBoardStore((state) => state.isLoading);
 const error = usePocketBoardStore((state) => state.error);

 const currency_code = summary?.currency ?? DEFAULT_CURRENCY;
 // The reader's locale, never the amount's, as on the board.
 const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];
 const amount = (value: number) =>
  currencyFormat(currency_code, value, formatNumberCountry);

 // One bar per pocket with a plan window, ranked by size, which is what makes
 // the chart a tornado. A pocket with no window has no line to be away from.
 const rows = pockets
  .filter(
   (pocket): pocket is PocketStatus & { aheadAtClose: number } =>
    pocket.aheadAtClose !== null,
  )
  .sort(
   (a, b) =>
    Math.abs(b.aheadAtClose) - Math.abs(a.aheadAtClose) ||
    a.name.localeCompare(b.name),
  );
 // Half the track is the widest gap, so every bar is read on one scale.
 const widest = Math.max(0, ...rows.map((pocket) => Math.abs(pocket.aheadAtClose)));
 const unscheduled = pockets.length - rows.length;
 const monthLabel = formatBudgetMonthLabel(referenceMonth);

 // Pockets whose plan asks for something this month and still need it, largest demand first.
 // typeof, not !== null: a server not yet serving the field sends undefined.
 const rateRows = pockets
  .filter(
   (
    pocket,
   ): pocket is PocketStatus & {
    scheduledInMonth: number;
    movedInMonth: number;
   } =>
    typeof pocket.scheduledInMonth === 'number' &&
    pocket.scheduledInMonth > 0 &&
    !pocket.funded &&
    pocket.movedInMonth !== null,
  )
  .sort(
   (a, b) =>
    b.scheduledInMonth - a.scheduledInMonth || a.name.localeCompare(b.name),
  );
 // The whole track is the largest figure on either side, so the allocated bar
 // and the plan's mark are read on one scale across every row.
 const rateScale = Math.max(
  0,
  ...rateRows.map((pocket) =>
   Math.max(pocket.scheduledInMonth, pocket.movedInMonth),
  ),
 );
 const notDrawn = pockets.length - rateRows.length;
 // The running month is not over, so its allocation is a figure to date.
 const isRunningMonth =
  referenceMonth !== null &&
  currentMonth !== null &&
  referenceMonth.slice(0, 7) === currentMonth.slice(0, 7);
 const shownCount = view === 'rate' ? rateRows.length : rows.length;

 // Back to the board with the query string it was opened with: the month, the
 // list's filters and its open cards.
 const backTo = { pathname: '..', search: location.search };
 // Where a pocket's back arrow returns: this screen, month included.
 const returnRoute = `${location.pathname}${location.search}`;

 return (
  <section className='content__presentation'>
   <div className='cards__presentation'>
    <div className='pocketBoard__scroller' onScroll={handleScroll}>
     <section className='pocketVariance' aria-label='Plan variance'>
      <div className='pocketVariance__head'>
       <h2 className='pocketVariance__title'>Plan variance</h2>

       <Link className='pocketVariance__back' to={backTo} relative='path'>
        <ArrowLeftSolidSvg
         className='pocketVariance__backArrow'
         aria-hidden='true'
        />
        Pocket list
       </Link>
      </div>

      <div className='pocketVariance__views' role='group' aria-label='Reading'>
       {VIEWS.map(({ key, label }) => (
        <button
         key={key}
         type='button'
         className={`pocketVariance__view${view === key ? ' is-active' : ''}`}
         aria-pressed={view === key}
         onClick={() => selectView(key)}
        >
         {label}
        </button>
       ))}
      </div>

      {view === 'close' && (
       <p className='pocketVariance__caption'>
        How far each pocket sits from what its plan requires by{' '}
        {monthLabel ? `the end of ${monthLabel}` : 'month end'}.
       </p>
      )}

      {view === 'rate' && (
       <p className='pocketVariance__caption'>
        {`Allocated in ${monthLabel || 'the month'}${
         isRunningMonth ? ' so far' : ''
        }, against what each plan asks for within the month.`}
       </p>
      )}

      {error && (
       <p className='pocketVariance__notice' role='alert'>
        The pocket board could not be loaded.
       </p>
      )}

      {!error && isLoading && shownCount === 0 && (
       <p className='pocketVariance__notice' role='status'>
        Loading the month…
       </p>
      )}

      {!error && !isLoading && view === 'close' && rows.length === 0 && (
       <p className='pocketVariance__notice'>
        No pocket has a plan window, so nothing is required to measure against.
       </p>
      )}

      {!error && !isLoading && view === 'rate' && rateRows.length === 0 && (
       <p className='pocketVariance__notice'>
        No plan asks for anything this month: each pocket is funded or its plan
        does not reach the month.
       </p>
      )}

      {!error && view === 'close' && rows.length > 0 && (
       <>
        <div className='pocketVariance__columns'>
         <span>Pocket</span>
         <span className='pocketVariance__columnAxis' aria-hidden='true'>
          Short / over
         </span>
         <span className='pocketVariance__columnAmount'>At month end</span>
        </div>

        <ol className='pocketVariance__rows'>
         {rows.map((pocket) => {
          const word = pocket.aheadAtClose < 0 ? 'short' : 'over';
          const share =
           widest === 0 ? 0 : (Math.abs(pocket.aheadAtClose) / widest) * 50;

          return (
           <li className='pocketVariance__row' key={pocket.pocketId}>
            <Link
             to={`/fintrack/pocket/pockets/${pocket.pocketId}`}
             state={{ previousRoute: returnRoute }}
             className='pocketVariance__cells'
            >
             <VarianceName pocket={pocket} />

             <span className='pocketVariance__track' aria-hidden='true'>
              <span className='pocketVariance__axis' />
              {/* No bar for a pocket exactly on its line: the 2px floor would
                  otherwise draw one for a gap of nothing. */}
              {pocket.aheadAtClose !== 0 && (
               <span
                className={`pocketVariance__bar pocketVariance__bar--${word}`}
                style={{ inlineSize: `${share}%` }}
               />
              )}
             </span>

             <span
              className={`pocketVariance__amount pocketVariance__amount--${word}`}
             >
              {amount(Math.abs(pocket.aheadAtClose))}
              {/* The word carries the sign the absolute value drops, and the
                  colour alone is not a reading. */}
              <span className='pocketVariance__direction'>({word})</span>
             </span>
            </Link>
           </li>
          );
         })}
        </ol>

        {/* The denominator, named, so a pocket missing from the chart reads as
            left out and not as absent. */}
        <p className='pocketVariance__foot'>
         {`${rows.length} ${rows.length === 1 ? 'pocket' : 'pockets'} with a plan, ranked by how far each sits from what its plan requires`}
         {unscheduled > 0 &&
          `. ${unscheduled} more ${
           unscheduled === 1 ? 'has' : 'have'
          } no plan window and ${unscheduled === 1 ? 'is' : 'are'} not drawn`}
         .
        </p>
       </>
      )}

      {!error && view === 'rate' && rateRows.length > 0 && (
       <>
        {/* The bar and the mark are not self-evident, so the legend names them. */}
        <ul className='pocketVariance__legend' aria-label='Legend'>
         <li className='pocketVariance__legendItem'>
          <span
           className='pocketVariance__swatch pocketVariance__swatch--over'
           aria-hidden='true'
          />
          Allocated, plan reached
         </li>
         <li className='pocketVariance__legendItem'>
          <span
           className='pocketVariance__swatch pocketVariance__swatch--short'
           aria-hidden='true'
          />
          Allocated, short of the plan
         </li>
         <li className='pocketVariance__legendItem'>
          <span className='pocketVariance__swatchMark' aria-hidden='true' />
          {`Plan for ${monthLabel || 'the month'}`}
         </li>
        </ul>

        <div className='pocketVariance__columns'>
         <span>Pocket</span>
         <span className='pocketVariance__columnAxis' aria-hidden='true'>
          Allocated / plan
         </span>
         <span className='pocketVariance__columnAmount'>
          {isRunningMonth ? 'So far' : 'In the month'}
         </span>
        </div>

        <ol className='pocketVariance__rows'>
         {rateRows.map((pocket) => {
          const word =
           pocket.movedInMonth < pocket.scheduledInMonth ? 'short' : 'over';
          const fill =
           rateScale === 0
            ? 0
            : (Math.max(pocket.movedInMonth, 0) / rateScale) * 100;
          const mark =
           rateScale === 0 ? 0 : (pocket.scheduledInMonth / rateScale) * 100;

          return (
           <li className='pocketVariance__row' key={pocket.pocketId}>
            <Link
             to={`/fintrack/pocket/pockets/${pocket.pocketId}`}
             state={{ previousRoute: returnRoute }}
             className='pocketVariance__cells'
            >
             <VarianceName pocket={pocket} />

             <span className='pocketVariance__track' aria-hidden='true'>
              {/* A month that released more than it allocated draws no bar;
                  the amount carries the sign. */}
              {pocket.movedInMonth > 0 && (
               <span
                className={`pocketVariance__fill pocketVariance__fill--${word}`}
                style={{ inlineSize: `${fill}%` }}
               />
              )}
              <span
               className='pocketVariance__mark'
               style={{ insetInlineStart: `${mark}%` }}
              />
             </span>

             <span
              className={`pocketVariance__amount pocketVariance__amount--${word}`}
             >
              {amount(pocket.movedInMonth)}
              <span className='pocketVariance__direction'>
               of {amount(pocket.scheduledInMonth)}
              </span>
             </span>
            </Link>
           </li>
          );
         })}
        </ol>

        <p className='pocketVariance__foot'>
         {`${rateRows.length} ${
          rateRows.length === 1 ? 'pocket has' : 'pockets have'
         } a plan share in the month, ranked by it`}
         {notDrawn > 0 &&
          `. ${notDrawn} more ${notDrawn === 1 ? 'is' : 'are'} funded or ${
           notDrawn === 1 ? 'has' : 'have'
          } no share in the month and ${notDrawn === 1 ? 'is' : 'are'} not drawn`}
         .
        </p>
       </>
      )}
     </section>
    </div>
   </div>
  </section>
 );
}

export default PocketVariance;
