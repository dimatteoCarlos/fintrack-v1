import { useCallback, useMemo } from 'react';

import { useFetch } from '../../hooks/useFetch.ts';
import { useFetchLoad } from '../../hooks/useFetchLoad.ts';
import { notifyAccountChanged } from '../../stores/transactionEvents.ts';

import {
 url_account_close_preview,
 url_account_delete,
} from '../../../urlConfig.ts';

import {
 CloseExecutionPayloadType,
 ClosePreviewResponseType,
 CloseDeletionResponseType,
 DELETION_TYPE_CLOSE,
} from '../types/deletionTypes.ts';

// Closes an account; separate from useStandardAccountDeletion because CLOSE reads before it writes (it
// refuses a nonzero balance, so the balance is fetched first) and carries a body: closeReason, which the
// service requires (400 when missing or blank), where SOFT and HARD use the query string.
export const useCloseAccount = (targetAccountId: number | string) => {
 const isValidAccountId = useMemo(
  () => !!targetAccountId && String(targetAccountId).trim().length > 0,
  [targetAccountId],
 );

 // Null while the id is unusable, so useFetch does not fire a request that
 // could only 400.
 const previewUrl = isValidAccountId
  ? url_account_close_preview(targetAccountId)
  : null;

 // The method travels in the body for CLOSE, so no query string here.
 const closeUrl = url_account_delete(targetAccountId);

 const {
  apiData: previewResponse,
  isLoading: isLoadingPreview,
  error: previewError,
 } = useFetch<ClosePreviewResponseType>(previewUrl);

 const targetAccount = previewResponse?.data?.targetAccount ?? null;

 // Null when the preview has not answered yet or came from an older backend
 // without this key; either way there is no impact to state.
 const netWorth = previewResponse?.data?.netWorth ?? null;

 // Null while the preview has not answered; the screen then says nothing about pockets.
 const committedToPockets = previewResponse?.data?.committedToPockets ?? null;

 // Kept as text, never a number: the server sends the balance as the driver
 // returned it so nothing rounds it. It is parsed only for the zero test below.
 const residual = targetAccount?.residual ?? null;

 // CLOSE is a lifecycle operation, not an accounting one: it refuses an account
 // that still holds a balance rather than settling it. A nonzero balance is
 // therefore the reason the request would be refused, not a mere warning.
 //
 // Gated on countsTowardNetWorth, not on residual alone: a category_budget or
 // income_source residual is a nominal-account tally (what was spent or earned
 // through it), not a stock of money sitting there. Requiring it to reach zero
 // applies an asset-account rule to a flow account and would offer a
 // balance-reversal that fabricates a transfer of money never held. Falls back
 // to the residual-only test while netWorth has not answered yet or predates
 // this key.
 const canClose =
  netWorth !== null && !netWorth.countsTowardNetWorth
   ? true
   : residual !== null && parseFloat(residual) === 0;

 const {
  requestFn: executeCloseApiCall,
  isLoading: isClosing,
  data: closeResult,
  error: fetchLoadError,
  resetFn: resetCloseState,
 } = useFetchLoad<CloseDeletionResponseType, CloseExecutionPayloadType>({
  url: closeUrl,
  method: 'DELETE',
 });

 const executeClose = useCallback(
  // reverseBalance defaults to false: a blocking balance is refused rather than
  // silently neutralised, which a caller should never get by omission.
  async (closeReason: string, reverseBalance: boolean = false) => {
   if (!isValidAccountId) {
    return { success: false, message: 'Invalid account ID' };
   }

   // Trimmed here as well as on the server: this check saves a round trip for a
   // reason of spaces, while the server's (matching the schema's CHECK
   // constraint) cannot be bypassed.
   const reason = closeReason.trim();

   if (reason.length === 0) {
    return { success: false, message: 'A reason is required to delete' };
   }

   const payload: CloseExecutionPayloadType = {
    deletionType: DELETION_TYPE_CLOSE,
    closeReason: reason,
    reverseBalance,
   };

   const { data: executionData, error: executionError } =
    await executeCloseApiCall(payload);

   if (executionError || !executionData) {
    return {
     success: false,
     message: executionError || 'Delete failed due to unknown API error',
     error: executionError,
    };
   }

   // Announced, not invalidated directly: this hook has no business knowing
   // which caches hold an answer CLOSE made stale. Without it, a closed
   // category stayed selectable in Tracker Expense and its old budget amount
   // survived on the Budget board.
   notifyAccountChanged();

   return {
    success: true,
    data: executionData,
    message: executionData.message,
    error: null,
   };
  },
  [
   executeCloseApiCall,
   isValidAccountId,
   targetAccountId,
  ],
 );

 return {
  targetAccount,
  residual,
  netWorth,
  committedToPockets,
  canClose,
  isLoadingPreview,
  previewError,
  executeClose,
  isClosing,
  closeResult,
  fetchLoadError,
  resetCloseState,
 };
};

// The page owns this hook (it needs the balance to decide whether the annulment
// is still offered) and passes the result down, so the dialog does not call the
// hook again and request the same preview twice.
export type UseCloseAccountReturnType = ReturnType<typeof useCloseAccount>;

export default useCloseAccount;
