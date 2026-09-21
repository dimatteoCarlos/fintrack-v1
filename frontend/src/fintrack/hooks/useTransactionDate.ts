// The chosen day, the days that may be chosen, and the accounts open on it, for four forms.
// The server validates the same window; this only avoids offering what returns a 422.

import { useCallback, useMemo, useState } from 'react';

import { earliestDatableDay, toCalendarDay } from '../helpers/functions';
import { TransactionDatePropsType } from '../general_components/transactionDateTrigger/TransactionDateTrigger';

// Standalone for forms that keep the chosen day in their own state. An account with no
// opening date is admitted, not hidden: the server still refuses it, and hiding would empty the list.
export function isAccountOpenOn(
 accountStartDate: string | Date | null | undefined,
 chosenCalendarDay: string,
): boolean {
 if (!accountStartDate) return true;

 const opening = new Date(accountStartDate);
 if (Number.isNaN(opening.getTime())) return true;

 return toCalendarDay(opening) <= chosenCalendarDay;
}

export function useTransactionDate(disabled = false) {
 const [transactionDate, setTransactionDate] = useState<Date>(() => new Date());

 // Resolved once per mount: the floor of the back-dating window, and today, on
 // the device's calendar.
 const { minDate, maxDate } = useMemo(
  () => ({
   minDate: earliestDatableDay(),
   maxDate: new Date(),
  }),
  [],
 );

 // What the payload carries. Read off the local parts, so a choice made in the
 // evening west of UTC does not arrive as the following day.
 const transactionActualDate = toCalendarDay(transactionDate);

 // An account may take a movement only from its opening day onward. Both sides
 // are YYYY-MM-DD, which compares correctly as text and needs no second Date to
 // disagree with the first.
 const isOpenOnChosenDay = useCallback(
  (accountStartDate: string | Date | null | undefined) =>
   isAccountOpenOn(accountStartDate, transactionActualDate),
  [transactionActualDate],
 );

 const dateProps: TransactionDatePropsType = useMemo(
  () => ({
   date: transactionDate,
   changeDate: setTransactionDate,
   minDate,
   maxDate,
   disabled,
  }),
  [transactionDate, minDate, maxDate, disabled],
 );

 return {
  transactionDate,
  setTransactionDate,
  transactionActualDate,
  isOpenOnChosenDay,
  dateProps,
 };
}
