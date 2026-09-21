// The activity list's own query, and the request it produces.

import { useCallback, useEffect, useRef, useState } from 'react';

import { getOverviewActivity } from '../../../api/overviewApi';
import {
 GetOverviewActivityData,
 OverviewActivityMovementType,
} from '../../../types/overviewTypes';

// Default page size: five, the size of the teaser the page already publishes, so
// a reader who touches nothing sees what they saw before.
export const DEFAULT_ACTIVITY_PAGE_SIZE = 5;

// Pause in typing before the term is sent: short enough to feel live, long enough
// that a nine-letter word is one request, not nine.
const SEARCH_DEBOUNCE_MS = 350;

// What the endpoint takes, in the shape the controls bind to. '' and 'all' are
// the two "no narrowing" values because a select and a text input cannot hold
// undefined; they are translated at the edge, in the request builder below.
export type ActivityQueryState = {
 search: string;
 movementType: OverviewActivityMovementType | 'all';
 // 'YYYY-MM' both, or null for an unbounded end.
 from: string | null;
 to: string | null;
 page: number;
 pageSize: number;
};

// Opening period, resolved by the caller: the month on screen is the server's window.currentMonth,
// not the browser clock (a turned-over timezone would ask for a month the page is not showing).
export type ActivityBounds = { from: string | null; to: string | null };

const initialState = (bounds: ActivityBounds): ActivityQueryState => ({
 search: '',
 movementType: 'all',
 from: bounds.from,
 to: bounds.to,
 page: 1,
 pageSize: DEFAULT_ACTIVITY_PAGE_SIZE,
});

// Local state, not a store: this is a transient reader choice, so a clean list on return is right.
// Every narrowing is a request parameter so the counts cover the whole set, not just one page.
export const useOverviewActivity = (initialBounds: ActivityBounds) => {
 const { from: initialFrom, to: initialTo } = initialBounds;

 // A lazy initialiser, so the bounds are read on the first render only: the
 // caller builds the object inline, a new value every render.
 const [query, setQuery] = useState<ActivityQueryState>(() =>
  initialState(initialBounds),
 );
 // The term the request uses, which trails the input's by the debounce above.
 // Two values, so the field never lags the keyboard.
 const [debouncedSearch, setDebouncedSearch] = useState('');

 const [data, setData] = useState<GetOverviewActivityData | null>(null);
 const [isLoading, setIsLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 // Identifies the current request; answers to older ones are discarded because the
 // network may return them out of order and a stale answer could land last.
 const requestId = useRef(0);

 useEffect(() => {
  const timer = setTimeout(() => setDebouncedSearch(query.search.trim()), SEARCH_DEBOUNCE_MS);

  return () => clearTimeout(timer);
 }, [query.search]);

 const { movementType, from, to, page, pageSize } = query;

 // Named so the error state can retry it; the effect below keys on this identity,
 // which changes exactly when the query does.
 const load = useCallback(() => {
  const id = requestId.current + 1;
  requestId.current = id;

  setIsLoading(true);
  setError(null);

  getOverviewActivity({
   // Omitted and not sent empty: the schema is strict and takes no '' for
   // search, so the way to say "no search" is for the key not to be there.
   ...(debouncedSearch ? { search: debouncedSearch } : {}),
   ...(movementType === 'all' ? {} : { movementType }),
   ...(from ? { from } : {}),
   ...(to ? { to } : {}),
   page,
   pageSize,
  })
   .then((answer) => {
    if (requestId.current !== id) return;

    setData(answer);
   })
   .catch((cause: unknown) => {
    if (requestId.current !== id) return;

    setError(
     cause instanceof Error ? cause.message : 'The activity list could not be read.',
    );
   })
   .finally(() => {
    if (requestId.current !== id) return;

    setIsLoading(false);
   });
 }, [debouncedSearch, movementType, from, to, page, pageSize]);

 useEffect(() => {
  load();
 }, [load]);

 // Every narrowing resets the page, and none of the page controls do. Kept in
 // one place because forgetting it on one control is how a reader lands on page
 // 7 of a list that now has 2 and reads the empty answer as "no matches".
 const narrow = useCallback(
  (change: Partial<Omit<ActivityQueryState, 'page'>>) =>
   setQuery((current) => ({ ...current, ...change, page: 1 })),
  [],
 );

 const goToPage = useCallback(
  (next: number) => setQuery((current) => ({ ...current, page: next })),
  [],
 );

 const reset = useCallback(
  () => setQuery(initialState({ from: initialFrom, to: initialTo })),
  [initialFrom, initialTo],
 );

 return { query, data, isLoading, error, narrow, goToPage, reset, refetch: load };
};
