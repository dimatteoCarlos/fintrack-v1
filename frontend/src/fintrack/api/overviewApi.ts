// Client for /overview; unwraps the { status, message, data } envelope so callers skip `.data.data`.
// Errors propagate untouched: the month resolver's 422 names the ceiling.

import { authFetch } from '../../auth/auth_utils/authFetch.ts';
import {
 url_get_overview,
 url_get_overview_activity,
 url_get_overview_domain,
} from '../../urlConfig.ts';
import {
 GetOverviewActivityData,
 GetOverviewActivityResponse,
 GetOverviewData,
 GetOverviewDomainData,
 GetOverviewDomainResponse,
 GetOverviewResponse,
 OverviewActivityQuery,
 OverviewAnalysisLevel,
 OverviewDomain,
} from '../types/overviewTypes.ts';

// What the level-2 endpoint narrows by. The domain is not here: it is the path
// segment that selects the calculator, so it is a separate argument.
export type OverviewDomainQuery = {
 month?: string;
 page?: number;
 pageSize?: number;
 analysis?: OverviewAnalysisLevel;
 // One expense category, by name. Expense domain only: the other five answer 400,
 // since an ignored category would be read as the slice that was asked for.
 category?: string;
};

// month is optional and past-only; omitted rather than defaulted because the server resolves the
// current month on the owner's timezone. Sent as a query parameter (GET, no body).
export const getOverviewPage = async (
 month?: string,
): Promise<GetOverviewData> => {
 const { data } = await authFetch<GetOverviewResponse>(url_get_overview, {
  method: 'GET',
  ...(month ? { params: { month } } : {}),
 });

 return data.data;
};

// One domain, one month, one page of movements, optionally with its analysis section.
// analysis is omitted, not sent empty: the level-1 answer has no analysis key.
export const getOverviewDomain = async (
 domain: OverviewDomain,
 query: OverviewDomainQuery = {},
): Promise<GetOverviewDomainData> => {
 const params: Record<string, string> = {};

 if (query.month) params.month = query.month;
 if (query.page) params.page = String(query.page);
 if (query.pageSize) params.pageSize = String(query.pageSize);
 if (query.analysis) params.analysis = query.analysis;
 // Dropped when empty: the schema is strict and refuses a zero-length category,
 // so '' would become a 400.
 if (query.category) params.category = query.category;

 const { data } = await authFetch<GetOverviewDomainResponse>(
  url_get_overview_domain(domain),
  { method: 'GET', params },
 );

 return data.data;
};

// One page of the activity list. Absent keys are dropped, not sent empty: the schema is
// strict and takes no '' for search, so an empty value answers 400.
export const getOverviewActivity = async (
 query: OverviewActivityQuery = {},
): Promise<GetOverviewActivityData> => {
 const params: Record<string, string> = {};

 if (query.from) params.from = query.from;
 if (query.to) params.to = query.to;
 if (query.search) params.search = query.search;
 if (query.movementType) params.movementType = query.movementType;
 if (query.page) params.page = String(query.page);
 if (query.pageSize) params.pageSize = String(query.pageSize);

 const { data } = await authFetch<GetOverviewActivityResponse>(
  url_get_overview_activity,
  { method: 'GET', params },
 );

 return data.data;
};
