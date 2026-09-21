// Money promised to goals and how much is set aside. The headline is goalsTotalBalance, not "saved": the
// balance never left its bank account, so "saved" beside freeCash would count it twice. The square has no
// alert level (no due date is published); its scale is the pocket module's, helpers/pocketStatus.ts.

import { currencyFormat } from '../../../helpers/functions';
import { CardTitle } from '../../../general_components/CardTitle';
import CollapsibleBlock from './CollapsibleBlock';
import { StatusSquare } from '../../../general_components/boxComponents/BoxComponents';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from '../../../helpers/constants';
import { useOverviewStore } from '../../../stores/useOverviewStore';
import { monthLabel } from '../helpers/monthLabel';
import { OverviewFinancialGoals } from '../../../types/overviewTypes';

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

 // Not floored: a negative remainder is an owner past the goal. 'info', not the bare square: being past
 // target is notable in the pocket module, as it points at money the owner can move.
 if (goals.goalsTotalRemaining !== null && goals.goalsTotalRemaining <= 0) {
  return 'info';
 }

 // Under way, which asks nothing of the owner. No half-target warning threshold:
 // nothing declares that rule, and a mark on every early-stage goal set would be
 // learned and ignored.
 return 'neutral';
};

// The pocket module's labels for this figure: 'Still to allocate' while short, 'Over target' once passed.
// The sign lives in the label and the figure is absolute, so 'Over target' never sits beside a negative.
const remainderLabel = (goalsTotalRemaining: number | null) => {
 if (goalsTotalRemaining === null) return 'Remaining';

 return goalsTotalRemaining <= 0 ? 'Over target' : 'Still to allocate';
};

// The sentence beside the square states the reading, not the amount (it lives in the baseline row). No
// rate: the server publishes no percentage, and one divided in the browser would be unreproducible.
const coverageLine = (goals: OverviewFinancialGoals) => {
 const { goalsTotalTarget, goalsTotalRemaining } = goals;

 if (!goalsTotalTarget || goalsTotalRemaining === null) {
  return 'no pocket carries a target yet';
 }

 return goalsTotalRemaining <= 0
  ? 'every target is covered'
  : 'some targets are still short';
};

function FinancialGoals() {
 const financialGoals = useOverviewStore((state) => state.financialGoals);
 const referenceMonth = useOverviewStore((state) => state.referenceMonth);

 // Nothing has arrived yet: the layout above owns the skeleton and the error with
 // its retry, so there is no second spinner here.
 if (!financialGoals) return null;

 const { goalsTotalBalance, goalsTotalTarget, goalsTotalRemaining, currency } =
  financialGoals;

 const square = squareOf(financialGoals);

 const amount = (value: number | null) =>
  value === null ? NO_FIGURE : money(currency, value);

 return (
  <CollapsibleBlock
   isRuled
   head={
    /* The nature and the close, said once. It is the same for every figure in
       the card, so it is not repeated inside it. */
    <CardTitle
     subtitle={`Position at the close of ${monthLabel(referenceMonth)}`}
    >
     Financial Goals
    </CardTitle>
   }
  >
   <section className='domainCards domainCards--single'>
    <article className='snapshot'>
     <div className='snapshot__head'>
      <span className='snapshot__domain'>Committed to pockets</span>
      <span className='snapshot__period'>Position</span>
     </div>

     {/* Always a number: it counts every pocket, including the ones with no
         target, because money set aside is set aside whether or not it was
         promised to a goal. */}
     <div className='snapshot__actual'>{money(currency, goalsTotalBalance)}</div>

     <div className='snapshot__variance'>
      <StatusSquare alert={square} />
      <span className='snapshot__against'>{coverageLine(financialGoals)}</span>
     </div>

     <div className='snapshot__baselines'>
      <div className='snapshot__baseline'>
       <span className='snapshot__label'>Target</span>
       <span className='snapshot__figure'>{amount(goalsTotalTarget)}</span>
       <span className='snapshot__weight'>
        {goalsTotalTarget === null ? 'none set' : 'promised to a goal'}
       </span>
      </div>

      {/* The label is the reading; the caption says what the figure is part of. Not floored, but the sign
          is spent on the word, not printed, as on the pocket card: past the goal reads 'Over target'
          and a positive amount. */}
      <div className='snapshot__baseline'>
       <span className='snapshot__label'>
        {remainderLabel(goalsTotalRemaining)}
       </span>
       <span className='snapshot__figure'>
        {goalsTotalRemaining === null
         ? amount(null)
         : amount(Math.abs(goalsTotalRemaining))}
       </span>
       <span className='snapshot__weight'>
        {goalsTotalTarget === null ? 'no target set' : 'of that target'}
       </span>
      </div>
     </div>
    </article>
   </section>
  </CollapsibleBlock>
 );
}

export default FinancialGoals;
