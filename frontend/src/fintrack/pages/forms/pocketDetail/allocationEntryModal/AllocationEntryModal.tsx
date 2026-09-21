// One pocket allocation decision in full: the decision day and, when a conversion
// ran, the typed figure, the applied rate and its source. A modal because the entry
// is already in hand from the list payload.

import { createPortal } from 'react-dom';

import FxPathwayCard from '../../../../general_components/fxPathwayCard/FxPathwayCard';
import {
 formatCalendarDate,
 numberFormatCurrency,
} from '../../../../helpers/functions';
import { PocketAllocationEntry } from '../../../../types/pocketTypes';
import { sourceAccountLabel } from '../sourceAccountLabel';
import { CurrencyType } from '../../../../types/types';
import { useModalDialog } from '../../../../../hooks/useModalDialog';

import './styles/allocationEntryModal-styles.css';

// A field the payload withheld. Never 0, which would be a figure.
const DASH = '—';

type AllocationEntryModalPropType = {
 entry: PocketAllocationEntry;
 // The pocket's accounting currency: the unit of the stored figure, not the one
 // it was typed in.
 currency: CurrencyType;
 onClose: () => void;
};

function AllocationEntryModal({
 entry,
 currency,
 onClose,
}: AllocationEntryModalPropType) {
 // The sign is the decision. Neither commit nor release moves a balance: they
 // change what is promised, not what is held.
 const isRelease = entry.amount < 0;

 // Handles Escape, focus in and out, scroll lock, inert on #root and the Tab
 // cycle. The title id is generated per instance: a shared constant made two
 // entries opened in one session both name the first heading.
 const { titleId, dialogProps } = useModalDialog({ onClose });

 // Absolute: the word above already carries the direction, and a minus beside
 // "Released" would say it twice.
 const storedAmount = numberFormatCurrency(
  Math.abs(entry.amount),
  2,
  currency,
 );

 return createPortal(
  <div className='allocationEntry__overlay' onClick={onClose}>
   <div
    className='allocationEntry__panel'
    {...dialogProps}
    onClick={(event) => event.stopPropagation()}
   >
    <div className='allocationEntry__header'>
     <h2 className='allocationEntry__title' id={titleId}>
      {isRelease ? 'Released' : 'Committed'}
     </h2>

     <button
      type='button'
      className='allocationEntry__close'
      onClick={onClose}
      aria-label='Close this entry'
     >
      ✕
     </button>
    </div>

    <div className='allocationEntry__hero'>
     <span className='allocationEntry__amount'>{storedAmount}</span>

     {/* The day the decision was taken, not the day the row was written (agreed
         Friday, typed Monday is Friday's). Built from the calendar label the
         server resolved on the owner's clock. */}
     <span className='allocationEntry__stamp'>
      {formatCalendarDate(entry.allocationDate)}
     </span>
    </div>

    <section className='allocationEntry__card'>
     <h3 className='allocationEntry__cardTitle'>Account</h3>

     <div className='allocationEntry__row'>
      <span className='allocationEntry__label'>Source</span>
      <span className='allocationEntry__value'>
       {/* Nameless only for an account erased before account_registry existed;
           what it holds is still counted. */}
       {sourceAccountLabel(entry, DASH)}
      </span>
     </div>

     <div className='allocationEntry__row'>
      <span className='allocationEntry__label'>Direction</span>
      <span className='allocationEntry__value'>
       {isRelease
        ? 'Back to the account as unassigned cash'
        : 'Promised to this goal'}
      </span>
     </div>
    </section>

    <FxPathwayCard
     originalAmount={entry.originalAmount}
     originalCurrency={entry.originalCurrency}
     storedAmount={entry.amount}
     accountingCurrency={currency}
     exchangeRate={entry.exchangeRate}
     exchangeRateTimestamp={entry.exchangeRateTimestamp}
     exchangeRateSource={entry.exchangeRateSource}
    />
   </div>
  </div>,
  document.body,
 );
}

export default AllocationEntryModal;
