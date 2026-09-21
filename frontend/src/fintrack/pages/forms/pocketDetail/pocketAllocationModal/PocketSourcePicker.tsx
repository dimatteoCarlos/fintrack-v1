// Source picker with two meanings, chosen by the caller: committing draws from every bank (bounded by
// what is uncommitted), releasing only from accounts funding THIS pocket. "Available" is never used
// for the remainder: a pocket blocks no spending, so it would say the owner cannot spend money they can.

import { CurrencyType } from '../../../../types/types.ts';
import { numberFormatCurrency } from '../../../../helpers/functions.ts';

// A figure the payload withheld. Never 0: a zero would state that nothing is
// committed to an account the read could not answer for.
const DASH = '—';

// One picker row, reduced to what it shows; both callers build it from their own
// shape, so the picker never knows which set it is listing.
export type PocketSourceOption = {
 accountId: number;
 accountName: string;
 // The whole balance. Still spendable in full — a commitment is a plan, not a
 // lock.
 balance: number | null;
 // What this account has promised to goals, across all of them.
 committed: number | null;
 // The most this decision can move, in the pocket's accounting currency. Null
 // when the read could not answer for the row, and the caller then leaves the
 // server to apply the real bound.
 ceiling: number | null;
};

type PocketSourcePickerPropType = {
 options: PocketSourceOption[];
 selectedAccountId: number | null;
 onSelect: (accountId: number) => void;
 // The pocket's accounting currency, which every figure below is stated in.
 currency: CurrencyType;
 // What the third column means in this direction, in the owner's words.
 ceilingLabel: string;
 disabled?: boolean;
};

function PocketSourcePicker({
 options,
 selectedAccountId,
 onSelect,
 currency,
 ceilingLabel,
 disabled = false,
}: PocketSourcePickerPropType) {
 const asMoney = (value: number | null) =>
  value === null ? DASH : numberFormatCurrency(value, 2, currency);

 if (options.length === 0) {
  return (
   <p className='pocketAllocation__empty'>
    No account can be used for this yet.
   </p>
  );
 }

 return (
  // A radio group and not a select: the choice carries three figures per option
  // and a native select can show only the label. role and aria-checked are what
  // make a list of buttons announce itself as one choice among several.
  <div className='pocketAllocation__picker' role='radiogroup'>
   {options.map((option) => {
    const isSelected = option.accountId === selectedAccountId;

    return (
     <button
      type='button'
      role='radio'
      aria-checked={isSelected}
      key={`source-${option.accountId}`}
      className={`pocketAllocation__source ${isSelected ? 'is-selected' : ''}`.trim()}
      onClick={() => onSelect(option.accountId)}
      disabled={disabled}
     >
      <span className='pocketAllocation__sourceName'>{option.accountName}</span>

      <span className='pocketAllocation__sourceFigures'>
       <span className='pocketAllocation__sourceFigure'>
        Balance {asMoney(option.balance)}
       </span>

       {/* "Allocated", not "Committed": the same quantity, and the plan strip
           above already says "allocated". */}
       <span className='pocketAllocation__sourceFigure'>
        Allocated {asMoney(option.committed)}
       </span>

       <span className='pocketAllocation__sourceFigure pocketAllocation__sourceFigure--ceiling'>
        {ceilingLabel} {asMoney(option.ceiling)}
       </span>
      </span>
     </button>
    );
   })}
  </div>
 );
}

export default PocketSourcePicker;
