// One pocket as a card, shared by the hero's Next target and the list so both use one vocabulary.
// Its own file so the hero does not import from the list. The whole card is the link.

import { Link } from 'react-router-dom';
import {
 StatusSquare,
 StatusStar,
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
 pocketMarkIsStar,
 pocketSquareClass,
 pocketStarTone,
} from '../../../helpers/pocketStatus.ts';
import { PocketStatus } from '../../../types/pocketTypes.ts';

// A figure the contract withheld. Never 0 and never an empty cell: a dash says
// the answer is absent, where 0 would state an amount.
const DASH = '—';

// The average month the server's planInstalment is built on (planSchedule.js),
// so a money gap divided by the plan's daily pace lands in the same days.
const DAYS_PER_MONTH = 30.44;

// The tone shared by the card's word, bar fill and percentage. Not the square's class:
// completed is drawn as a shape with no tone. Colour alone fails colour blindness, so
// every card also prints the word.
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
 // The last day of the board's month, 'YYYY-MM-DD'. The month-end labels print
 // it, because "month end" does not say which month.
 closeDate: string | null;
};

function PocketCard({ pocket, previousRoute, closeDate }: PocketCardPropType) {
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
  planStart,
  planInstalment,
  aheadOfPlan,
  scheduledByClose,
  aheadAtClose,
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

 // How far along the plan's line the pocket stands, in days: the money gap over the plan's
 // daily pace. Only the time levels carry it, and only when the gap points their way.
 // At risk spells "behind" because its word names no direction.
 const planDays =
  aheadOfPlan === null || planInstalment === null || planInstalment <= 0
   ? 0
   : Math.round(Math.abs(aheadOfPlan) / (planInstalment / DAYS_PER_MONTH));

 const statusDays = ((): string => {
  if (level === 'overdue')
   return daysRemaining < 0 ? ` · ${plural(Math.abs(daysRemaining), 'day')}` : '';
  if (planDays === 0 || aheadOfPlan === null) return '';
  if (level === 'ahead' && aheadOfPlan > 0) return ` · ${plural(planDays, 'day')}`;
  if (level === 'behind' && aheadOfPlan < 0) return ` · ${plural(planDays, 'day')}`;
  if (level === 'atRisk' && aheadOfPlan < 0)
   return ` · ${plural(planDays, 'day')} behind`;
  return '';
 })();

 // The row's percentage is not clamped and passes 100 when the goal is passed,
 // which is a fact the label prints. The track is clamped instead, because a
 // fill wider than its rail is a paint error and not a reading.
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

 // The label follows the figure and stops naming a rate when none is left. It matches the
 // pocket detail's pace card and allocation modal, so one number keeps one name.
 const paceLabel = requiredMonthly === null ? 'To settle' : 'Required rate per month';

 // The gap to the plan's line at the month's close, served and signed so the card and the
 // board hero cannot disagree. "Over"/"short", not ahead/behind, which are pace levels.
 // Nothing due is checked before the sign; an exact match is no direction; no window, no line.
 const monthGap: { value: string; note: string | null; tone: string } =
  scheduledByClose === null || aheadAtClose === null
   ? { value: 'No plan window', note: null, tone: '' }
   : scheduledByClose === 0
     ? { value: 'Nothing due', note: null, tone: '' }
     : aheadAtClose < 0
       ? {
          value: amount(Math.abs(aheadAtClose)),
          // States the subtraction: with nothing allocated the figure equals the
          // plan beside it and read as printed twice.
          note: `plan ${amount(scheduledByClose)} less ${amount(allocated)} allocated`,
          tone: 'pocketCard__factValue--short',
         }
       : {
          value: 'Nothing to add',
          note: aheadAtClose === 0 ? null : `${amount(aheadAtClose)} over the plan`,
          tone: 'pocketCard__factValue--over',
         };

 const byClose = closeDate === null ? 'by month end' : `by ${formatCalendarDate(closeDate)}`;

 return (
  <Link
   to={`pockets/${pocketId}`}
   state={{ previousRoute }}
   className={`pocketCard ${uncovered ? 'pocketCard--uncovered' : ''}`.trim()}
  >
   <div className='pocketCard__head'>
    <h3 className='pocketCard__name'>{name}</h3>

    {/* The level is decided on the server and only named here. A reached goal takes a star,
        every other level a square, via the shared helper so all views draw the same mark. */}
    <span className={`pocketCard__status pocketCard__status--${tone}`}>
     {pocketMarkIsStar(level) ? (
      <StatusStar tone={pocketStarTone(level)} />
     ) : (
      <StatusSquare alert={pocketSquareClass(level)} />
     )}
     {POCKET_STATUS_WORD[level]}
     {statusDays}
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
    <span className='pocketCard__allocated'>
     <span className='pocketCard__allocatedLabel'>Allocated:</span>{' '}
     {amount(allocated)}
    </span>
    {/* Both figures are named. "of a" reads oddly on an over-funded pocket
        ("$5.00 of a Target: $1.38"); the wording is the owner's choice. */}
    <span className='pocketCard__target'>
     of a <span className='pocketCard__targetLabel'>Target:</span>{' '}
     {amount(target)}
    </span>
   </p>

   {/* THIS MONTH, against the plan's line at the close of the month. */}
   <dl className='pocketCard__facts'>
    {scheduledByClose !== null && (
     <div className='pocketCard__fact'>
      <dt className='pocketCard__factLabel'>Plan {byClose}</dt>
      <dd className='pocketCard__factValue'>{amount(scheduledByClose)}</dd>
      {/* The line is daily and cumulative, so a plan begun mid-month asks only for its days;
          a small figure is not a month's instalment. */}
      {planInstalment !== null && (
       <dd className='pocketCard__factNote pocketCard__factNote--wrap'>
        total since {formatCalendarDate(planStart)} ·{' '}
        {amount(planInstalment / DAYS_PER_MONTH)} a day
       </dd>
      )}
     </div>
    )}

    <div className='pocketCard__fact'>
     {/* What to put in this month: the line beside it, less what is allocated. */}
     <dt className='pocketCard__factLabel'>To allocate {byClose}</dt>
     <dd className={`pocketCard__factValue ${monthGap.tone}`.trim()}>
      {monthGap.value}
     </dd>
     {monthGap.note !== null && (
      <dd className='pocketCard__factNote pocketCard__factNote--wrap'>
       {monthGap.note}
      </dd>
     )}
    </div>
   </dl>

   {/* THE WHOLE GOAL, against the target and the deadline, under a dashed rule. */}
   <dl className='pocketCard__facts pocketCard__facts--goal'>
    <div className='pocketCard__fact'>
     {/* The same words the board hero and the detail panel use for this figure. */}
     <dt className='pocketCard__factLabel'>
      {isExcess ? 'Over target' : 'Still to allocate'}
     </dt>
     <dd
      className={`pocketCard__factValue ${
       isExcess ? 'pocketCard__factValue--target' : ''
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
     {/* The pace the plan itself set, beside the one the deadline now asks for:
         the ratio of the two is what the status compares. */}
     {requiredMonthly !== null && requiredMonthly > 0 && planInstalment !== null && (
      <dd className='pocketCard__factNote pocketCard__factNote--wrap'>
       planned {amount(planInstalment)} a month on average
      </dd>
     )}
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

   {/* A count, not names: the detail screen lists the accounts. Coverage is a word, since a
       shortfall belongs to an account shared by several pockets, so the card cannot say how
       much of this pocket is unbacked. */}
   <p className='pocketCard__sources'>
    {sourceCount === 0
     ? 'No funding account yet'
     : `Funded by ${plural(sourceCount, 'account')}`}
    {(sourceCount > 0 || uncovered) && (
     <span
      className={`pocketCoverage pocketCoverage--${
       uncovered ? 'uncovered' : 'covered'
      }`}
     >
      {uncovered ? 'Uncovered' : 'Covered'}
     </span>
    )}
   </p>
  </Link>
 );
}

export default PocketCard;
