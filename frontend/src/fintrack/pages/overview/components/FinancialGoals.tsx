// Money promised to goals and how much is set aside. The headline is goalsTotalBalance, not "saved": the
// balance never left its bank account, so "saved" beside freeCash would count it twice. The square has no
// alert level (no due date is published); its scale is the pocket module's, helpers/pocketStatus.ts.

import { Fragment, useState } from 'react';

import { currencyFormat } from '../../../helpers/functions';
import { CardTitle } from '../../../general_components/CardTitle';
import CollapsibleBlock from './CollapsibleBlock';
import AllocationParetoModal from './AllocationParetoModal';
import { CONCENTRATION_MARK, ParetoRow } from './ParetoBar';
import {
 StatusSquare,
 StatusStar,
} from '../../../general_components/boxComponents/BoxComponents';
import {
 POCKET_STATUS_WORD,
 pocketMarkIsStar,
 pocketSquareClass,
 pocketStarTone,
} from '../../../helpers/pocketStatus';
import { ProgressBar } from '../../../general_components/progressBar/ProgressBar';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { useOverviewStore } from '../../../stores/useOverviewStore';
import { monthLabel } from '../helpers/monthLabel';
import { categoryInk, percent } from '../helpers/rankedBreakdown';
import {
 OverviewFinancialGoals,
 OverviewPocketAllocation,
} from '../../../types/overviewTypes';

const formatNumberCountry = CURRENCY_OPTIONS[DEFAULT_CURRENCY];

const NO_FIGURE = '—';

const money = (currency: string, value: number) =>
 currencyFormat(currency, value, formatNumberCountry);

// Class the shared StatusSquare appends, from the pocket module's vocabulary. Only these three are
// reachable: without a due date nothing is overdue or at risk, without a pace nothing is ahead or behind.
type SquareClass = 'neutral' | 'info' | 'unknown';

const squareOf = (goals: OverviewFinancialGoals): SquareClass => {
 // No pocket carries a target, so there is nothing to be short of. An absent
 // target is not a target of zero, which would state that a goal was set and
 // reached.
 if (!goals.goalsTotalTarget) return 'unknown';

 // Zero once every pocket reached its target, since each gap is clamped.
 // 'info', not the bare square: past target is the one reading that points at money the owner can move.
 if (goals.goalsTotalRemaining !== null && goals.goalsTotalRemaining <= 0) {
  return 'info';
 }

 // Under way, which asks nothing of the owner. No half-target warning threshold:
 // nothing declares that rule, and a mark on every early-stage goal set would be
 // learned and ignored.
 return 'neutral';
};

// The pocket module's label for the remainder (PocketCard.tsx:241). Always
// 'Still to allocate': the remainder is clamped at zero per pocket, so the
// 'Over target' branch this had could only ever print beside $0.00.
const remainderLabel = (goalsTotalRemaining: number | null) =>
 goalsTotalRemaining === null ? 'Remaining' : 'Still to allocate';

// The reading beside the square: the pocket card's overall progress, served.
const progressLine = (goals: OverviewFinancialGoals) => {
 const { goalsTotalTarget, goalsOverallProgress } = goals;

 if (!goalsTotalTarget || goalsOverallProgress === null) {
  return 'no pocket carries a target yet';
 }

 return `${goalsOverallProgress.toFixed(1)}% overall progress`;
};

// The server's running shares as ParetoBar rows. A pocket's own share is the
// difference from the row above and never its amount over the total, the rule
// ExpenseByCategory.tsx:33-38 states for the same kind of figure.
const toParetoRows = (allocation: OverviewPocketAllocation[]): ParetoRow[] =>
 allocation.map((pocket, index) => ({
  key: String(pocket.pocketId),
  label: pocket.name,
  amount: pocket.amount,
  share:
   pocket.cumulativeShare -
   (index === 0 ? 0 : allocation[index - 1].cumulativeShare),
  cumulativeShare: pocket.cumulativeShare,
  // The board's mark and word, beside the name and not in the bar's colour,
  // which already says which pocket a segment is.
  status: pocket.level ? (
   <>
    {pocketMarkIsStar(pocket.level) ? (
     <StatusStar tone={pocketStarTone(pocket.level)} />
    ) : (
     <StatusSquare alert={pocketSquareClass(pocket.level)} />
    )}
    {POCKET_STATUS_WORD[pocket.level]}
   </>
  ) : undefined,
 }));

// Three names at most; the rest are counted.
const CONCENTRATION_NAMES = 3;

// One pocket named in the line: share null for a lone pocket, ink null for the
// counted rest, which spans several segments.
type ConcentrationItem = {
 key: string;
 label: string;
 share: number | null;
 ink: string | null;
};

// The largest pockets until they hold 80%, each with its share and its bar segment's ink.
// A lone pocket takes no parenthesis, because its share is the headline.
const concentrationOf = (rows: ParetoRow[]) => {
 const cut = rows.findIndex((row) => row.cumulativeShare >= CONCENTRATION_MARK);
 if (cut === -1) return null;

 const held = rows.slice(0, cut + 1);
 const heldShare = held[cut].cumulativeShare;

 if (held.length === 1) {
  const items: ConcentrationItem[] = [
   { key: held[0].key, label: held[0].label, share: null, ink: categoryInk(0) },
  ];
  return { heldShare, items };
 }

 const named = held.slice(0, CONCENTRATION_NAMES);
 const items: ConcentrationItem[] = named.map((row, index) => ({
  key: row.key,
  label: row.label,
  share: row.share,
  ink: categoryInk(index),
 }));
 const rest = held.length - named.length;
 if (rest > 0) {
  items.push({
   key: 'rest',
   label: `${rest} more`,
   share: heldShare - named[named.length - 1].cumulativeShare,
   ink: null,
  });
 }

 return { heldShare, items };
};

function FinancialGoals() {
 const financialGoals = useOverviewStore((state) => state.financialGoals);
 const referenceMonth = useOverviewStore((state) => state.referenceMonth);
 const currentMonth = useOverviewStore((state) => state.currentMonth);

 // Above the early return, which a hook cannot follow.
 const [isParetoOpen, setIsParetoOpen] = useState(false);

 // Nothing has arrived yet: the layout above owns the skeleton and the error with
 // its retry, so there is no second spinner here.
 if (!financialGoals) return null;

 const {
  goalsTotalBalance,
  goalsTotalTarget,
  goalsTotalRemaining,
  allocationByPocket,
  currency,
 } = financialGoals;

 // Every figure here is cumulative over every pocket, cut at the close of the
 // month picked above; in the running month that cut is today.
 const isRunningMonth =
  referenceMonth !== null &&
  currentMonth !== null &&
  referenceMonth.slice(0, 7) === currentMonth.slice(0, 7);

 const scope = isRunningMonth
  ? 'All pockets, to date'
  : `All pockets, at the close of ${monthLabel(referenceMonth)}`;

 const rows = toParetoRows(allocationByPocket);
 const concentration = concentrationOf(rows);

 const square = squareOf(financialGoals);

 const amount = (value: number | null) =>
  value === null ? NO_FIGURE : money(currency, value);

 return (
  <CollapsibleBlock
   isRuled
   head={
    /* The scope and the cut, said once for every figure in the card. */
    <CardTitle subtitle={scope}>
     Global Financial Goals
    </CardTitle>
   }
  >
   <section className='domainCards domainCards--single'>
    <article className='snapshot'>
     <div className='snapshot__head'>
      <span className='snapshot__domain'>Allocated to pockets</span>
      <span className='snapshot__period'>Position</span>
     </div>

     {/* Always a number: it counts every pocket, including the ones with no
         target, because money set aside is set aside whether or not it was
         promised to a goal. */}
     <div className='snapshot__actual'>{money(currency, goalsTotalBalance)}</div>

     {/* The overall progress, drawn. Its tone is the square's, so the bar and
         the square cannot disagree; no target, no bar. */}
     {square !== 'unknown' && financialGoals.goalsOverallProgress !== null && (
      <ProgressBar
       value={financialGoals.goalsOverallProgress}
       tone={square}
       label='Allocated against the total target'
      />
     )}

     <div className='snapshot__variance'>
      <StatusSquare alert={square} />
      <span className='snapshot__against'>{progressLine(financialGoals)}</span>
     </div>

     <div className='snapshot__baselines'>
      <div className='snapshot__baseline'>
       <span className='snapshot__label'>Target</span>
       <span className='snapshot__figure'>{amount(goalsTotalTarget)}</span>
       <span className='snapshot__weight'>
        {goalsTotalTarget === null ? 'none set' : 'promised to a goal'}
       </span>
      </div>

      {/* The label is the reading and the caption says what the figure is a part of. 'Saved' is avoided:
          a pocket holds nothing, the balance stays in the bank account it was promised from. */}
      <div className='snapshot__baseline'>
       <span className='snapshot__label'>
        {remainderLabel(goalsTotalRemaining)}
       </span>
       <span className='snapshot__figure'>{amount(goalsTotalRemaining)}</span>
       <span className='snapshot__weight'>
        {goalsTotalTarget === null ? 'no target set' : 'of that target'}
       </span>
      </div>
     </div>

     {/* The allocated money split by pocket, in the Pareto dialog's colours
         and rank. Hidden from screen readers: the line under it states every
         share the bar draws. */}
     {rows.length > 0 && goalsTotalBalance > 0 && (
      <div className='snapshot__composition' aria-hidden='true'>
       {rows.map((row, index) =>
        row.amount > 0 ? (
         <span
          className='snapshot__segment'
          key={row.key}
          style={{
           width: percent(row.share),
           ['--rankedRow-ink' as string]: categoryInk(index),
          }}
         />
        ) : null,
       )}
      </div>
     )}

     {concentration !== null && (
      <p className='snapshot__concentration'>
       {`${percent(concentration.heldShare)} of allocated is in `}
       {concentration.items.map((item, index) => (
        <Fragment key={item.key}>
         {index > 0 &&
          (index === concentration.items.length - 1 ? ' and ' : ', ')}
         <span className='snapshot__pocket'>
          {item.ink !== null && (
           <span
            className='snapshot__swatch'
            aria-hidden='true'
            style={{ ['--rankedRow-ink' as string]: item.ink }}
           />
          )}
          {item.share === null
           ? item.label
           : `${item.label} (${percent(item.share)})`}
         </span>
        </Fragment>
       ))}
      </p>
     )}

     {rows.length > 0 && (
      <button
       type='button'
       className='snapshot__drill'
       onClick={() => setIsParetoOpen(true)}
      >
       View pocket Pareto
       <span className='snapshot__drillArrow' aria-hidden='true'>
        →
       </span>
      </button>
     )}
    </article>
   </section>

   {isParetoOpen && (
    <AllocationParetoModal
     rows={rows}
     currency={currency}
     total={goalsTotalBalance}
     scope={scope}
     onClose={() => setIsParetoOpen(false)}
    />
   )}
  </CollapsibleBlock>
 );
}

export default FinancialGoals;
