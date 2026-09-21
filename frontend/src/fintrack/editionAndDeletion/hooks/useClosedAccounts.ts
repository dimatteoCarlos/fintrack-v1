import { useCallback, useMemo, useState } from 'react';

import { useFetch } from '../../hooks/useFetch.ts';
import { url_closed_accounts } from '../../../urlConfig.ts';

import {
 ClosedAccountOrderType,
 ClosedAccountQueryType,
 ClosedAccountSortKeyType,
 ClosedAccountsResponseType,
} from '../types/closedAccountsTypes.ts';

// One query object drives the request url, so `useFetch` re-runs on any change. Every setter except
// `setPage` resets the page to 1: an old page number means nothing against a new result.

const DEFAULT_QUERY: ClosedAccountQueryType = {
 search: '',
 type: '',
 sort: 'closed_at',
 order: 'desc',
 page: 1,
 limit: 20,
};

export const useClosedAccounts = () => {
 const [query, setQuery] = useState<ClosedAccountQueryType>(DEFAULT_QUERY);

 // Only parameters that differ from the server defaults are sent, keeping the url
 // (which `useFetch` keys its effect on) stable for equivalent queries.
 const requestUrl = useMemo(() => {
  const params = new URLSearchParams();

  if (query.search.trim()) params.set('search', query.search.trim());
  if (query.type) params.set('type', query.type);
  if (query.sort !== DEFAULT_QUERY.sort) params.set('sort', query.sort);
  if (query.order !== DEFAULT_QUERY.order) params.set('order', query.order);
  if (query.page !== 1) params.set('page', String(query.page));
  if (query.limit !== DEFAULT_QUERY.limit) {
   params.set('limit', String(query.limit));
  }

  return url_closed_accounts(params.toString());
 }, [query]);

 const {
  apiData,
  isLoading,
  error,
  refetch,
 } = useFetch<ClosedAccountsResponseType>(requestUrl);

 const data = apiData?.data ?? null;

 const setSearch = useCallback((search: string) => {
  setQuery((previous) => ({ ...previous, search, page: 1 }));
 }, []);

 const setType = useCallback((type: string) => {
  setQuery((previous) => ({ ...previous, type, page: 1 }));
 }, []);

 // Re-selecting the sorted column flips the direction; a new column starts descending
 // (most recent, or last alphabetically, first).
 const setSort = useCallback((sort: ClosedAccountSortKeyType) => {
  setQuery((previous) => ({
   ...previous,
   sort,
   order:
    previous.sort === sort && previous.order === 'desc' ? 'asc' : 'desc',
   page: 1,
  }));
 }, []);

 const setOrder = useCallback((order: ClosedAccountOrderType) => {
  setQuery((previous) => ({ ...previous, order, page: 1 }));
 }, []);

 // Only the lower bound is clamped here; the upper bound is the page count the last
 // response reported (the registry can grow between requests), enforced by the pager.
 const setPage = useCallback(
  (page: number) => {
   setQuery((previous) => ({
    ...previous,
    page: Math.max(1, page),
   }));
  },
  [],
 );

 const setLimit = useCallback((limit: number) => {
  setQuery((previous) => ({ ...previous, limit, page: 1 }));
 }, []);

 const resetFilters = useCallback(() => {
  setQuery(DEFAULT_QUERY);
 }, []);

 // True when a search or type filter is active, so an empty list offers a way back
 // instead of the "nothing closed yet" explanation.
 const isFiltered = Boolean(query.search.trim() || query.type);

 return {
  query,
  isFiltered,
  accountList: data?.accountList ?? [],
  total: data?.total ?? 0,
  pageCount: data?.pageCount ?? 0,
  isLoading,
  error,
  refetch,
  setSearch,
  setType,
  setSort,
  setOrder,
  setPage,
  setLimit,
  resetFilters,
 };
};

export type UseClosedAccountsReturnType = ReturnType<typeof useClosedAccounts>;
