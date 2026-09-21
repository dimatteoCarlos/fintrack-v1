// Holds the pocket board payload (GET /pocket/board), fetched once per month and shared by header and list.
// A store, not a route context: the detail route sits beside the layout, so opening a pocket
// unmounts the layout and the walk back must not cost a request.

import axios from 'axios';
import { create } from 'zustand';
import { getPocketBoard } from '../api/pocketApi.ts';
import { onAccountChanged, onTransactionRecorded } from './transactionEvents.ts';
import { PocketBoardSummary, PocketStatus } from '../types/pocketTypes.ts';

type PocketBoardState = {
 // null until the first answer lands, so a zeroed summary never shows while the request is in flight.
 summary: PocketBoardSummary | null;
 pockets: PocketStatus[];
 notices: string[];
 // The month the figures are about as the server resolved it (the stepper's label);
 // not what was asked for, since the first request asks for nothing.
 referenceMonth: string | null;
 // The latest month that may be asked for; not referenceMonth (reading August does not make it the latest).
 currentMonth: string | null;
 // The one date every figure was computed at. Served, never derived.
 evaluationDate: string | null;
 // The back arrow's floor (YYYY-MM): the month the earliest plan was made in, derived because the
 // payload carries none (see earliestPlan). Only moves earlier, never cleared: recomputing from
 // an empty earlier month would drop the floor and let the reader walk back forever.
 earliestPlanMonth: string | null;
 // What is in memory, keyed as it was asked for; 'current' is the omitted month, distinct from the
 // current month spelled out.
 loadedMonth: string | null;
 // What is on the wire, same key. The LAST ASKED month must win, not the last to arrive:
 // a held-down arrow fires several requests, and older answers are discarded on arrival.
 requestedMonth: string | null;
 isLoading: boolean;
 error: string | null;
 fetchBoard: (month?: string) => Promise<void>;
 // Asks again for the month on screen; avoids making correctness depend on callers ordering
 // invalidate() and a fetchBoard call the guard may refuse.
 refreshBoard: () => Promise<void>;
 invalidate: () => void;
};

const monthKey = (month?: string) => month ?? 'current';

// axios leaves the server's own sentence in the response body, so an unwrapped Error carries only
// the status number. The reason lives in `message`; the status stays beside it (401 and 500 differ).
const failureText = (err: unknown): string => {
 if (axios.isAxiosError(err)) {
  const served = (err.response?.data as { message?: string } | undefined)
   ?.message;
  const status = err.response?.status;

  // No response at all: the request never reached an answer. It is not a
  // server error and must not be reported as one — the server is unreachable,
  // refusing the origin, or the request was cancelled.
  if (status === undefined) return `No answer from the server (${err.message})`;

  return served ? `${status} · ${served}` : `${status} · ${err.message}`;
 }

 return err instanceof Error ? err.message : 'Failed to fetch the pocket board';
};

// The earliest plan month on this answer, never later than what is held. Sliced from planStart, not a
// parsed Date (UTC midnight lands in the previous month west of UTC). A row without planStart is
// skipped: `.slice` on it would turn a good 200 into a failed fetch.
const earliestPlan = (held: string | null, rows: PocketStatus[]) =>
 rows.reduce((earliest, row) => {
  const planStart: string | undefined = row.planStart;
  if (!planStart) return earliest;

  const month = planStart.slice(0, 7);

  return earliest === null || month < earliest ? month : earliest;
 }, held);

export const usePocketBoardStore = create<PocketBoardState>((set, get) => ({
 summary: null,
 pockets: [],
 notices: [],
 referenceMonth: null,
 currentMonth: null,
 evaluationDate: null,
 earliestPlanMonth: null,
 loadedMonth: null,
 requestedMonth: null,
 isLoading: false,
 error: null,

 // month is omitted until the reader steps back: the current month resolved by
 // a browser clock lands on the wrong calendar for part of every day.
 fetchBoard: async (month) => {
  const key = monthKey(month);

  // Already answered, or already on the wire for this month: opening a pocket
  // and coming back must not ask again.
  if (get().loadedMonth === key || get().requestedMonth === key) return;

  set({ requestedMonth: key, isLoading: true, error: null });

  try {
   // The payload, not the envelope: the client unwraps the transport layer so
   // the store never reaches through a status and a message to find pockets.
   const board = await getPocketBoard(month);

   // A month stepped to while this one was on the wire supersedes it. Writing
   // here would paint one month's figures under another month's badge.
   if (get().requestedMonth !== key) return;

   set({
    summary: board.summary,
    pockets: board.pockets,
    notices: board.meta.notices,
    referenceMonth: board.meta.referenceMonth,
    currentMonth: board.meta.currentMonth,
    evaluationDate: board.meta.evaluationDate,
    earliestPlanMonth: earliestPlan(get().earliestPlanMonth, board.pockets),
    loadedMonth: key,
    isLoading: false,
    error: null,
   });
  } catch (err: unknown) {
   if (get().requestedMonth !== key) return;

   // loadedMonth is left untouched, so a remount retries instead of serving a
   // half-written state as the month's answer. requestedMonth IS cleared:
   // otherwise the failed month could never be asked for again.
   const errorMessage = failureText(err);
   console.error('🐷 Error fetching the pocket board:', errorMessage, err);
   set({ error: errorMessage, isLoading: false, requestedMonth: null });
  }
 },

 // Drops the memo without clearing what is on screen, so the next fetchBoard
 // asks again. Nulling requestedMonth also discards an answer already on the
 // wire: it was computed before the write that invalidated it.
 invalidate: () => set({ loadedMonth: null, requestedMonth: null }),

 // Refreshes the month already loaded, not one the caller passes. 'current' maps back to
 // undefined: the literal string is not a month the server can parse.
 refreshBoard: async () => {
  const key = get().loadedMonth ?? get().requestedMonth;

  set({ loadedMonth: null, requestedMonth: null });
  await get().fetchBoard(key === null || key === 'current' ? undefined : key);
 },
}));

// Every pocket figure is derived from a balance, and a balance moves on any
// transaction. Dropping the memo costs no request: the refetch happens only if
// the user opens the board again.
onTransactionRecorded(() => {
 usePocketBoardStore.getState().invalidate();
});

// An account edit changes fields this payload reports (name, note, target,
// deadline) that the transaction path never sees; hence both subscriptions.
onAccountChanged(() => {
 usePocketBoardStore.getState().invalidate();
});
