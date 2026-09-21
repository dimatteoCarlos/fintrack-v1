import { useCallback, useMemo } from 'react';

import { useFetch } from '../../hooks/useFetch.ts';
import { useFetchLoad } from '../../hooks/useFetchLoad.ts';

import {
  url_account_delete,
  url_report_of_affected_accounts,
} from '../../../urlConfig.ts';

import {
  DELETION_TYPE_RTA,
  ReportResponseType,
  DeletionSuccessDataType,
  RTAExecutionPayloadType,
} from '../types/deletionTypes.ts';

// Loads the impact report for an RTA annulment and executes the deletion.
export const useRTAImpactAndDeletion = (
  targetAccountId: number | string,
  targetAccountName: string,
  // Skips the impact report request when the screen does not render it: the request
  // costs a round trip and its failure sets an error the page reads as a finished operation.
  isReportWanted: boolean = true,
) => {
  const isValidAccountId = useMemo(
    () => !!targetAccountId && String(targetAccountId).trim().length > 0,
    [targetAccountId],
  );
  const getUrl =
    isValidAccountId && isReportWanted
      ? url_report_of_affected_accounts(targetAccountId)
      : null;

  const deletionUrl = url_account_delete(targetAccountId);
  const {
    apiData: reportResponse,
    isLoading: isLoadingReport,
    error: reportError,
  } = useFetch<ReportResponseType>(getUrl);

  const affectedAccountReport = useMemo(
    () => reportResponse?.data?.impactReport || [],
    [reportResponse?.data?.impactReport],
  );

  // The server-folded total is read, not recomputed: a sum over affectedAccountReport
  // is short by the unattributed amount. null (not 0) when absent, since 0 is a real
  // total and a dash is not.
  const totalNetAdjustmentAmount =
    reportResponse?.data?.totalNetAdjustmentAmount ?? null;

  // Zero is the ordinary answer and renders no line, so null and 0 look the same on screen.
  const unattributedAmount = reportResponse?.data?.unattributedAmount ?? null;
  const unattributedTransactionCount =
    reportResponse?.data?.unattributedTransactionCount ?? null;

  // Read from the same response as impactReport rather than from a separate route: the
  // server builds both from one CTE over one population, so they name the same counterparties.
  const relatedAccounts = useMemo(
    () => reportResponse?.data?.relatedAccounts || [],
    [reportResponse?.data?.relatedAccounts],
  );

  // Pockets losing backing from this account; a preview shown before confirmation.
  const pocketImpact = useMemo(
    () => reportResponse?.data?.pocketImpact || [],
    [reportResponse?.data?.pocketImpact],
  );

  const {
    requestFn: executeDeletionApiCall,
    isLoading: isExecutingDeletion,
    data: deletionResult,
    error: fetchLoadError,
    resetFn: resetDeletionState,
  } = useFetchLoad<DeletionSuccessDataType, RTAExecutionPayloadType>({
    url: deletionUrl,
    method: 'DELETE',
  });

  const executeRTAAnnulment = useCallback(async () => {
    if (!targetAccountId || String(targetAccountId).trim().length === 0) {
      return { success: false, message: 'Invalid account ID' };
    }

    // impactReport is not sent: the backend recomputes it inside the locked transaction.
    const payload: RTAExecutionPayloadType = {
      deletionType: DELETION_TYPE_RTA,
      targetAccountName,
    };

    const { data: executionDeletionData, error: executionDeletionError } =
      await executeDeletionApiCall(payload);

    if (executionDeletionError || !executionDeletionData) {
      const errorMessage =
        executionDeletionError || 'Deletion failed due to unknown API ERROR';
      return {
        success: false,
        message: `Failed to execute RTA annulment: ${errorMessage}`,
        error: executionDeletionError,
      };
    }

    return {
      success: true,
      data: executionDeletionData,
      message: `RTA Annulment successful for ${targetAccountName}.`,
      error: null,
    };
  }, [
    affectedAccountReport,
    executeDeletionApiCall,
    targetAccountId,
    targetAccountName,
  ]);

  return {
    affectedAccountReport,
    relatedAccounts,
    totalNetAdjustmentAmount,
    unattributedAmount,
    unattributedTransactionCount,
    pocketImpact,
    isLoadingReport,
    reportError,

    executeRTAAnnulment,

    isExecutingDeletion,
    deletionResult,
    fetchLoadError,
    resetDeletionState,

    targetAccountId,
    targetAccountName,
  };
};
