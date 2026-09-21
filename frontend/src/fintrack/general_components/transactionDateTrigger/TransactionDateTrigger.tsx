// Secondary form action that dates a tracker entry on a day other than today; the date defaults to today.
// The calendar is the shared Datepicker; only the trigger differs, passed in through customInput.

import React from 'react';

import Datepicker from '../datepicker/Datepicker';
import CalendarSvg from '../../../assets/calendarSvg.svg?react';
import { toCalendarDay } from '../../helpers/functions';

import './styles/transactionDateTrigger-styles.css';

// The node the calendar is rendered into. react-datepicker creates it under
// document.body on first open if it is not already there.
const CALENDAR_PORTAL_ID = 'transaction-date-calendar';

export type TransactionDatePropsType = {
 date: Date;
 changeDate: (selectedDate: Date) => void;
 // The window the form allows. Both required here, unlike on Datepicker: a
 // trigger with no bounds would offer days the server refuses.
 minDate: Date;
 maxDate: Date;
 disabled?: boolean;
};

type TriggerButtonPropsType = React.ButtonHTMLAttributes<HTMLButtonElement> & {
 isBackDated?: boolean;
 accessibleLabel?: string;
 dayLabel?: string;
};

// react-datepicker clones this element with its own onClick, so the props
// declared on it here survive alongside them. forwardRef because the library
// anchors the popper on the trigger's node.
const TriggerButton = React.forwardRef<HTMLButtonElement, TriggerButtonPropsType>(
 ({ isBackDated, accessibleLabel, dayLabel, ...props }, ref) => (
  <button
   {...props}
   ref={ref}
   type='button'
   className={`transactionDateTrigger${isBackDated ? ' is-active' : ''}`}
   aria-label={accessibleLabel}
   title={accessibleLabel}
  >
   <CalendarSvg className='transactionDateTrigger__glyph' aria-hidden='true' />

   {/* Always shown, today included: a form that writes a dated row must state the day
       before save. is-active means back-dated and only changes the colour. */}
   <span className='transactionDateTrigger__day'>{dayLabel}</span>
  </button>
 ),
);

TriggerButton.displayName = 'TransactionDateTriggerButton';

function TransactionDateTrigger({
 date,
 changeDate,
 minDate,
 maxDate,
 disabled,
}: TransactionDatePropsType) {
 // Compared as calendar days, never as instants: two Dates in the same day are
 // not equal, and the question here is which day the entry names.
 const isBackDated = toCalendarDay(date) !== toCalendarDay(new Date());

 const accessibleLabel = `Transaction date: ${date.toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
 })}`;

 // No year: the window never leaves the current month, so the month and the day
 // say everything the row can vary by. The year stays in the accessible name.
 const dayLabel = date.toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
 });

 // No "back to today" button: the trigger opens the calendar, where today is one cell
 // away, and the amount field has no room for a second control. The calendar itself
 // enforces maxDate, which matters for a form left open past midnight.
 return (
  <span className='transactionDateControl'>
   <Datepicker
    date={date}
    changeDate={changeDate}
    minDate={minDate}
    maxDate={maxDate}
    // Portalled to document.body: the tracker card's transform makes it the containing block for
    // position: fixed, and its overflow rules would centre the calendar on the card and clip it.
    withPortal
    portalId={CALENDAR_PORTAL_ID}
    customInput={
     <TriggerButton
      isBackDated={isBackDated}
      accessibleLabel={accessibleLabel}
      dayLabel={dayLabel}
      disabled={disabled}
     />
    }
   />
  </span>
 );
}

const MemoizedTransactionDateTrigger = React.memo(TransactionDateTrigger);

MemoizedTransactionDateTrigger.displayName = 'TransactionDateTrigger';

export default MemoizedTransactionDateTrigger;
