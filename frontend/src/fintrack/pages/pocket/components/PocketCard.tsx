// One pocket as a card, shared by the hero's Next target and the list so both use one vocabulary.
// Its own file so the hero does not import from the list. The whole card is the link.

import { Link } from 'react-router-dom';
import {
 StatusSquare,
 StatusTick,
} from '../../../general_components/boxComponents/BoxComponents.tsx';
import {
 CURRENCY_OPTIONS,
 DEFAULT_CURRENCY,
} from '../../../helpers/constants.ts';
import {
 currencyFormat,
 formatCalendarDate,
} from '../../../helpers/functions.ts';
import {
 POCKET_STATUS_WORD,
 PocketStatusLevel,
 pocketMarkIsTick,
 pocketSquareClass,
} from '../../../helpers/pocketStatus.ts';
import { PocketStatus } from '../../../types/pocketTypes.ts';

// A figure the contract withheld. Never 0 and never an empty cell: a dash says
// the answer is absent, where 0 would state an amount.
const DASH = '—';

// Tone shared by the card's word, bar fill and percentage so they cannot disagree. Not the
// square's class: completed is drawn as a tick and has no tone. The word is always printed,
// since colour alone fails colour blindness and monochrome print.
const STATUS_TONE: Record<PocketStatusLevel, string> = {
 completed: 'ok',
 aboveTarget: 'info',
 ahead: 'ahead',
 onTrack: 'neutral',
 behind: 'behind',
 atRisk: 'warning',
 overdue: 'alert',
};

const plural = (count: number, word: string): string =>
 `${count} ${word}${Math.abs(count) === 1 ? '' : 's'}`;

// How the deadline reads against today. Negative days are a deadline already
// passed, and the day it falls on is neither left nor overdue.
const deadlineReading = (days: number): string => {
 if (days === 0) return 'Due today';

 return days > 0
  ? `${plural(days, 'day')} left`
  : `${plural(Math.abs(days), 'day')} overdue`;
};

type PocketCardPropType = {
 pocket: PocketStatus;
 // Where the reader came from, so the detail's back control returns there and
 // not to the module default. The hero and the list pass different values.
 previousRoute: string;
};

function PocketCard({ pocket, previousRoute }: PocketCardPropType) {
 const {
  pocketId,
  name,
  note,
  allocated,
  target,
  remaining,
  progress,
  desiredDate,
  daysRemaining,
  requiredMonthly,
  scheduledByNow,
  aheadOfPlan,
  sourceCount,
  uncovered,
  currency,
  level,
 } = pocket;

 const currency_code = currency ?? DEFAULT_CURRENCY;
 // The locale is the reader's, never the amount's: taken from the amount's own
 // currency, Intl narrows the dollar and the Colombian and Mexican pesos all to
 // '$', so cards in different currencies would read identically.
 const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

 const amount = (value: number) =>
  currencyFormat(currency_code, value, formatNumberCountry);

 // Built from the parts of the server's YYYY-MM-DD label: new Date() on one is
 // UTC midnight and renders as the previous day west of UTC.
 const deadlineText = formatCalendarDate(desiredDate);

 const tone = STATUS_TONE[level];

 // The percentage label is unclamped and passes 100 once the goal is passed;
 // only the fill is clamped, since a fill wider than its rail is a paint error.
 const barWidth = Math.min(Math.max(progress, 0), 100);

 // A shortfall and an excess are the same subtraction with opposite signs but
 // not the same news, so each gets its own word. Exactly zero means nothing is
 // missing and prints as the amount.
 const isExcess = remaining < 0;

 // requiredMonthly null is a passed deadline (no pace) and 0 a met goal; neither is a monthly amount.
 // A passed deadline shows the whole shortfall from `remaining`, never written into requiredMonthly:
 // a "/ month" consumer would print something untrue.
 const paceText =
  requiredMonthly === null
   ? `${amount(remaining)} now`
   : requiredMonthly === 0
     ? 'Not needed'
     : amount(requiredMonthly);

 // The label follows the figure, so a pocket with no rate left is not labelled
 // as one.
 const paceLabel = requiredMonthly === null ? 'To settle' : 'Monthly pace';

 // The pocket against its plan's line, in money, so At risk states by how much and which way.
 // A plan window shorter than a month publishes no line. aheadOfPlan is served, signed,
 // and never recomputed here.
 const scheduleText =
  scheduledByNow === null || aheadOfPlan === null
   ? 'The plan has no window — no pace is shown'
   : aheadOfPlan < 0
     ? `${amount(Math.abs(aheadOfPlan))} behind the plan`
     : `${amount(aheadOfPlan)} ahead of the plan`;

 return (
  <Link
   to={`pockets/${pocketId}`}
   state={{ previousRoute }}
   className={`pocketCard ${uncovered ? 'pocketCard--uncovered' : ''}`.trim()}
  >
   <div className='pocketCard__head'>
    <h3 className='pocketCard__name'>{name}</h3>

    {/* Completed takes a tick, every other level a square, via the shared helper, so card, hero
        and detail agree on which reading is finished; the shape survives colour blindness. */}
    <span className={`pocketCard__status pocketCard__status--${tone}`}>
     {pocketMarkIsTick(level) ? (
      <StatusTick />
     ) : (
      <StatusSquare alert={pocketSquareClass(level)} />
     )}
     {POCKET_STATUS_WORD[level]}
    </span>
   </div>

   <p className='pocketCard__note'>{note ?? DASH}</p>

   {/* The percentage sits on the bar it reports, not after the amounts below. It
       stays beside the bar because the bar is approximate and the figure exact. */}
   <div className='pocketCard__progress'>
    <span className={`pocketCard__percent pocketCard__percent--${tone}`}>
     {Math.round(progress)}%
    </span>

    <div
     className='pocketCard__bar'
     role='progressbar'
     aria-label={`${name} progress`}
     aria-valuemin={0}
     aria-valuemax={100}
     aria-valuenow={Math.round(progress)}
    >
     <div
      className={`pocketCard__barFill pocketCard__barFill--${tone}`}
      style={{ width: `${barWidth}%` }}
     />
    </div>
   </div>

   <p className='pocketCard__amounts'>
    <span className='pocketCard__allocated'>{amount(allocated)}</span>
    {/* Labelled "Target" rather than joined by "of": "of" would say the first
        amount is a part of the second, which is false for an over-funded pocket
        ("$5.00 of $1.38"). */}
    <span className='pocketCard__target'>
     <span className='pocketCard__targetLabel'>Target</span> {amount(target)}
    </span>
   </p>

   <dl className='pocketCard__facts'>
    <div className='pocketCard__fact'>
     {/* The same words the board hero and the detail panel use for this figure. */}
     <dt className='pocketCard__factLabel'>
      {isExcess ? 'Over target' : 'Still to allocate'}
     </dt>
     <dd
      className={`pocketCard__factValue ${
       isExcess ? 'pocketCard__factValue--ok' : ''
      }`.trim()}
     >
      {amount(Math.abs(remaining))}
     </dd>
    </div>

    <div className='pocketCard__fact'>
     <dt className='pocketCard__factLabel'>{paceLabel}</dt>
     <dd
      className={`pocketCard__factValue ${
       requiredMonthly === null ? 'pocketCard__factValue--alert' : ''
      }`.trim()}
     >
      {paceText}
     </dd>
    </div>

    <div className='pocketCard__fact'>
     <dt className='pocketCard__factLabel'>Deadline</dt>
     <dd className='pocketCard__factValue'>{deadlineText || DASH}</dd>
    </div>

    <div className='pocketCard__fact'>
     <dt className='pocketCard__factLabel'>Time</dt>
     <dd
      className={`pocketCard__factValue ${
       daysRemaining < 0 ? 'pocketCard__factValue--alert' : ''
      }`.trim()}
     >
      {deadlineReading(daysRemaining)}
     </dd>
    </div>
   </dl>

   {/* On track and At risk both mean deadline ahead, target not met; this line
       is the only thing that tells them apart. */}
   <p
    className={`pocketCard__gap ${
     aheadOfPlan !== null && aheadOfPlan < 0 ? '' : 'pocketCard__gap--none'
    }`.trim()}
   >
    {scheduleText}
   </p>

   {/* A count, not names: the detail screen lists the accounts one by one and
       the card has no room for two of them. */}
   <p className='pocketCard__sources'>
    {sourceCount === 0
     ? 'No funding account yet'
     : `Funded by ${plural(sourceCount, 'account')}`}
   </p>

   {/* Orthogonal to the readings above and louder than any of them: a funded
       pocket can still be uncovered. Folded by the server across the accounts,
       so nothing here derives it. */}
   {uncovered && (
    <p className='pocketCard__uncovered'>
     Funding accounts no longer hold what this pocket committed
    </p>
   )}
  </Link>
 );
}

export default PocketCard;
