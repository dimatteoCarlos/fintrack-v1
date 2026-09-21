// Pocket board hero (PocketBigBoxResult) and reading cards (PocketBoardReadings).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import {
 currencyFormat,
 formatBudgetMonthLabel,
} from '../../../helpers/functions';
import { PocketBoardSummary, PocketStatus } from '../../../types/pocketTypes';
import {
 StatusSquare,
 StatusTick,
} from '../../../general_components/boxComponents/BoxComponents';
import {
 POCKET_STATUS_WORD,
 pocketSquareClass,
} from '../../../helpers/pocketStatus';
import { usePocketBoardStore } from '../../../stores/usePocketBoardStore';
import PocketFundingAccounts from './PocketFundingAccounts';
// Decorative glyphs drawn at --size-glyph-hero: the set is a 0.26 pen on a 24
// unit grid and stops resolving below 4rem. Each file carries aria-hidden; the
// one beside the progress bar is the exception and the stylesheet states why.
import BarChartSvg from '../../../../assets/pocketSvg/barChartSvg.svg?react';
import BullsEyeSvg from '../../../../assets/pocketSvg/bullsEyeSvg.svg?react';
import WalletSvg from '../../../../assets/pocketSvg/walletSvg.svg?react';
// The portfolio card's mark: a single continuous stroke, to tell it apart from
// the bar chart glyph's three filled slabs on the same panel.
import PulseSvg from '../../../../assets/pocketSvg/pulseSvg.svg?react';
// The accordion chevron, shared with the accounting dashboard's groups: one
// glyph rotated, never two, so the state reads as the same control moved.
import ArrowDownLightSvg from '../../../../assets/ArrowDownLightSvg.svg?react';

// aria-controls targets, declared once because each button and the region it
// opens must agree on the string.
const STATUS_BODY_ID = 'pocketHero-statusBody';
const TARGET_BODY_ID = 'pocketHero-nextTargetBody';
const PORTFOLIO_BODY_ID = 'pocketHero-portfolioBody';

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
};

const MISSING = '—';

// A level with nothing in it stays on screen but stepped back: dropping it breaks
// the partition its heading counts and hides whether a level is absent or empty,
// while full ink would give an empty level the same weight as a populated one.
const markClass = (count: number): string =>
 count === 0 ? 'pocketHero__mark pocketHero__mark--empty' : 'pocketHero__mark';

// Status words come from the shared POCKET_STATUS_WORD, never typed out here, so
// a rename cannot leave the card and the strip disagreeing. They are not
// lower-cased because each one opens its own row.

// Splits the Next target list into tiers; it never cuts the list.
const DUE_SOON_DAYS = 30;

type TargetTiersType = { dueSoon: PocketStatus[]; later: PocketStatus[] };

// The pockets that need money now, ranked. requiredMonthly > 0 is the whole entry
// rule: the server serves 0 once funded and null once overdue. Uncovered pockets
// still enter; backing is another reading.
const rankTargets = (pockets: PocketStatus[]): TargetTiersType => {
 const byNeed = (a: PocketStatus, b: PocketStatus) =>
  (b.requiredMonthly ?? 0) - (a.requiredMonthly ?? 0) ||
  a.daysRemaining - b.daysRemaining ||
  a.name.localeCompare(b.name);

 const needing = pockets
  .filter((pocket) => (pocket.requiredMonthly ?? 0) > 0)
  .sort(byNeed);

 return {
  dueSoon: needing.filter((pocket) => pocket.daysRemaining <= DUE_SOON_DAYS),
  later: needing.filter((pocket) => pocket.daysRemaining > DUE_SOON_DAYS),
 };
};

const daysLeftText = (days: number): string =>
 days === 0 ? 'Due today' : days === 1 ? '1 day left' : `${days} days left`;

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

 const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? MISSING : `${Math.round(value)}%`;

 // The server withheld the totals and said why. The sentence stands where the
 // figures would: dashes above it would repeat the absence without saying which
 // kind it is. Same shape as the budget hero.
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
       <span className='pocketHero__label'>Required to date</span>
       <span className='pocketHero__value'>{MISSING}</span>
       <span className='pocketHero__meta'>from 0 of 0 pockets</span>
      </div>
      <div className='pocketHero__tile pocketHero__tile--allocated'>
       <span className='pocketHero__label'>Allocated to date</span>
       <span className='pocketHero__value'>{MISSING}</span>
       <span className='pocketHero__meta'>No net movement</span>
      </div>
      <div className='pocketHero__tile pocketHero__tile--variance'>
       <span className='pocketHero__label'>Variance</span>
       <span className='pocketHero__value'>{MISSING}</span>
       <span className='pocketHero__meta'>over the schedule</span>
      </div>
     </div>

     <div className='pocketHero__progress' aria-hidden='true'>
      <p className='pocketHero__progressRow'>
       <span className='pocketHero__progressText'>
        <BarChartSvg className='pocketHero__glyph' />{' '}
        <b className='pocketHero__pct'>{MISSING}</b> of what your plans
        required to date
       </span>
      </p>
      <div className='pocketHero__bar'></div>
     </div>

     <p className='pocketHero__empty'>
      No pockets yet. Create one to plan towards a target.
     </p>
    </div>
   </div>
  );
 }

 // The hero measures the schedule, not the lifetime goal. All figures count only pockets holding a
 // plan window (scheduledPocketCount), so the committed figure here is not totalAllocated.
 const scheduledByNow = summary?.totalScheduledByNow ?? null;
 const committedOnPlan = summary?.scheduledPocketsAllocated ?? null;
 const scheduleGap = summary?.totalScheduleGap ?? null;
 // Unclamped, free to pass 100: the card prints both operands, so a clamped figure would contradict
 // the division. Only the fill is clamped, below.
 const adherence = summary?.scheduleAdherence ?? null;
 const scheduledCount = summary?.scheduledPocketCount ?? 0;

 // No instalment is due yet, so the ratio has no denominator and the server withholds it; common
 // for plans made this month, so the bar meets its unknown state on a first render.
 const nothingDueYet = scheduledCount > 0 && scheduledByNow === 0;

 // Names the variance side; with nothing due, "over the schedule" would wrongly read as ahead.
 // About three words: the meta line never wraps (it would misalign the tiles) and tiles are ~95px at 360px.
 const scheduleSide = nothingDueYet
  ? 'nothing due yet'
  : scheduleGap === null
    ? null
    : scheduleGap < 0
      ? 'under the schedule'
      : 'over the schedule';

 // A past month is named, since "this month" would read as the wrong month. The shared formatter
 // keeps the sentence and the badge above in agreement.
 const monthSuffix =
  referenceMonth === null ||
  currentMonth === null ||
  referenceMonth === currentMonth
   ? ''
   : ` in ${formatBudgetMonthLabel(referenceMonth)}`;

 // The current month is read at today, a past month at its close, so the current one is not named.
 // "By", never "in": the ratio is cumulative on both sides, and "in" would suggest one instalment.
 // The movement line keeps "in" because that figure is the month's own.
 const scheduleThrough =
  referenceMonth === null ||
  currentMonth === null ||
  referenceMonth === currentMonth
   ? ' to date'
   : ` by ${formatBudgetMonthLabel(referenceMonth)}`;

 // The month's movement, direction in words. null (line absent) when figures are withheld. Uses the
 // scoped net (plan-window pockets), matching the balance above it; "net" because an inflow may be
 // offset by a release, so a bare "800 committed" would claim a gross.
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
   <div className='pocketHero'>
    {/* Three peer figures rather than one headline with the other two demoted
        into footnotes. */}
    {/* Only a board with pockets reaches this markup: the zero-pocket branch
        above returns the sentence in this box's place. */}
    <>
     <div className='pocketHero__equation'>
     {/* Labels must stay short: three tracks at 320px hold about 88px, and longer
         wording forced the row to stack below 480px. */}
     <div className='pocketHero__tile pocketHero__tile--target'>
      {/* "to date" on this tile and the next, together or on neither: both are cumulative through the
          stepper month's close. The badge names the month; a repeated label would go stale. */}
      <span className='pocketHero__label'>Required to date</span>
      <span className='pocketHero__value'>
       {amount(scheduledByNow)}
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
      {/* "Allocated", not "committed": this is a balance; commit and release are the acts that move it
          and keep that word, as the movement line's "net committed" does. */}
      <span className='pocketHero__label'>Allocated to date</span>
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

    {/* The ratio sits directly under the amounts it divides, so the reader does
        not have to carry them in mind. */}
    <div className='pocketHero__progress'>
     {/* The label names the denominator and the month, never a bare "progress":
         two percentages on this board measure different things. */}
     <p className='pocketHero__progressRow'>
      {/* The figure sits inside the sentence so it is read against the denominator's words and wraps
          on a narrow board instead of colliding with a nowrap label. */}
      <span className='pocketHero__progressText'>
       {/* Inline, not a flex item: an SVG has no baseline, so flex uses its bottom edge and floats it
           above the words. */}
       <BarChartSvg className='pocketHero__glyph' />{' '}
       {!nothingDueYet && (
        <>
         <b className='pocketHero__pct'>{percent(adherence)}</b>{' '}
        </>
       )}
       {nothingDueYet
        ? 'No instalment has fallen due yet'
        : `of what your plans required${scheduleThrough}`}
      </span>
     </p>

     <div
      className='pocketHero__bar'
      role='progressbar'
      aria-label={`Allocated against what the plans required${scheduleThrough}`}
      aria-valuemin={0}
      aria-valuemax={100}
      // Clamped, unlike the label: a value above the maximum is invalid, so aria-valuetext carries
      // the true figure.
      aria-valuenow={adherence === null ? undefined : Math.min(adherence, 100)}
      aria-valuetext={adherence === null ? undefined : `${Math.round(adherence)}%`}
     >
      {/* No fill while the figure is missing (plans made this month), since width zero would look like
          nothing committed. The fill is where clamping happens; the label states the true value. */}
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
     </>
   </div>
  </div>
 );
}

// The reading cards below the hero. Reads the store directly, as ListPocket does: threading props
// through Pocket.tsx would be a second path to the same figures.
export function PocketBoardReadings() {
 const summary = usePocketBoardStore((state) => state.summary);
 const pockets = usePocketBoardStore((state) => state.pockets);
 // The month the figures above are about and the latest month, read here because
 // the funding accounts card states which of its numbers move with the stepper.
 const referenceMonth = usePocketBoardStore((state) => state.referenceMonth);
 const currentMonth = usePocketBoardStore((state) => state.currentMonth);

 // Each card opens independently, in component state rather than the URL (a glance is not shareable).
 // The portfolio card starts closed too: open, it pushes the toolbar below 745px of height at 360px wide.
 const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
 const [isStatusOpen, setIsStatusOpen] = useState(false);
 const [isTargetOpen, setIsTargetOpen] = useState(false);

 // The schedule fold, read off the store's summary as the hero above reads it.
 const totalScheduledByNow = summary?.totalScheduledByNow ?? null;
 const scheduledPocketsAllocated = summary?.scheduledPocketsAllocated ?? null;
 const totalRequiredMonthly = summary?.totalRequiredMonthly ?? null;
 const scheduledPocketCount = summary?.scheduledPocketCount ?? 0;
 const underScheduleCount = summary?.underScheduleCount ?? 0;
 const overScheduleCount = summary?.overScheduleCount ?? 0;
 // Required turns violet only on a real shortfall; a missing operand decides nothing.
 const isBelowRequired =
  scheduledPocketsAllocated !== null &&
  totalScheduledByNow !== null &&
  scheduledPocketsAllocated < totalScheduledByNow;

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

 // Served, not folded here, so the counts and the rows come from the same fold
 // and one board cannot be partitioned two ways.
 const levels = summary.levelCounts;
 const { dueSoon, later } = rankTargets(pockets);
 const targetCount = dueSoon.length + later.length;
 // A tier heading over the only tier names nothing the rows do not say.
 const hasBothTiers = dueSoon.length > 0 && later.length > 0;
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
    {/* First because it is the arithmetic behind the bar above it. The lifetime pair at its foot is the
        one reading not about the schedule (it measures against the goals); it explains no hero tile. */}
    {/* Its own container: the body splits into two columns on the card's width. */}
    <div className='pocketHero__card pocketHero__card--portfolio'>
     <div className='pocketHero__cardHeadRow'>
      <span className='pocketHero__cardHead'>
       {/* A pulse, not the bar chart the ratio above already wears: two identical
           glyphs read as two views of one thing. */}
       <PulseSvg className='pocketHero__glyph pocketHero__glyph--portfolio' />

       {/* No count in the heading, unlike the cards below: this card's population
           is the pockets holding a plan window, and a bare figure would read as
           how many pockets there are. */}
       <span className='pocketHero__label pocketHero__label--portfolio'>
        Pocket portfolio
       </span>
      </span>

      <button
       type='button'
       className={`pocketHero__toggle${isPortfolioOpen ? ' is-active' : ''}`}
       onClick={() => setIsPortfolioOpen((open) => !open)}
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
        {/* The two operands of the ratio as figures. This is why the served
            percentage is unclamped: a reader divides these two by eye. */}
        <div className='pocketHero__balance'>
         <p className='pocketHero__figureRow'>
          <b className='pocketHero__figure pocketHero__figure--allocated'>
           {amount(scheduledPocketsAllocated)}
          </b>
          <span className='pocketHero__figureWord'>Allocated</span>
         </p>

         <p className='pocketHero__figureRow pocketHero__figureRow--required'>
          <b
           className={`pocketHero__figure pocketHero__figure--required${
            isBelowRequired ? ' pocketHero__figure--under' : ''
           }`}
          >
           {amount(totalScheduledByNow)}
          </b>
          <span className='pocketHero__figureWord'>Required</span>
         </p>
        </div>

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

          {/* Both counts print, never one recovered by subtraction. "under" and
              "over schedule", never the classifier's "behind" and "ahead". */}
          <p className='pocketHero__planSchedule'>
           (
           <span className='pocketHero__planSide'>
            <b className='pocketHero__num pocketHero__num--under'>
             {underScheduleCount}
            </b>{' '}
            under
           </span>{' '}
           /{' '}
           <span className='pocketHero__planSide'>
            <b className='pocketHero__num pocketHero__num--over'>
             {overScheduleCount}
            </b>{' '}
            over schedule)
           </span>
          </p>
         </div>

         {/* The pace to FINISH, never a bill due this month. "per month" and not
             "a month", which reads as a duration rather than a rate. */}
         <p className='pocketHero__pace'>
          <b className='pocketHero__figure pocketHero__figure--pace'>
           {amount(totalRequiredMonthly)}
          </b>
          <span className='pocketHero__figureWord'>
           to finish on time (per month)
          </span>
         </p>
        </div>
       </div>

       <p className='pocketHero__lifetime'>
        {/* The population is declared because "allocated" appears twice in this card against different
            totals (scheduled pockets above, every pocket here). Two lines, or a middot opens a line. */}
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
         {/* The ratio is named because two percentages measure different things
             on this board (the bar divides by the schedule, this by the goals);
             the word is the served field's own name. */}
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
       onClick={() => setIsStatusOpen((open) => !open)}
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
           {/* A tick, not a square: the one finished level, off the colour scale. A shape survives colour
               blindness (simulated, five of seven levels sit within 1.11:1). Shared with the board card. */}
           <StatusTick />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.completed}
           </span>
           <b className='pocketHero__markCount'>{levels.completed}</b>
          </span>

          <span className={markClass(levels.aboveTarget)}>
           <StatusSquare alert={pocketSquareClass('aboveTarget')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.aboveTarget}

            {/* The surplus, beside the pocket count so it reads as one fact. Absent when nothing passed its
                target. It rides the word, not a line, to save height on a card of seven rows. */}
            {summary.totalExcess !== null && summary.totalExcess > 0 && (
             <span className='pocketHero__markExtra'>
              {amount(summary.totalExcess)} above
             </span>
            )}
           </span>
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
             <span className='pocketHero__markExtra pocketHero__markExtra--ahead'>
              {amount(totalAheadOfPlan)} ahead
             </span>
            )}
           </span>
           <b className='pocketHero__markCount'>{levels.ahead}</b>
          </span>

          <span className={markClass(levels.onTrack)}>
           <StatusSquare alert={pocketSquareClass('onTrack')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.onTrack}
           </span>
           <b className='pocketHero__markCount'>{levels.onTrack}</b>
          </span>

          {/* Between on track and at risk, the order the ratio itself climbs in. */}
          <span className={markClass(levels.behind)}>
           <StatusSquare alert={pocketSquareClass('behind')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.behind}
           </span>
           <b className='pocketHero__markCount'>{levels.behind}</b>
          </span>

          <span className={markClass(levels.atRisk)}>
           <StatusSquare alert={pocketSquareClass('atRisk')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.atRisk}
           </span>
           <b className='pocketHero__markCount'>{levels.atRisk}</b>
          </span>

          <span className={markClass(levels.overdue)}>
           <StatusSquare alert={pocketSquareClass('overdue')} />
           <span className='pocketHero__markWord'>
            {POCKET_STATUS_WORD.overdue}
           </span>
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
          <b className='pocketHero__markCount'>{uncoveredCount}</b>
         </span>
        </span>
       </div>
      </div>
     )}
    </div>

    {/* Which pockets need money now, ranked. Present at zero like the
        Uncovered row: a count of 0 says the board checked. */}
    <div className='pocketHero__card'>
     {/* The whole heading row is the toggle; every destination is a row. */}
     <button
      type='button'
      className='pocketHero__cardHeadRow pocketHero__cardHeadRow--button'
      onClick={() => setIsTargetOpen((open) => !open)}
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
         No running pocket needs money now.
        </p>
       ) : (
        <div className='pocketHero__targetList'>
         {[
          { title: `Due within ${DUE_SOON_DAYS} days`, rows: dueSoon },
          { title: 'Later', rows: later },
         ]
          .filter((tier) => tier.rows.length > 0)
          .map((tier) => (
           <section className='pocketHero__targetTier' key={tier.title}>
            {hasBothTiers && (
             <h3 className='pocketHero__targetTierHead'>
              {tier.title} <b>{tier.rows.length}</b>
             </h3>
            )}

            <ul className='pocketHero__targetRows'>
             {tier.rows.map((pocket) => (
              <li key={pocket.pocketId}>
               <Link
                to={`pockets/${pocket.pocketId}`}
                className='pocketHero__target'
               >
                <span className='pocketHero__targetName'>{pocket.name}</span>

                <span className='pocketHero__targetMonthly'>
                 {amount(pocket.requiredMonthly)}{' '}
                 <span className='pocketHero__targetUnit'>/ month</span>
                </span>

                <span className='pocketHero__targetDue'>
                 <StatusSquare alert={pocketSquareClass(pocket.level)} />
                 {daysLeftText(pocket.daysRemaining)}
                </span>

                {/* Clamped: a pocket that enters is short of its target. */}
                <span className='pocketHero__targetRemaining'>
                 {amount(Math.max(pocket.remaining, 0))} to allocate
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

    {/* Last: the two cards above are about the pockets, this one about the accounts holding the money.
        It takes the server's folded count and requests its rows itself, only once opened. */}
    {summary.sourceAccountCount > 0 && (
     <PocketFundingAccounts
      sourceAccountCount={summary.sourceAccountCount}
      referenceMonth={referenceMonth}
      currentMonth={currentMonth}
     />
    )}
   </div>
  </div>
 );
}

export default PocketBigBoxResult;
