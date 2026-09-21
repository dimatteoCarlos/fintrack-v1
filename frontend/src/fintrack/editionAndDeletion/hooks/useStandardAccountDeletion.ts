import { useCallback, useMemo } from 'react';

import { useFetchLoad } from '../../hooks/useFetchLoad.ts';

import { url_account_delete } from '../../../urlConfig.ts';

import {
  StandardDeletionMethodType,
  StandardDeletionResponseType,
  StandardExecutionPayloadType,
} from '../types/deletionTypes.ts';

// Soft and hard account deletion. Separate from useRTAImpactAndDeletion on purpose: these
// methods read their type from the DELETE request's query string and need no impact
// report GET, so nothing is fetched on mount.
export const useStandardAccountDeletion = (
  deletionType: StandardDeletionMethodType,
  targetAccountId: number | string,
) => {
  // The method is a query param, not a route.
  const deletionUrl = useMemo(
    () => `${url_account_delete(targetAccountId)}?type=${deletionType}`,
    [targetAccountId, deletionType],
  );

  const {
    requestFn: executeDeletionApiCall,
    isLoading: isExecutingDeletion,
    data: deletionResult,
    error: fetchLoadError,
    resetFn: resetDeletionState,
  } = useFetchLoad<StandardDeletionResponseType, StandardExecutionPayloadType>({
    url: deletionUrl,
    method: 'DELETE',
  });

  const executeStandardDeletion = useCallback(async () => {
    if (!targetAccountId || String(targetAccountId).trim().length === 0) {
      return { success: false, message: 'Invalid account ID' };
    }

    const payload: StandardExecutionPayloadType = { deletionType };

    const { data: executionData, error: executionError } =
      await executeDeletionApiCall(payload);

    if (executionError || !executionData) {
      return {
        success: false,
        message: executionError || 'Deletion failed due to unknown API error',
        error: executionError,
      };
    }

    return {
      success: true,
      data: executionData,
      message: executionData.message,
      error: null,
    };
  }, [deletionType, executeDeletionApiCall, targetAccountId]);

  return {
    executeStandardDeletion,
    isExecutingDeletion,
    deletionResult,
    fetchLoadError,
    resetDeletionState,
  };
};
