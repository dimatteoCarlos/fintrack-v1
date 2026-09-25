import { Link, useLocation } from 'react-router-dom';

import {
 CASE_MESSAGES,
 EmptyListCaseType,
 EmptyListKindType,
 KIND_CONFIG,
} from '../trackerMessages';
import { formatCalendarDate, toCalendarDay } from '../../../helpers/functions';
import { isAccountOpenOn } from '../../../hooks/useTransactionDate';

export type EmptyListResolutionType = {
 case: EmptyListCaseType;
 // Both 'YYYY-MM-DD'. earliestOpeningDay is null only in the 'none' case, where
 // the server returned no row to read an opening from.
 chosenDay: string;
 earliestOpeningDay: string | null;
};

type EmptyListNoticePropType = {
 kind: EmptyListKindType;
 // The verb phrase the sentence ends with, e.g. 'record an expense'.
 action: string;
 // Null renders nothing: the list is loading, failed, or has options to offer.
 emptyCase: EmptyListResolutionType | null;
 // True when another notice on the same screen already carries a link. Two links
 // at once read as two alternatives when they are one sequence, so the sentence
 // still states its fact and the screen decides which notice is actionable.
 linkShownElsewhere?: boolean;
};

// Read the same way isAccountOpenOn reads an opening, so the day the sentence
// offers is a day the list does have an option on.
function earliestOpeningOf(
 openingDays: ReadonlyArray<string | Date | null | undefined>,
): string | null {
 let earliest: string | null = null;

 for (const opening of openingDays) {
  if (!opening) continue;

  const openedAt = new Date(opening);
  if (Number.isNaN(openedAt.getTime())) continue;

  const day = toCalendarDay(openedAt);
  if (!earliest || day < earliest) earliest = day;
 }

 return earliest;
}

// isServerEmpty must already be false while loading or after a failed fetch, and
// the openings must come from a completed successful answer only. chosenDay is
// the day the form is about to record on, as 'YYYY-MM-DD'.
export function resolveEmptyCase(
 isServerEmpty: boolean,
 openingDays: ReadonlyArray<string | Date | null | undefined>,
 chosenDay: string,
): EmptyListResolutionType | null {
 if (isServerEmpty) {
  return { case: 'none', chosenDay, earliestOpeningDay: null };
 }

 if (openingDays.length === 0) return null;
 if (openingDays.some((opening) => isAccountOpenOn(opening, chosenDay))) {
  return null;
 }

 return {
  case: 'notOpenOnDay',
  chosenDay,
  earliestOpeningDay: earliestOpeningOf(openingDays),
 };
}

// Styled by the categoryStatus rules in tracker-style.css. The three creation
// screens read previousRoute from the link state for their back arrow and fail
// without it, so this component sends it on every link.
function EmptyListNotice({
 kind,
 action,
 emptyCase,
 linkShownElsewhere = false,
}: EmptyListNoticePropType): JSX.Element | null {
 const { pathname } = useLocation();

 if (!emptyCase) return null;

 const { subject, linkLabel, to, canBackdateOpening } = KIND_CONFIG[kind];
 const { text, withLink } = CASE_MESSAGES[emptyCase.case];

 // Built from the parts of the day label rather than from new Date(label),
 // which is UTC midnight and names the previous day west of UTC.
 const { fact, instruction } = text({
  subject,
  action,
  chosenDay: formatCalendarDate(emptyCase.chosenDay),
  earliestOpeningDay: formatCalendarDate(emptyCase.earliestOpeningDay),
  canBackdateOpening,
 });

 return (
  <div className='categoryStatus categoryStatus--notice'>
   <span className='categoryStatus__text'>
    <strong className='categoryStatus__fact'>{fact}</strong> {instruction}
   </span>
   {withLink(canBackdateOpening) && !linkShownElsewhere && (
    <Link
     className='categoryStatus__link'
     to={to}
     state={{ previousRoute: pathname }}
     viewTransition
    >
     {linkLabel}
    </Link>
   )}
  </div>
 );
}

export default EmptyListNotice;
