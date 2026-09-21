// One pocket's payload (GET /pocket/:pocketId), shared so hero, sources and history agree.
// A store because every write answers with this payload and repaints without a refetch.
// Only one pocket is held, keyed by id: a map would cache stale answers that the pocketId check refuses.

import { create } from 'zustand';
import { getPocketDetail } from '../api/pocketApi.ts';
import { onAccountChanged, onTransactionRecorded } from './transactionEvents.ts';
import {
 PocketAllocationEntry,
 PocketDetailPayload,
 PocketDetailPocket,
 PocketSource,
} from '../types/pocketTypes.ts';

type PocketDetailState = {
 // Which pocket is in memory. Read before serving: without it, opening pocket 2
 // from pocket 1 renders pocket 1's figures under pocket 2's title for as long
 // as the request is in flight.
 pocketId: number | null;
 // null until the first answer lands. Never a shape of zeroes: a hero of zeroes
 // on screen while the request is on the wire is a pocket reporting that
 // nothing was ever committed to it.
 pocket: PocketDetailPocket | null;
 sources: PocketSource[];
 history: PocketAllocationEntry[];
 notices: string[];
 isLoaded: boolean;
 isLoading: boolean;
 error: string | null;
 // Asks for a pocket. Serves what is in memory when the id matches and an
 // answer already landed; asks otherwise.
 fetchDetail: (pocketId: number) => Promise<void>;
 // Asks again for what is already on screen. A write knows its own answer is
 // obsolete.
 refreshDetail: () => Promise<void>;
 // Takes a write's own response as the new truth. The four writes answer with
 // exactly this payload, so a create, an edit, an allocation or a release
 // repaints the screen without a second round trip.
 setDetail: (detail: PocketDetailPayload) => void;
 // Drops the memo without clearing the screen, so the next fetchDetail asks
 // again.
 invalidate: () => void;
 // Empties it. Called when the screen unmounts, so the next pocket opened
 // cannot flash this one's figures under its title.
 clear: () => void;
};

const emptyDetail = {
 pocketId: null,
 pocket: null,
 sources: [],
 history: [],
 notices: [],
 isLoaded: false,
 isLoading: false,
 error: null,
};

export const usePocketDetailStore = create<PocketDetailState>((set, get) => ({
 ...emptyDetail,

 fetchDetail: async (pocketId: number) => {
  const state = get();

  // Already answered, for this pocket. Walking back from a write and returning
  // to the same screen must not ask again.
  if (state.isLoaded && state.pocketId === pocketId) return;

  // Already on the wire, for this pocket. Guards the double fetch two mounted
  // consumers would issue.
  if (state.isLoading && state.pocketId === pocketId) return;

  // Claim the id before the request goes out and drop what is on screen: the
  // previous pocket's figures under the new title are worse than none.
  set({ ...emptyDetail, pocketId, isLoading: true });

  try {
   const detail = await getPocketDetail(pocketId);

   // The user navigated away, or on to another pocket, while this was in
   // flight. Writing now would paint an answer over the screen that replaced
   // the one that asked for it.
   if (get().pocketId !== pocketId) return;

   set({
    pocket: detail.pocket,
    sources: detail.sources,
    history: detail.history,
    notices: detail.meta.notices,
    isLoaded: true,
    isLoading: false,
    error: null,
   });
  } catch (err: unknown) {
   if (get().pocketId !== pocketId) return;

   // isLoaded is left false, so a remount retries rather than serving a
   // half-written state as the pocket's answer.
   const errorMessage =
    err instanceof Error ? err.message : 'Failed to fetch the pocket';
   console.error('🐷 Error fetching the pocket detail:', errorMessage);
   set({ error: errorMessage, isLoading: false, isLoaded: false });
  }
 },

 refreshDetail: async () => {
  const { pocketId } = get();
  if (pocketId === null) return;

  set({ isLoaded: false, isLoading: false });
  await get().fetchDetail(pocketId);
 },

 setDetail: (detail: PocketDetailPayload) =>
  set({
   pocketId: detail.pocket.pocketId,
   pocket: detail.pocket,
   sources: detail.sources,
   history: detail.history,
   notices: detail.meta.notices,
   isLoaded: true,
   isLoading: false,
   error: null,
  }),

 invalidate: () => set({ isLoaded: false }),

 clear: () => set({ ...emptyDetail }),
}));

// An allocation moves no money, but funding-account balances and uncommitted amounts change on any
// transaction. Dropping the memo is free: the refetch happens only when the pocket is reopened.
onTransactionRecorded(() => {
 usePocketDetailStore.getState().invalidate();
});

// An account edit changes the names this payload prints and can change which
// accounts it can resolve, none of which the transaction path sees; hence both
// subscriptions.
onAccountChanged(() => {
 usePocketDetailStore.getState().invalidate();
});
