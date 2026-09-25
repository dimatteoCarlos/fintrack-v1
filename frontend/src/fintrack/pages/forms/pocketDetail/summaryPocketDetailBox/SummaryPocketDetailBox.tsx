// Pocket detail hero: what is allocated against what goal. Figures are served, never derived here,
// so they cannot disagree with the board. Says "allocated", never "saved": no money moved.

import {
 formatCalendarDate,
 numberFormatCurrency,
} from '../../../../helpers/functions';
import { PocketDetailPocket } from '../../../../types/pocketTypes';
// '?react' rather than the bare import: only that form carries a React type, so
// the glyph can take a className and inherit the panel's ink through currentColor.
import PiggyCoinSvg from '../../../../../assets/pocketSvg/PiggyUniversalCoinSvg.svg?react';
import {
 StatusSquare,
 StatusStar,
} from '../../../../general_components/boxComponents/BoxComponents.tsx';
import {
 POCKET_STATUS_WORD,
 pocketMarkIsStar,
 pocketReadingModifier,
 pocketSquareClass,
 pocketStarTone,
} from '../../../../helpers/pocketStatus.ts';
import PocketReadingIcon from '../PocketReadingIcon.tsx';
import './styles/summaryDetailBox-style.css';

type SummaryPocketDetailPropType = {
 pocket: PocketDetailPocket;
};

function SummaryPocketDetailBox({ pocket }: SummaryPocketDetailPropType) {
 const {
  target,
  allocated,
  remaining,
  progress,
  funded,
  currency,
  desiredDate,
  uncovered,
  daysRemaining,
  level: dateLevel,
 } = pocket;

 // The symbol, which is how every amount in the application is denominated.
 // Passing the code turns on Intl's currency style and that is what emits it.
 const amount = (value: number) => numberFormatCurrency(value, 2, currency);

 // The bar never runs past its track, while the figure beside it is free to
 // read over 100%. Clamping the number too would hide an over-funded pocket.
 const barWidth = Math.min(Math.max(progress, 0), 100);

 // Negative remaining is over-funding, which is a fact and not an error.
 const excess = remaining < 0 ? Math.abs(remaining) : null;

 // One statement of the gap; a percentage would restate the bar, which exists so
 // the number need not be read.
 const gapText =
  excess !== null
   ? `${amount(excess)} over target`
   : funded
     ? 'Nothing left to allocate'
     : `Still to allocate ${amount(remaining)}`;


 // The level is served, never derived: the square and the reading's border both
 // take their colour from it, so they cannot disagree about the same pocket.

 // The sign is spent on the word rather than on the number: late is "12 days
 // late", never "-12 days left". Same rule the module applies to every figure
 // whose direction is already stated in words beside it.
 const dayCount = Math.abs(daysRemaining);
 const dayWord = dayCount === 1 ? 'day' : 'days';

 // The word comes from the shared map so the text names the same LEVEL the square
 // is painted for; a pocket past its goal lights the over-funded blue, and a band
 // name beside that colour would disagree about how precise the reading is.
 const dateText = funded
  ? POCKET_STATUS_WORD[dateLevel]
  : daysRemaining < 0
    ? `${dayCount} ${dayWord} late`
    : daysRemaining === 0
      ? 'Due today'
      : `${dayCount} ${dayWord} away`;

 return (
  <div className='summaryPocket__container'>
   {/* One figure is headlined, so the label names that one. */}
   <div className='summaryPocket__title'>allocated</div>

   <PiggyCoinSvg className='summaryPocket__glyph' aria-hidden='true' />

   <div className='summaryPocket__data'>
    <div className='summaryPocket__data--amount'>{amount(allocated)}</div>

    {/* Two labelled figures rather than a sentence, so each quantity is named
        and the date the plan is measured against sits with the target. */}
    <div className='summaryPocket__data--subtitle1'>
     <span className='summaryPocket__figureLabel'>Target</span>{' '}
     <span className='summaryPocket__figureValue'>{amount(target)}</span>
     <span className='summaryPocket__separator' aria-hidden='true'>
      {' · '}
     </span>
     <span className='summaryPocket__figureLabel'>By</span>{' '}
     <span className='summaryPocket__figureValue'>
      {formatCalendarDate(desiredDate)}
     </span>
    </div>

    {/* Directly above the track it reads, so there is no doubt what it measures.
        Same shape as the board hero. */}
    <div className='summaryPocket__data--share'>
     {progress.toFixed(1)}% allocated
    </div>

    <div
     className='summaryPocket__track'
     role='progressbar'
     aria-valuenow={Math.round(progress)}
     aria-valuemin={0}
     aria-valuemax={100}
     aria-label='Progress towards the goal'
    >
     <div
      className='summaryPocket__fill'
      style={{ width: `${barWidth}%` }}
     ></div>
    </div>

    {/* What is left, on its own line: sharing a line with the percentage made a
        share of what is COMMITTED read as the share still missing. */}
    <div className='summaryPocket__data--status'>
     <span className='summaryPocket__data--subtitle2'>{gapText}</span>
    </div>
   </div>

   {/* Coverage leads when both readings are present, because it contradicts the
       figures above (an account no longer holding what is committed leaves the
       allocated total unbacked), while a passed date leaves them true. */}
   <div className='summaryPocket__readings'>
    {uncovered && (
     <p
      className={`summaryPocket__reading ${pocketReadingModifier('overdue')}`}
      role='status'
     >
      <StatusSquare alert={pocketSquareClass('overdue')} />
      <PocketReadingIcon
       level='overdue'
       className='summaryPocket__readingIcon'
      />
      <span className='summaryPocket__readingText'>
       Uncovered
      </span>
     </p>
    )}

    {/* A star marks a reached goal, a square the other levels, via the shared helper so this panel and the board
        card draw the same shape. The border keeps its hue: a line cannot be a shape. */}
    <p className={`summaryPocket__reading ${pocketReadingModifier(dateLevel)}`}>
     {pocketMarkIsStar(dateLevel) ? (
      <StatusStar tone={pocketStarTone(dateLevel)} />
     ) : (
      <StatusSquare alert={pocketSquareClass(dateLevel)} />
     )}
     <PocketReadingIcon
      level={dateLevel}
      className='summaryPocket__readingIcon'
     />
     <span className='summaryPocket__readingText'>{dateText}</span>
    </p>
   </div>
  </div>
 );
}

export default SummaryPocketDetailBox;
