// Monthly budget payload (POST /budget/accounts/status), fetched once for the three budget levels.
// A store, not a route context: budget/category/:categoryName is declared beside <Layout />, so
// entering a category unmounts the budget layout and any state on its Outlet.

import { create } from 'zustand';
import { getBudgetAccountsStatus } from '../api/budgetApi.ts';
import { onAccountChanged, onTransactionRecorded } from './transactionEvents.ts';
import {
 BudgetAccountStatus,
 BudgetCategoryStatus,
 BudgetStatusTotals,
} from '../types/budgetTypes.ts';

type BudgetStatusState = {
 // The month every figure below is about, as the server resolved it from the
 // owner's timezone. null until the first answer lands: it is read, not assumed.
 referenceMonth: string | null;
 // The latest month that may be asked for, on that same calendar. It is the
 // month selector's upper bound, and it is not referenceMonth: looking at May
 // does not make May the latest month there is.
 currentMonth: string | null;
 accounts: BudgetAccountStatus[];
 categories: BudgetCategoryStatus[];
 totals: BudgetStatusTotals | null;
 notices: string[];
 // What is in memory, keyed the way it was asked for. 'current' is the omitted
 // month, which is a different key from the current month spelled out.
 loadedMonth: string | null;
 // What is on the wire, same key. It is what lets a month picked during another
 // month's request win: the older answer is discarded on arrival instead of the
 // newer request being refused at the door.
 requestedMonth: string | null;
 isLoading: boolean;
 error: string | null;
 fetchStatus: (month?: string) => Promise<void>;
 // Asks again for the month already on screen. A write knows its own answer is
 // obsolete; routing that through invalidate() plus a fetchStatus call the guard
 // may refuse made correctness depend on the caller ordering two statements.
 refreshStatus: () => Promise<void>;
 invalidate: () => void;
};

const monthKey = (month?: string) => month ?? 'current';

export const useBudgetStatusStore = create<BudgetStatusState>((set, get) => ({
 referenceMonth: null,
 currentMonth: null,
 accounts: [],
 categories: [],
 totals: null,
 notices: [],
 loadedMonth: null,
 requestedMonth: null,
 isLoading: false,
 error: null,

 // month is omitted until the user picks one: the current month resolved by a
 // browser clock lands on the wrong calendar for part of every day.
 fetchStatus: async (month) => {
  const key = monthKey(month);

  // Already answered, or already on the wire for this month: walking into a
  // category and back must not ask again. The guard is per month so a month
  // picked during another month's request is not dropped.
  if (get().loadedMonth === key || get().requestedMonth === key) return;

  set({ requestedMonth: key, isLoading: true, error: null });

  try {
   // No accountIds: the omission is what asks for every budget account owned.
   const data = await getBudgetAccountsStatus(undefined, month);

   // A month picked while this one was on the wire supersedes it. Writing here
   // would paint one month's figures under another month's badge.
   if (get().requestedMonth !== key) return;

   set({
    referenceMonth: data.referenceMonth,
    currentMonth: data.meta.currentMonth,
    accounts: data.accounts,
    categories: data.categories,
    totals: data.totals,
    notices: data.meta.notices,
    loadedMonth: key,
    isLoading: false,
    error: null,
   });
  } catch (err: unknown) {
   if (get().requestedMonth !== key) return;

   // loadedMonth is left untouched, so a remount retries instead of serving a
   // half-written state as if it were the month's answer. requestedMonth IS
   // cleared: otherwise the failed month could never be asked for again.
   const errorMessage =
    err instanceof Error ? err.message : 'Failed to fetch budget status';
   console.error('📊 Error fetching budget status:', errorMessage);
   set({ error: errorMessage, isLoading: false, requestedMonth: null });
  }
 },

 // Drops the memo without clearing what is on screen, so the next fetchStatus
 // asks again. Nulling requestedMonth also discards an answer already on the
 // wire: it was computed before the write that invalidated it.
 invalidate: () => set({ loadedMonth: null, requestedMonth: null }),

 // Refreshes the month already loaded, not one the caller passes, which could be a month nobody
 // views. 'current' is the omitted month and maps back to undefined; the server cannot parse it.
 refreshStatus: async () => {
  const key = get().loadedMonth ?? get().requestedMonth;

  set({ loadedMonth: null, requestedMonth: null });

  await get().fetchStatus(key === null || key === 'current' ? undefined : key);
 },
}));

// Spending is derived from transactions, so any write makes this month's answer
// obsolete. Dropping the memo costs no request: the refetch happens only if the
// user opens budget again.
onTransactionRecorded(() => {
 useBudgetStatusStore.getState().invalidate();
});

// An account edit changes fields this payload reports (name, category, nature)
// that the amount path never sees. The editor's budget block invalidates itself
// after writing an amount; this covers every other field.
onAccountChanged(() => {
 useBudgetStatusStore.getState().invalidate();
});
