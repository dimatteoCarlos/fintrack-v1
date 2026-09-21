// The only frontend client for /pocket; errors propagate untouched (flatten them at display).

import { authFetch } from '../../auth/auth_utils/authFetch.ts';
import {
 url_get_accounts_by_type,
 url_pocket_allocations,
 url_pocket_board,
 url_pocket_create,
 url_pocket_detail,
 url_pocket_releases,
} from '../../urlConfig.ts';
import {
 CreatePocketBody,
 DeletePocketResponse,
 DeletePocketResult,
 EditPocketBody,
 PocketAllocationBody,
 PocketEligibleAccount,
 PocketEligibleAccountsResponse,
 PocketBoardPayload,
 PocketBoardResponse,
 PocketDetailPayload,
 PocketDetailResponse,
} from '../types/pocketTypes.ts';

// month (YYYY-MM) is omitted rather than defaulted: the server resolves the current month on the
// owner's calendar, which a browser clock gets wrong for part of every day.
// Returns the payload; the double destructure unwraps axios and the API envelope.
export const getPocketBoard = async (
 month?: string,
): Promise<PocketBoardPayload> => {
 const { data: body } = await authFetch<PocketBoardResponse>(
  url_pocket_board(month),
  { method: 'GET' },
 );

 return body.data;
};

// One pocket and everything its screen shows. Named pocketId, not accountId: both id sequences
// start at 1, so mixing them returns another record silently. Someone else's pocket and a
// missing one both answer 403, so a caller cannot walk the id space.
export const getPocketDetail = async (
 pocketId: number,
): Promise<PocketDetailPayload> => {
 const { data: body } = await authFetch<PocketDetailResponse>(
  url_pocket_detail(pocketId),
  { method: 'GET' },
 );

 return body.data;
};

// Creates a pocket. The response is the detail payload, not an id, so the caller
// can hand it to the detail store and navigate without a second request.
export const createPocket = async (
 body: CreatePocketBody,
): Promise<PocketDetailPayload> => {
 const { data: responseBody } = await authFetch<PocketDetailResponse>(
  url_pocket_create,
  { method: 'POST', data: body },
 );

 return responseBody.data;
};

// Changes a pocket (same URL as the detail read, different method). The answer carries the
// recomputed figures, since a new target moves the gap and pace, so no second request is needed.
export const editPocket = async (
 pocketId: number,
 body: EditPocketBody,
): Promise<PocketDetailPayload> => {
 const { data: responseBody } = await authFetch<PocketDetailResponse>(
  url_pocket_detail(pocketId),
  { method: 'PATCH', data: body },
 );

 return responseBody.data;
};

// Deletes a pocket and reports the cash released per account, in the server's own figures.
// No money moves: the committed cash returns to the account's unassigned cash.
export const deletePocket = async (
 pocketId: number,
): Promise<DeletePocketResult> => {
 const { data: responseBody } = await authFetch<DeletePocketResponse>(
  url_pocket_detail(pocketId),
  { method: 'DELETE' },
 );

 return responseBody.data;
};

// Commits cash from one account to one goal. Returns the whole detail payload, since one decision
// moves headline, sources and history together. The amount goes out positive; the endpoint owns the sign.
export const allocateToPocket = async (
 pocketId: number,
 body: PocketAllocationBody,
): Promise<PocketDetailPayload> => {
 const { data: responseBody } = await authFetch<PocketDetailResponse>(
  url_pocket_allocations(pocketId),
  { method: 'POST', data: body },
 );

 return responseBody.data;
};

// Releases cash back to the account's unassigned cash. Same body and answer as allocating;
// only the ceiling differs, applied by the server.
export const releaseFromPocket = async (
 pocketId: number,
 body: PocketAllocationBody,
): Promise<PocketDetailPayload> => {
 const { data: responseBody } = await authFetch<PocketDetailResponse>(
  url_pocket_releases(pocketId),
  { method: 'POST', data: body },
 );

 return responseBody.data;
};

// The accounts a commitment may draw on: banks, with committed and uncommitted amounts attached.
// Only banks: the figures mean nothing on an investment (market valuation) or debtor balance,
// so the server withholds them there.
export const getPocketSourceAccounts = async (): Promise<
 PocketEligibleAccount[]
> => {
 const { data: responseBody } =
  await authFetch<PocketEligibleAccountsResponse>(
   `${url_get_accounts_by_type}/?type=bank`,
   { method: 'GET' },
  );

 return responseBody.data.accountList;
};
