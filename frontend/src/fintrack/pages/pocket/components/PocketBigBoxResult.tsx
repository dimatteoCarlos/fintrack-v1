//-------PocketBigBoxResult---------
//Parent: PocketLayout.tsx (the hero) and Pocket.tsx (the readings)
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import {
 currencyFormat,
 formatBudgetMonthLabel,
} from '../../../helpers/functions';
import { PocketBoardSummary, PocketStatus } from '../../../types/pocketTypes';
import {
 StatusSquare,
 StatusStar,
} from '../../../general_components/boxComponents/BoxComponents';
import {
 POCKET_STATUS_WORD,
 PocketStatusLevel,
 pocketMarkIsStar,
 pocketSquareClass,
 pocketStarTone,
} from '../../../helpers/pocketStatus';
import { KpiTooltip } from '../../../general_components/kpiTooltip/KpiTooltip';
import { usePocketBoardStore } from '../../../stores/usePocketBoardStore';
import PocketFundingAccounts from './PocketFundingAccounts';
// Decorative only, and drawn at --size-glyph-hero: the set is a 0.26 pen on a
// 24 unit grid and stops resolving below 4rem. Each file already carries
// aria-hidden, so none of them reaches the accessibility tree.
import BarChartSvg from '../../../../assets/pocketSvg/barChartSvg.svg?react';
import BullsEyeSvg from '../../../../assets/pocketSvg/bullsEyeSvg.svg?react';
import WalletSvg from '../../../../assets/pocketSvg/walletSvg.svg?react';
import ScaleSvg from '../../../../assets/pocketSvg/scaleSvg.svg?react';
// The portfolio card's own mark. A single continuous stroke, which is what
// keeps it apart from the three filled slabs of the bar chart glyph two rows
// above it on the same panel.
import PulseSvg from '../../../../assets/pocketSvg/pulseSvg.svg?react';
// The accordion chevron, shared with the accounting dashboard's groups: one
// glyph rotated, never two, so the state reads as the same control moved.
import ArrowDownLightSvg from '../../../../assets/ArrowDownLightSvg.svg?react';

// aria-controls targets, declared once because each button and the region it
// opens must agree on the string.
const STATUS_BODY_ID = 'pocketHero-statusBody';
const TARGET_BODY_ID = 'pocketHero-nextTargetBody';
const PORTFOLIO_BODY_ID = 'pocketHero-portfolioBody';
const PROGRESS_BODY_ID = 'pocketHero-progressBody';

// Takes the whole summary. Amounts are nullable because the contract withholds them while the answer
// is pending, with no pocket, or with mixed currencies (never added at an implicit 1:1); not zero.
type PocketHeroPropType = {
 summary: PocketBoardSummary | null;
 // The month every figure is about and the latest month, both YYYY-MM as the
 // server resolved them: the movement line names a past month and must not ask
 // the browser clock.
 referenceMonth: string | null;
 currentMonth: string | null;
 // Why the figures read as dashes, in the server's own words. null when there
 // is nothing to explain.
 notice: string | null;
 // True once the board below is scrolled: the hero keeps its three figures
 // and drops the breakdown under them.
 isCompact: boolean;
};

const MISSING = '—';

// What each reading of the status card means, for the info button beside it.
// The ratio is the pace still required over the pace the plan set
// (pocketLevel.js), so the wording states the thresholds that file declares.
const MARK_DEFINITIONS: Record<PocketStatusLevel | 'uncovered', string> = {
 completed: 'Allocated is exactly the target.',
 aboveTarget:
  'Allocated is more than the target. The extra can be released to other pockets.',
 ahead:
  'Still short of the target, but allocated is above the plan line and the pace still required is under 95% of the pace the plan set.',
 onTrack:
  'The pace still required is within 5% of the pace the plan set, so the plan is being met as written.',
 behind:
  'The pace still required is above the pace the plan set, but under double it.',
 atRisk:
  'The pace still required is at least double the pace the plan set.',
 overdue: 'The deadline has passed and the target is not met.',
 uncovered:
  'Draws on funds that fall short of total commitments.',
};

// The info button of one row, between its word and its count. Its own grid
// cell and not a child of the word: the word clips its overflow and would clip
// the tip with it.
function MarkInfo({ mark }: { mark: PocketStatusLevel | 'uncovered' }) {
 return (
  <span className='pocketHero__markInfo'>
   <KpiTooltip
    label={mark === 'uncovered' ? 'Uncovered' : POCKET_STATUS_WORD[mark]}
    definition={MARK_DEFINITIONS[mark]}
   />
  </span>
 );
}

// An empty level stays on screen but steps back: dropping it breaks the partition
// its heading counts, and full ink would weigh it the same as a populated level.
const markClass = (count: number): string =>
 count === 0 ? 'pocketHero__mark pocketHero__mark--empty' : 'pocketHero__mark';

// Status words come from the shared POCKET_STATUS_WORD, never typed out here, so
// a rename cannot leave the card and the strip disagreeing. They are not
// lower-cased because each one opens its own row.

// Levels that need action to stay inside the plan, most severe first. They are the
// tiers of the Next target list: a passed deadline outranks a pace at least double
// the plan's, which outranks a pace above it.
const ACTION_LEVELS: PocketStatusLevel[] = ['overdue', 'atRisk', 'behind'];

// A tier is a level, or the month: pockets that need nothing by their pace but
// are short of the plan's line at the close of the month.
type TargetTierType = {
 key: string;
 title: string;
 kind: 'level' | 'month';
 rows: PocketStatus[];
};

// Most pressure first within a tier. paceRatio weighs the money missing against the
// time left in one figure; overdue pockets have none, so the money missing ranks them.
const byPressure = (a: PocketStatus, b: PocketStatus) =>
 (b.paceRatio ?? 0) - (a.paceRatio ?? 0) ||
 b.remaining - a.remaining ||
 a.daysRemaining - b.daysRemaining ||
 a.name.localeCompare(b.name);

// Pockets that need action: the three levels first, then the month, since a pocket
// on track or ahead can still be short of its line at the close. Largest shortfall first.
const rankTargets = (pockets: PocketStatus[]): TargetTierType[] => {
 const levelTiers: TargetTierType[] = ACTION_LEVELS.map((level) => ({
  key: level,
  title: POCKET_STATUS_WORD[level],
  kind: 'level',
  rows: pockets.filter((pocket) => pocket.level === level).sort(byPressure),
 }));

 const monthTier: TargetTierType = {
  key: 'shortThisMonth',
  title: 'Short this month',
  kind: 'month',
  rows: pockets
   .filter(
    (pocket) =>
     !ACTION_LEVELS.includes(pocket.level) &&
     pocket.aheadAtClose !== null &&
     pocket.aheadAtClose < 0,
   )
   .sort(
    (a, b) =>
     (a.aheadAtClose ?? 0) - (b.aheadAtClose ?? 0) ||
     a.name.localeCompare(b.name),
   ),
 };

 return [...levelTiers, monthTier].filter((tier) => tier.rows.length > 0);
};

// A negative count is a deadline already passed.
const daysLeftText = (days: number): string =>
 days === 0
  ? 'Due today'
  : days === 1
   ? '1 day left'
   : days > 0
    ? `${days} days left`
    : `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`;

// The board mixes currencies and the server withheld the totals. The hero
// prints the sentence instead of the figures; the readings below stand down for
// the same reason, so one absence is not stated twice in two shapes.
const isWithheld = (summary: PocketBoardSummary | null): boolean =>
 summary !== null && summary.pocketCount > 0 && summary.currency === null;

// The board's headline, the only part of the page that stays in view: the three
// figures and the ratio between them. The reading cards are a separate component
// (PocketBoardReadings) because they scroll under the headline, not pinned to it.
function PocketBigBoxResult({
 summary,
 referenceMonth,
 currentMonth,
 notice,
 isCompact,
}: PocketHeroPropType) {
 const currency_code = summary?.currency ?? DEFAULT_CURRENCY;
 // The locale is the reader's, never the amount's: taken from the amount's own
 // currency, Intl narrows the dollar and the Colombian and Mexican pesos all to
 // '$'.
 const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

 const amount = (value: number | null | undefined) =>
  value === null || value === undefined
   ? MISSING
   : currencyFormat(currency_code, value, formatNumberCountry);

 // The server withheld the totals and said why. The sentence stands where the figures
 // would: dashes above it repeat the absence without saying which kind it is.
 if (notice) {
  return (
   <div className='total__container flex-col-sb'>
    <p className='displayScreen__notice'>{notice}</p>
   </div>
  );
 }

 // Nothing to measure: the sentence replaces the figures. The placeholder rows are hidden but laid
 // out so the box keeps its height. A null summary is not this state: the board has not answered.
 if (summary !== null && summary.pocketCount === 0) {
  return (
   <div className='total__container flex-col-sb'>
    <div className='pocketHero pocketHero--empty'>
     <div className='pocketHero__equation' aria-hidden='true'>
      <div className='pocketHero__tile pocketHero__tile--target'>
       <span className='pocketHero__label'>Required</span>
       <span className='pocketHero__value'>{MISSING}</span>
       <span className='pocketHero__meta'>from 0 of 0 pockets</span>
      </div>
      <div className='pocketHero__tile pocketHero__tile--allocated'>
       <span className='pocketHero__label'>Allocated</span>
       <span className='pocketHero__value'>{MISSING}</span>
       <span className='pocketHero__meta'>No net movement</span>
      </div>
      <div className='pocketHero__tile pocketHero__tile--variance'>
       <span className='pocketHero__label'>Variance</span>
       <span className='pocketHero__value'>{MISSING}</span>
       <span className='pocketHero__meta'>over the plan</span>
      </div>
     </div>

     <p className='pocketHero__empty'>
      No pockets yet. Create one to plan towards a target.
     </p>
    </div>
   </div>
  );
 }

 // The hero measures the schedule, not the lifetime goal: a board exactly on plan can still
 // read 40% against its targets. Only pockets holding a plan window count (scheduledPocketCount),
 // so the committed figure is not totalAllocated. Read at the month's close.
 const scheduledByClose = summary?.totalScheduledByClose ?? null;
 const committedOnPlan = summary?.scheduledPocketsAllocated ?? null;
 const scheduleGap = summary?.totalGapAtClose ?? null;
 const scheduledCount = summary?.scheduledPocketCount ?? 0;

 // The gap by the sign of each pocket's own: what sits above the line and what
 // sits below it. A side with no pocket is left out, not printed as zero.
 const surplus = summary?.surplusAtClose ?? null;
 const surplusCount = summary?.surplusCountAtClose ?? 0;
 const shortfall = summary?.shortfallAtClose ?? null;
 const shortfallCount = summary?.shortfallCountAtClose ?? 0;

 const pocketsWord = (count: number) => (count === 1 ? 'pocket' : 'pockets');

 // The plans require nothing by the close: the ratio has no denominator and the
 // server withholds it.
 const nothingDueYet = scheduledCount > 0 && scheduledByClose === 0;

 // Names the variance side; with nothing due, "over the schedule" would wrongly read as ahead.
 // About three words: the meta line never wraps (it would misalign the tiles) and tiles are ~95px at 360px.
 const scheduleSide = nothingDueYet
  ? 'nothing due yet'
  : scheduleGap === null
    ? null
    : scheduleGap < 0
      ? 'short of the plan'
      : 'over the plan';

 // A past month is named, since "this month" would read as the wrong month. The shared formatter
 // keeps the sentence and the badge above in agreement.
 const monthSuffix =
  referenceMonth === null ||
  currentMonth === null ||
  referenceMonth === currentMonth
   ? ''
   : ` in ${formatBudgetMonthLabel(referenceMonth)}`;

 // The month's movement with its direction in words; a bare signed number cannot say
 // commit from release. null (line absent) when figures are withheld. It uses the net of
 // plan-window pockets, matching the balance above it; "net" since a release can offset an inflow.
 const movement = ((): { text: string; isCommitted: boolean } | null => {
  const movedInMonth = summary?.scheduledPocketsMovedInMonth ?? null;
  if (movedInMonth === null) return null;

  // Zero is a real answer, not an absence; it cannot tell nothing from equal amounts cancelling, so
  // it claims neither.
  if (movedInMonth === 0) {
   return { text: `No net movement${monthSuffix}`, isCommitted: false };
  }

  return movedInMonth > 0
   ? {
      text: `${amount(movedInMonth)} net committed${monthSuffix}`,
      isCommitted: true,
     }
   : {
      text: `${amount(Math.abs(movedInMonth))} net released${monthSuffix}`,
      isCommitted: false,
     };
 })();

 return (
  <div className='total__container flex-col-sb'>
   <div className={`pocketHero${isCompact ? ' pocketHero--compact' : ''}`}>
    {/* Three peer figures: the goal, what is committed against it, and the gap. They
        reconcile as allocated - excess + remaining = target, not as a plain
        subtraction, because the shortfall is clamped per pocket before the server sums it. */}
    {/* Only a board with pockets reaches this markup: the zero-pocket branch
        above returns the sentence in this box's place. */}
    <>
     <div className='pocketHero__equation'>
     {/* Labels must stay short: three tracks at 320px hold about 88px, and longer
         wording forced the row to stack below 480px. */}
     <div className='pocketHero__tile pocketHero__tile--target'>
      {/* Both tiles are cumulative from each plan's creation: this one through
          the close of the month in the stepper, the next through today. The bar
          below names the month, so no label repeats it. */}
      <span className='pocketHero__label'>Required</span>
      <span className='pocketHero__value'>
       {amount(scheduledByClose)}
      </span>

      {/* Which pockets this figure counts: every amount on this row excludes pockets without a plan
          window. "of N pockets", not "N plans", keeps one noun. Both counts are bound to the
          selected month by the server. */}
      {summary !== null && summary.pocketCount > 0 && (
       <span className='pocketHero__meta'>
        from {scheduledCount} of {summary.pocketCount} pockets
       </span>
      )}
     </div>

     <div className='pocketHero__tile pocketHero__tile--allocated'>
      {/* "Allocated", not "committed": this is a balance; commit and release are the acts
          that move it and keep that word, as the movement line's "net committed" does. */}
      <span className='pocketHero__label'>Allocated</span>
      <span className='pocketHero__value'>
       {amount(committedOnPlan)}
      </span>

      {/* The movement line is the hero's only flow figure and appears nowhere
          else on the board. */}
      {movement !== null && (
       <span
        className={`pocketHero__meta pocketHero__meta--movement${
         movement.isCommitted ? ' pocketHero__meta--committed' : ''
        }`}
       >
        {movement.text}
       </span>
      )}
     </div>

     <div className='pocketHero__tile pocketHero__tile--variance'>
      <span className='pocketHero__label'>Variance</span>
      {/* The only signed figure on this row; the line under it is the reading. Unclamped, since
          clamping would erase the side the tile names. */}
      <span
       className={`pocketHero__value${
        scheduleGap === null || nothingDueYet
         ? ''
         : scheduleGap < 0
           ? ' pocketHero__value--under'
           : ' pocketHero__value--over'
       }`}
      >
       {amount(scheduleGap)}
      </span>

      {scheduleSide !== null && (
       <span className='pocketHero__meta'>{scheduleSide}</span>
      )}
     </div>
    </div>

    {/* What the Variance is made of: the pockets above their line and the
        pockets below it, each with its own sum. A side with none is omitted. */}
    {(surplusCount > 0 || shortfallCount > 0) && (
     <p className='pocketHero__reading'>
      {surplusCount > 0 && (
       <>
        <b className='pocketHero__num pocketHero__num--over'>
         +{amount(surplus)}
        </b>{' '}
        over in {surplusCount} {pocketsWord(surplusCount)}
       </>
      )}
      {surplusCount > 0 && shortfallCount > 0 && ' · '}
      {shortfallCount > 0 && (
       <>
        <b className='pocketHero__num pocketHero__num--under'>
         {amount(shortfall)}
        </b>{' '}
        short in {shortfallCount} {pocketsWord(shortfallCount)}
       </>
      )}
     </p>
    )}
     </>
   </div>
  </div>
 );
}

// Cards in the order the pockets are balanced: review, cover the accounts, then commit.
// Reads the store directly, like ListPocket, so the page adds no second path to the
// same figures.
export function PocketBoardReadings() {
 const summary = usePocketBoardStore((state) => state.summary);
 const pockets = usePocketBoardStore((state) => state.pockets);
 // The month the figures above are about and the latest month, read here because
 // the funding accounts card states which of its numbers move with the stepper.
 const referenceMonth = usePocketBoardStore((state) => state.referenceMonth);
 const currentMonth = usePocketBoardStore((state) => state.currentMonth);

 // Each card is closed until asked for, and independently. Which ones are open
 // lives in the URL beside the month and the list's filters, so a pocket opened
 // from a card returns to the board with that card still open.
 const [searchParams, setSearchParams] = useSearchParams();
 const location = useLocation();
 const openCards = searchParams.getAll('open');
 const isProgressOpen = openCards.includes('progress');
 const isPortfolioOpen = openCards.includes('portfolio');
 const isStatusOpen = openCards.includes('status');
 const isTargetOpen = openCards.includes('target');

 // Replaced, not pushed, as the month is: opening a card is not a step the
 // back button should walk through. Merged, so the other params survive.
 const toggleCard = (card: string) =>
  setSearchParams(
   (previous) => {
    const next = new URLSearchParams(previous);
    const cards = next.getAll('open');
    next.delete('open');
    (cards.includes(card)
     ? cards.filter((open) => open !== card)
     : [...cards, card]
    ).forEach((open) => next.append('open', open));
    return next;
   },
   { replace: true },
  );

 // Where a pocket's back arrow returns: this board, open cards and month included.
 const returnRoute = `${location.pathname}${location.search}`;

 // The two monthly paces, read off the store's summary as the hero above reads
 // its own: this component takes the whole payload rather than having figures
 // threaded down to it.
 const totalRequiredMonthly = summary?.totalRequiredMonthly ?? null;
 const totalActualRate = summary?.totalActualRate ?? null;
 const scheduledPocketCount = summary?.scheduledPocketCount ?? 0;

 const currency_code = summary?.currency ?? DEFAULT_CURRENCY;
 // The locale is the reader's, never the amount's: taken from the amount's own
 // currency, Intl narrows the dollar and the Colombian and Mexican pesos all to
 // '$'.
 const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

 const amount = (value: number | null | undefined) =>
  value === null || value === undefined
   ? MISSING
   : currencyFormat(currency_code, value, formatNumberCountry);

 const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? MISSING : `${Math.round(value)}%`;

 // With zero pockets the hero above already states the empty board.
 if (summary === null || isWithheld(summary) || summary.pocketCount === 0)
  return null;

 // Served UNCLAMPED and free to pass 100: the sentence names both operands, so
 // a clamped figure would contradict the division. The fill alone is clamped.
 const adherence = summary.adherenceAtClose;
 // The plans require nothing by the close: the ratio has no denominator and the
 // server withholds it.
 const nothingDueYet =
  summary.scheduledPocketCount > 0 && summary.totalScheduledByClose === 0;
 // Where the plans' line is read: the close of the selected month. "By" and
 // never "in": the ratio is cumulative on both sides.
 const scheduleThrough =
  referenceMonth === null
   ? ''
   : ` by the end of ${formatBudgetMonthLabel(referenceMonth)}`;

 // Served, not folded here. This component used to count the levels itself
 // while the cards read the served flags, so one board could be partitioned two
 // ways; the five counts now come from the same fold the rows come from.
 const levels = summary.levelCounts;
 const targetTiers = rankTargets(pockets);
 const targetCount = targetTiers.reduce((sum, tier) => sum + tier.rows.length, 0);
 // A tier heading over the only tier names nothing the rows do not say.
 const hasSeveralTiers = targetTiers.length > 1;
 // The pockets with a plan window, split by the sign of their gap at the
 // close: what the link to the Plan variance screen states.
 const varianceCount = pockets.filter(
  (pocket) => pocket.aheadAtClose !== null,
 ).length;
 const overCount = pockets.filter(
  (pocket) => pocket.aheadAtClose !== null && pocket.aheadAtClose > 0,
 ).length;
 const shortCount = pockets.filter(
  (pocket) => pocket.aheadAtClose !== null && pocket.aheadAtClose < 0,
 ).length;
 const uncoveredCount = summary.uncoveredCount;
 const targetReached = levels.completed + levels.aboveTarget;
 // Ahead joins the running band, not the finished one: a pocket in front of its
 // plan has not reached its target, which is the criterion this split turns on.
 // The two bands add up to pocketCount.
 const inProgress =
  levels.ahead +
  levels.onTrack +
  levels.behind +
  levels.atRisk +
  levels.overdue;

 // The slack held by pockets at level `ahead`. Its count comes from levelCounts,
 // so the count and the amount share one rule and "3 ahead · $500.00" cannot
 // name three pockets and sum the slack of five.
 const totalAheadOfPlan = summary.totalAheadOfPlan;

 return (
  <div className='pocketHero pocketHero--readings'>
   <div className='pocketHero__cards'>
    {/* The ratio of the hero's Allocated over its Required, as a card so the
        hero keeps its three figures only. The figure rides in the heading, so a
        closed card still states it. */}
    <div className='pocketHero__card'>
     <div className='pocketHero__cardHeadRow'>
      <span className='pocketHero__cardHead'>
       <BarChartSvg className='pocketHero__glyph' />

       <span className='pocketHero__label'>
        Plan progress
        {!nothingDueYet && (
         <>
          {' '}
          (<b>{percent(adherence)}</b>)
         </>
        )}
       </span>
      </span>

      <button
       type='button'
       className={`pocketHero__toggle${isProgressOpen ? ' is-active' : ''}`}
       onClick={() => toggleCard('progress')}
       aria-expanded={isProgressOpen}
       aria-controls={PROGRESS_BODY_ID}
       aria-label={
        isProgressOpen ? 'Collapse plan progress' : 'Expand plan progress'
       }
      >
       <ArrowDownLightSvg className='pocketHero__toggleChevron' />
      </button>
     </div>

     {isProgressOpen && (
      <div className='pocketHero__cardBody' id={PROGRESS_BODY_ID}>
       {/* The label names the DENOMINATOR and the month, never the bare word
           progress: two percentages live on this board measuring different
           things, and one of them unnamed makes the reader work out which. */}
       <p className='pocketHero__progressRow'>
        <span className='pocketHero__progressText'>
         {!nothingDueYet && (
          <>
           <b className='pocketHero__pct'>{percent(adherence)}</b>{' '}
          </>
         )}
         {nothingDueYet
          ? `No plan requires anything${scheduleThrough}`
          : `of what your plans require${scheduleThrough}`}
        </span>
       </p>

       <div
        className='pocketHero__bar'
        role='progressbar'
        aria-label={`Allocated against what the plans require${scheduleThrough}`}
        aria-valuemin={0}
        aria-valuemax={100}
        // Clamped, unlike the label: a progress bar past its maximum is
        // invalid, so the accessible text carries the true figure instead.
        aria-valuenow={adherence === null ? undefined : Math.min(adherence, 100)}
        aria-valuetext={
         adherence === null ? undefined : `${Math.round(adherence)}%`
        }
       >
        {/* No fill while the figure is missing: a width of zero would paint a
            board that committed nothing, which is a different answer. */}
        {adherence !== null && (
         <div
          className={`pocketHero__barFill${
           adherence > 100 ? ' pocketHero__barFill--over' : ''
          }`}
          style={{ width: `${Math.min(adherence, 100)}%` }}
         />
        )}
       </div>
      </div>
     )}
    </div>

    <div className='pocketHero__card'>
     <div className='pocketHero__cardHeadRow'>
      {/* The glyph sits beside the heading, not above it: on its own line it
          costs a row of height for decoration. */}
      <span className='pocketHero__cardHead'>
       <WalletSvg className='pocketHero__glyph' />

       {/* "Pocket status", not "Pockets": what follows is the partition by
           level, not a list of objects. The bracketed figure is the total: the
           two band subtotals under it add up to exactly this one. */}
       <span className='pocketHero__label'>
        Pocket status (<b>{summary.pocketCount}</b>)
       </span>
      </span>

      <button
       type='button'
       className={`pocketHero__toggle${isStatusOpen ? ' is-active' : ''}`}
       onClick={() => toggleCard('status')}
       aria-expanded={isStatusOpen}
       aria-controls={STATUS_BODY_ID}
       aria-label={
        isStatusOpen ? 'Collapse pocket status' : 'Expand pocket status'
       }
      >
       <ArrowDownLightSvg className='pocketHero__toggleChevron' />
      </button>
     </div>

     {/* The body every reading lives in, absent rather than hidden while the
         card is closed: a collapsed card should cost the page its height, not
         just its ink. */}
     {isStatusOpen && (
      <div className='pocketHero__cardBody' id={STATUS_BODY_ID}>
       {/* Reached-target and still-running counts add up to pocketCount (the server evaluates levels top
           down, so no pocket carries two). Every reading prints even at zero, or the partition stops
           adding up. Never colour alone: each square carries its word. */}
       <div className='pocketHero__strip'>
        <span className='pocketHero__group'>
         {/* Named for the outcome, not the mechanism: nobody reads this board
             asking how a pocket was financed. */}
         <span className='pocketHero__groupLabel'>
          Target reached <b>{targetReached}</b>
         </span>

         <span className='pocketHero__marks'>
          <span className={markClass(levels.completed)}>
           {/* A star, not a square, for both reached-goal levels: the shape survives
               colour blindness, which green beside amber does not. */}
           <StatusStar tone='complete' />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.completed}
           </span>
           <MarkInfo mark='completed' />
           <b className='pocketHero__markCount'>{levels.completed}</b>
          </span>

          <span className={markClass(levels.aboveTarget)}>
           <StatusStar tone='info' />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.aboveTarget}

            {/* The surplus, beside the pocket count so it reads as one fact. Absent when nothing passed its
                target. It rides the word, not a line, to save height on a card of seven rows. */}
            {summary.totalExcess !== null && summary.totalExcess > 0 && (
             <span className='pocketHero__markExtra'>
              {amount(summary.totalExcess)} over
             </span>
            )}
           </span>
           <MarkInfo mark='aboveTarget' />
           <b className='pocketHero__markCount'>{levels.aboveTarget}</b>
          </span>
         </span>
        </span>

        {/* Late pockets count here by domain rule: a pocket past its date has neither reached its target
            nor been closed, so it is late, not finished. */}
        <span className='pocketHero__group'>
         <span className='pocketHero__groupLabel'>
          In progress <b>{inProgress}</b>
         </span>

         <span className='pocketHero__marks'>
          {/* First because marks run from the level asking least of the owner to the most. It belongs
              here, not beside "target reached": ahead of the plan is not past the goal. */}
          <span className={markClass(levels.ahead)}>
           <StatusSquare alert={pocketSquareClass('ahead')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.ahead}

            {/* The slack these pockets hold, beside their count, like the surplus
                beside "above target". */}
            {totalAheadOfPlan !== null && totalAheadOfPlan > 0 && (
             <span className='pocketHero__markExtra pocketHero__markExtra--over'>
              {amount(totalAheadOfPlan)} over the plan
             </span>
            )}
           </span>
           <MarkInfo mark='ahead' />
           <b className='pocketHero__markCount'>{levels.ahead}</b>
          </span>

          <span className={markClass(levels.onTrack)}>
           <StatusSquare alert={pocketSquareClass('onTrack')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.onTrack}
           </span>
           <MarkInfo mark='onTrack' />
           <b className='pocketHero__markCount'>{levels.onTrack}</b>
          </span>

          {/* Between on track and at risk, the order the ratio itself climbs in. */}
          <span className={markClass(levels.behind)}>
           <StatusSquare alert={pocketSquareClass('behind')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.behind}
           </span>
           <MarkInfo mark='behind' />
           <b className='pocketHero__markCount'>{levels.behind}</b>
          </span>

          <span className={markClass(levels.atRisk)}>
           <StatusSquare alert={pocketSquareClass('atRisk')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.atRisk}
           </span>
           <MarkInfo mark='atRisk' />
           <b className='pocketHero__markCount'>{levels.atRisk}</b>
          </span>

          <span className={markClass(levels.overdue)}>
           <StatusSquare alert={pocketSquareClass('overdue')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.overdue}
           </span>
           <MarkInfo mark='overdue' />
           <b className='pocketHero__markCount'>{levels.overdue}</b>
          </span>
         </span>
        </span>
       </div>

       {/* Coverage is a separate axis: an uncovered pocket can be at any level, so it joins neither band.
           It prints at zero (a zero row says the board checked) and, like an empty level, steps back
           (word and count off the ink, square at full colour). */}
       <div className='pocketHero__alerts'>
        <span className='pocketHero__marks'>
         {/* Names what failed (the money a pocket says it holds no longer exists), not the pocket. One
             word because the row shares a column with the seven levels above, which supply the subject. */}
         <span className={markClass(uncoveredCount)}>
          <StatusSquare alert={pocketSquareClass('overdue')} />
          <span className='pocketHero__markWord'>Uncovered</span>
          <MarkInfo mark='uncovered' />
          <b className='pocketHero__markCount'>{uncoveredCount}</b>
         </span>
        </span>
       </div>
      </div>
     )}
    </div>

    {/* The accounts funding the pockets: an Uncovered pocket is an overcommitted account
        here. Takes the server's count and requests the rows itself, only once opened,
        since the board's payload does not carry them. */}
    {summary.sourceAccountCount > 0 && (
     <PocketFundingAccounts
      sourceAccountCount={summary.sourceAccountCount}
      overAllocatedAccountCount={summary.overAllocatedAccountCount}
      referenceMonth={referenceMonth}
      currentMonth={currentMonth}
     />
    )}

    {/* Which pockets need money now, ranked. Present at zero like the
        Uncovered row: a count of 0 says the board checked. */}
    <div className='pocketHero__card'>
     {/* The whole heading row is the toggle; every destination is a row. */}
     <button
      type='button'
      className='pocketHero__cardHeadRow pocketHero__cardHeadRow--button'
      onClick={() => toggleCard('target')}
      aria-expanded={isTargetOpen}
      aria-controls={TARGET_BODY_ID}
     >
      <span className='pocketHero__cardHead'>
       <BullsEyeSvg className='pocketHero__glyph' />

       <span className='pocketHero__label'>
        Next target (<b>{targetCount}</b>)
       </span>
      </span>

      <span
       className={`pocketHero__toggle${isTargetOpen ? ' is-active' : ''}`}
       aria-hidden='true'
      >
       <ArrowDownLightSvg className='pocketHero__toggleChevron' />
      </span>
     </button>

     {isTargetOpen && (
      <div className='pocketHero__cardBody' id={TARGET_BODY_ID}>
       {targetCount === 0 ? (
        <p className='pocketHero__cardEmpty'>
         No pocket needs action to stay inside its plan.
        </p>
       ) : (
        <div className='pocketHero__targetList'>
         {targetTiers.map((tier) => (
           <section className='pocketHero__targetTier' key={tier.key}>
            {hasSeveralTiers && (
             <h3 className='pocketHero__targetTierHead'>
              {tier.title} <b>{tier.rows.length}</b>
             </h3>
            )}

            <ul className='pocketHero__targetRows'>
             {tier.rows.map((pocket) => (
              <li key={pocket.pocketId}>
               <Link
                to={`pockets/${pocket.pocketId}`}
                state={{ previousRoute: returnRoute }}
                className='pocketHero__target'
               >
                <span className='pocketHero__targetName'>{pocket.name}</span>

                {/* A month row states what the plan asks by the close. A level
                    row states the pace, or, once the deadline has passed, the
                    whole shortfall due now, as the card does. */}
                <span className='pocketHero__targetMonthly'>
                 {tier.kind === 'month' ? (
                  <span className='pocketHero__targetShort'>
                   {amount(Math.abs(pocket.aheadAtClose ?? 0))}
                  </span>
                 ) : pocket.requiredMonthly === null ? (
                  amount(Math.max(pocket.remaining, 0))
                 ) : (
                  amount(pocket.requiredMonthly)
                 )}{' '}
                 <span className='pocketHero__targetUnit'>
                  {tier.kind === 'month'
                   ? 'to allocate by month end'
                   : pocket.requiredMonthly === null
                     ? 'to settle now'
                     : 'required rate / month'}
                 </span>
                </span>

                <span className='pocketHero__targetDue'>
                 {pocketMarkIsStar(pocket.level) ? (
                  <StatusStar tone={pocketStarTone(pocket.level)} />
                 ) : (
                  <StatusSquare alert={pocketSquareClass(pocket.level)} />
                 )}
                 {daysLeftText(pocket.daysRemaining)}
                </span>

                {/* Clamped: a level row is short of its target. A month row
                    names the reference its amount is short of. */}
                <span className='pocketHero__targetRemaining'>
                 {tier.kind === 'month'
                  ? 'short of the plan'
                  : `${amount(Math.max(pocket.remaining, 0))} to allocate`}
                </span>
               </Link>
              </li>
             ))}
            </ul>
           </section>
          ))}
        </div>
       )}
      </div>
     )}
    </div>

    {/* The chart has its own screen, as Budget's variance does: as a card it
        had the width of the readings and a few rows of height. */}
    <Link
     to={{ pathname: 'variance', search: location.search }}
     className='pocketHero__card pocketHero__card--link'
    >
     <span className='pocketHero__cardHeadRow'>
      <span className='pocketHero__cardHead'>
       <ScaleSvg className='pocketHero__glyph' />

       <span className='pocketHero__label'>
        Plan variance (<b>{varianceCount}</b>)
       </span>
      </span>

      <span className='pocketHero__cardLinkEnd'>
       {overCount} over · {shortCount} short
       <span className='pocketHero__toggle pocketHero__toggle--link' aria-hidden='true'>
        <ArrowDownLightSvg className='pocketHero__toggleChevron' />
       </span>
      </span>
     </span>
    </Link>

    {/* Last: context only, no balancing step starts here. The lifetime pair at its foot
        is the one reading not about the schedule (it measures against the goals), and
        it explains no hero tile. */}
    {/* Its own container: the body splits into two columns on the card's width. */}
    <div className='pocketHero__card pocketHero__card--portfolio'>
     <div className='pocketHero__cardHeadRow'>
      <span className='pocketHero__cardHead'>
       {/* A pulse and not the bar chart the ratio above already wears: two
           identical glyphs read as two views of one thing. It names the STATE
           of the portfolio, which is what this card reads. */}
       <PulseSvg className='pocketHero__glyph pocketHero__glyph--portfolio' />

       {/* No count in the bracket: this card counts only pockets holding a plan window,
           and a bare figure would read as the total number of pockets. */}
       <span className='pocketHero__label pocketHero__label--portfolio'>
        Pocket portfolio
       </span>
      </span>

      <button
       type='button'
       className={`pocketHero__toggle${isPortfolioOpen ? ' is-active' : ''}`}
       onClick={() => toggleCard('portfolio')}
       aria-expanded={isPortfolioOpen}
       aria-controls={PORTFOLIO_BODY_ID}
       aria-label={
        isPortfolioOpen ? 'Collapse pocket portfolio' : 'Expand pocket portfolio'
       }
      >
       <ArrowDownLightSvg className='pocketHero__toggleChevron' />
      </button>
     </div>

     {isPortfolioOpen && (
      <div className='pocketHero__cardBody' id={PORTFOLIO_BODY_ID}>
       {/* No plan to measure is a sentence and not a row of dashes, which would
           claim the arithmetic ran. Zero pockets never reaches this card. */}
       {scheduledPocketCount === 0 ? (
        <p className='pocketHero__cardEmpty'>
         None of your {summary.pocketCount} pockets carries a plan. A target
         and a date are what a pocket is measured against, and this card is
         where that reading lands.
        </p>
       ) : (
        <>
       <div className='pocketHero__portfolio'>
        <div className='pocketHero__plans'>
         <div className='pocketHero__planTile'>
          <span className='pocketHero__planLead'>
           <WalletSvg className='pocketHero__planGlyph' />
           <span className='pocketHero__planText'>
            <b className='pocketHero__planCount'>
             {scheduledPocketCount} of {summary.pocketCount} pockets
            </b>
            <span className='pocketHero__planSub'>with a plan</span>
           </span>
          </span>
         </div>

         {/* The pace to FINISH, never a bill due this month. It starts from what
             is still missing, so what is already allocated is discounted. */}
         <p className='pocketHero__pace'>
          <b className='pocketHero__figure pocketHero__figure--pace'>
           {amount(totalRequiredMonthly)}
          </b>
          <span className='pocketHero__figureWord'>
           / month to finish on time
          </span>
         </p>

         {/* The same pockets' real pace, read against the line above: net
             committed over the months each plan has lived. Omitted when no
             pocket is asked for a pace. */}
         {totalActualRate !== null && (
          <p className='pocketHero__pace'>
           <b className='pocketHero__figure pocketHero__figure--pace'>
            {amount(totalActualRate)}
           </b>
           <span className='pocketHero__figureWord'>
            / month actual pace
           </span>
          </p>
         )}
        </div>
       </div>

       <p className='pocketHero__lifetime'>
        {/* The population is declared because "allocated" appears twice in this card
            against two different totals: scheduled pockets above, every pocket here. */}
        {/* Two lines: the population, then the figures. One sentence wrapped
            with a middot opening its last line. */}
        <span className='pocketHero__lifetimeLine'>
         Lifetime &middot; all{' '}
         <b className='pocketHero__num'>{summary.pocketCount}</b> pockets
        </span>
        {/* The figures take the count's ink and no colour: green and violet
            belong to the schedule reading above, and this line divides by the
            goals. */}
        <span className='pocketHero__lifetimeLine'>
         <b className='pocketHero__num'>{amount(summary.totalAllocated)}</b>{' '}
         allocated of{' '}
         <b className='pocketHero__num'>{amount(summary.totalTarget)}</b> total
         target &middot;{' '}
         {/* The ratio is named: the bar divides by the schedule, this divides by the
             goals, and an unnamed percentage leaves the reader to work out which. */}
         <span className='pocketHero__ratioName'>
          <b className='pocketHero__num'>
           {percent(summary.overallProgress)}
          </b>{' '}
          overall progress
         </span>
        </span>
       </p>
        </>
       )}
      </div>
     )}
    </div>
   </div>
  </div>
 );
}

export default PocketBigBoxResult;
