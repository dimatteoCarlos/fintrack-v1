// The level-2 request: one domain, one month, one page of its movements.

import { useCallback, useEffect, useRef, useState } from 'react';

import { getOverviewDomain } from '../../../api/overviewApi';
import {
 GetOverviewDomainData,
 OverviewAnalysis,
 OverviewAnalysisLevel,
 OverviewDomain,
} from '../../../types/overviewTypes';

// Larger than the level-1 teaser's five rows: this screen exists to show more.
export const DEFAULT_DOMAIN_PAGE_SIZE = 25;

// The full request reads the analysis and discards the rows; the validator
// refuses a page of zero, so one row is the smallest page it builds.
const FULL_ANALYSIS_PAGE_SIZE = 1;

type DomainQueryState = {
 page: number;
 pageSize: number;
 // The category the list is narrowed to, or null for the whole domain. null and
 // not '', because the request drops an empty value.
 category: string | null;
};

const INITIAL_STATE: DomainQueryState = {
 page: 1,
 pageSize: DEFAULT_DOMAIN_PAGE_SIZE,
 category: null,
};

export type FullAnalysisStatus = 'idle' | 'loading' | 'error';

// An analysis is valid only for the domain and month it was read for, so it is
// held with that scope; an effect clearing it would race the new scope's request.
type HeldAnalysis = {
 scope: string;
 value: OverviewAnalysis;
};

const LEVEL_RANK: Record<OverviewAnalysisLevel, number> = {
 derived: 1,
 full: 2,
};

// A hook, not a store: the answer belongs to one screen. The month lives in the URL (OverviewLayout);
// undefined lets the server resolve the current month. 'derived' paints the screen, 'full' is requested
// when the analysis block comes into view, so its failure is that block's state, not the screen's.
export const useOverviewDomain = (domain: OverviewDomain, month?: string) => {
 const [query, setQuery] = useState<DomainQueryState>(INITIAL_STATE);

 const [data, setData] = useState<GetOverviewDomainData | null>(null);
 const [isLoading, setIsLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 const [held, setHeld] = useState<HeldAnalysis | null>(null);
 const [fullStatus, setFullStatus] = useState<FullAnalysisStatus>('idle');
 const [fullError, setFullError] = useState<string | null>(null);

 // The held analysis, readable inside request callbacks without making every held
 // answer re-create the request and fire it again.
 const heldRef = useRef<HeldAnalysis | null>(null);

 // Which request is the current one, per request kind. An answer that arrives
 // after a newer request of its kind went out is discarded.
 const requestId = useRef(0);
 const fullRequestId = useRef(0);
 // The scope whose full request is on the wire, so a second trigger waits on it.
 const fullInFlight = useRef<string | null>(null);

 const scope = `${domain}|${month ?? 'current'}`;

 // The page resets when the domain or month changes: page 7 of a month that has
 // two pages would answer empty and read as "no movements".
 useEffect(() => {
  setQuery(INITIAL_STATE);
  setFullStatus('idle');
  setFullError(null);
  fullRequestId.current += 1;
  fullInFlight.current = null;
 }, [domain, month]);

 const { page, pageSize, category } = query;

 // Keeps the deeper of two answers for the same scope: a derived answer that
 // lands after the full one must not take its sections away.
 const hold = useCallback((forScope: string, value: OverviewAnalysis) => {
  const current = heldRef.current;

  if (
   current?.scope === forScope &&
   LEVEL_RANK[current.value.level] > LEVEL_RANK[value.level]
  ) {
   return;
  }

  const next = { scope: forScope, value };
  heldRef.current = next;
  setHeld(next);
 }, []);

 const load = useCallback(() => {
  const id = requestId.current + 1;
  requestId.current = id;

  setIsLoading(true);
  setError(null);

  // Once an analysis is held, page steps and narrowings skip it: it does not
  // change with the page.
  const hasAnalysis = heldRef.current?.scope === scope;

  getOverviewDomain(domain, {
   month,
   page,
   pageSize,
   ...(hasAnalysis ? {} : { analysis: 'derived' as const }),
   // Nothing sets it in five of the domains: the screen offers the control only
   // where categories exist.
   ...(category ? { category } : {}),
  })
   .then((answer) => {
    if (requestId.current !== id) return;

    if (answer.analysis) hold(scope, answer.analysis);
    setData(answer);
   })
   .catch((cause: unknown) => {
    if (requestId.current !== id) return;

    setError(
     cause instanceof Error
      ? cause.message
      : 'The domain detail could not be read.',
    );
   })
   .finally(() => {
    if (requestId.current !== id) return;

    setIsLoading(false);
   });
 }, [domain, month, page, pageSize, category, scope, hold]);

 useEffect(() => {
  load();
 }, [load]);

 // Called by any full section when it reaches the viewport, and by every
 // section's retry. One request per scope serves them all: a call while one is
 // in flight, or once the full answer is held, does nothing.
 const requestFullAnalysis = useCallback(() => {
  if (heldRef.current?.scope === scope && heldRef.current.value.level === 'full') {
   return;
  }

  if (fullInFlight.current === scope) return;

  const id = fullRequestId.current + 1;
  fullRequestId.current = id;
  fullInFlight.current = scope;

  setFullStatus('loading');
  setFullError(null);

  getOverviewDomain(domain, {
   month,
   page: 1,
   pageSize: FULL_ANALYSIS_PAGE_SIZE,
   analysis: 'full',
  })
   .then((answer) => {
    if (fullRequestId.current !== id) return;

    fullInFlight.current = null;
    if (answer.analysis) hold(scope, answer.analysis);
    setFullStatus('idle');
   })
   .catch((cause: unknown) => {
    if (fullRequestId.current !== id) return;

    setFullError(
     cause instanceof Error
      ? cause.message
      : 'The domain analysis could not be read.',
    );
    fullInFlight.current = null;
    setFullStatus('error');
   });
 }, [domain, month, scope, hold]);

 const goToPage = useCallback(
  (next: number) => setQuery((current) => ({ ...current, page: next })),
  [],
 );

 // Changing the size resets the page: page 7 of a list at five rows is past the
 // end of the same list at fifty.
 const setPageSize = useCallback(
  (next: number) =>
   setQuery((current) => ({ ...current, page: 1, pageSize: next })),
  [],
 );

 // Narrowing resets the page too: page 7 of the domain is past the end of nearly
 // every single category, and the empty answer would read as "no movements".
 const narrowToCategory = useCallback(
  (next: string | null) =>
   setQuery((current) => ({ ...current, page: 1, category: next })),
  [],
 );

 return {
  query,
  data,
  // Null until an answer for THIS domain and month carries one.
  analysis: held?.scope === scope ? held.value : null,
  isLoading,
  error,
  fullStatus,
  fullError,
  goToPage,
  setPageSize,
  narrowToCategory,
  refetch: load,
  requestFullAnalysis,
 };
};
