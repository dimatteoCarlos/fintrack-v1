import { FetchResponseType as UseFetchResponseType } from '../../hooks/useFetch';
import { FetchResponseType as UseFetchLoadResponseType } from '../../hooks/useFetchLoad';

// One row of the RTA financial impact report table.
export type ImpactReportRowType = {
  affectedAccountId: number;
  affectedAccountName: string;
  affectedAccountType: string;
  affectedAccountCurrentBalance: number;
  affectedAccountNetAdjustmentAmount: number;
  affectedAccountCurrencyId: number;
  affectedAccountCurrencyCode: string;
};

// One movement type behind a counterparty's interaction count. The counts of a
// row's entries sum to its interactionCount: both count the same rows, grouped
// one level apart on the server.
export type MovementBreakdownEntryType = {
  // The catalog name as movement_types holds it - 'account-opening', 'expense'.
  // Not a label: the dictionary turns it into one at render time.
  movementTypeName: string;
  count: number;
};

// One row of the close screen's related-accounts panel. Not an ImpactReportRowType: CLOSE settles
// nothing, so its projected figures would be zero. Holds only facts true for any method; balance is
// absent on purpose since it has no causal link to closing.
export type RelatedAccountRowType = {
  accountId: number;
  accountName: string;
  accountTypeName: string;
  interactionCount: number;
  // The target's signed amounts netted against this counterparty: positive means
  // the target received net from it. History, not what closing will move.
  netAmount: number;
  // Why the account is listed: what the shared movements were. Ordered by the
  // server, most frequent movement type first.
  movementBreakdown: MovementBreakdownEntryType[];
  // TIMESTAMPTZ folded by MAX() on the server: an ISO instant, formatted in the
  // reader's zone, not UTC, since the two calendar days differ for movements
  // recorded late in the evening.
  lastInteractionDate: string;
};

// Pockets that lose backing if this account is deleted (getPocketAllocationImpact);
// preview only, shown before confirmation.
export type PocketImpactRowType = {
  pocketId: number;
  pocketName: string;
  amountAllocated: number;
  currencyCode: string;
};

// Request body expected by the executeAccountDeletion controller.
export type RTAExecutionPayloadType = {
  deletionType: 'RTA' | 'HARD' | 'SOFT';
  targetAccountName: string;
};

// Data of a successful RTA deletion response (deleteAccountService).
export type DeletionSuccessDataType = {
  deletedAccountId: number;
  action: string;
  accountsCorrected: number;
  deletionType: string;
  finalSlackBalance: number;
  timestamp: string;
  message: string;
};
// Full API response for the RTA impact report (GET).
export type ReportResponseType = {
  status: number;
  message: string;
  data: {
    impactReport: ImpactReportRowType[];
    // Folded by the server: a browser-side sum of the rows would be short by
    // unattributedAmount, the one figure no row holds.
    totalNetAdjustmentAmount: number;
    pocketImpact: PocketImpactRowType[];
    // The close screen's panel: same population as impactReport (both come from
    // one server CTE), asked a different question.
    relatedAccounts: RelatedAccountRowType[];
    // Activity of the deleted account that no live account can be credited with,
    // because an earlier deletion already reversed it. Shown beside the total,
    // never added to it: the annulment does not act on it.
    unattributedAmount: number;
    unattributedTransactionCount: number;
    targetAccountId: number | string;
    affectedAccountsCount: number;
  };
};
export type ReportFetchHookType = UseFetchResponseType<ReportResponseType>;

export type DeletionLoadHookType = UseFetchLoadResponseType<
  DeletionSuccessDataType,
  RTAExecutionPayloadType
>;

export const DELETION_TYPE_RTA = 'RTA';

// SOFT and HARD read their method from the DELETE request's query string
// (`req.query.type || req.body.deletionType` in executeAccountDeletion), never
// from an RTA-shaped impact report.
export const DELETION_TYPE_SOFT = 'SOFT';
export const DELETION_TYPE_HARD = 'HARD';

export type StandardDeletionMethodType =
  | typeof DELETION_TYPE_SOFT
  | typeof DELETION_TYPE_HARD;

// Same literal as accountDeleteController.js. Must not join StandardDeletionMethodType: CLOSE requires
// closeReason, so useStandardAccountDeletion would send a request the service refuses with 400.
export const DELETION_TYPE_CLOSE = 'CLOSE';

// DELETE body for CLOSE. closeReason is mandatory by schema, not by the screen:
// migration 035's chk_close_reason_accompanies_closure refuses an empty or
// whitespace-only reason, so the service raises 400 before it takes its lock.
export type CloseExecutionPayloadType = {
  deletionType: typeof DELETION_TYPE_CLOSE;
  closeReason: string;
  // Neutralise the balance against the compensation account before the close,
  // in the same server transaction. The server compares against true, so absent
  // and an explicit false mean the same thing.
  reverseBalance?: boolean;
};

// Identity half of GET /account/delete/close_preview/:targetAccountId. residual
// is TEXT and stays text through the screen so nothing rounds it in transit:
// parse it only to compare against zero or to format it for display.
export type ClosePreviewAccountType = {
  accountId: number;
  accountName: string;
  accountTypeName: string;
  currencyCode: string;
  residual: string;
};

// Effect of the reverse-and-close on net worth; both figures are TEXT, like residual. When
// countsTowardNetWorth is false (not a bank, cash, investment or debtor account) the two figures are
// equal, which is the answer, not a missing value.
export type ClosePreviewNetWorthType = {
  before: string;
  after: string;
  countsTowardNetWorth: boolean;
};

// destinations and destinationCount stay in the payload but are always empty
// (legacy keys of the retired TRANSFER settlement), so a screen deployed against
// an older backend reads an empty list instead of undefined. Do not render them.
export type ClosePreviewResponseType = {
  status: number;
  message: string;
  data: {
    targetAccountId: number;
    targetAccount: ClosePreviewAccountType;
    destinations: never[];
    destinationCount: number;
    // Optional because frontend and backend deploy separately: a frontend
    // released ahead of the backend reads undefined and renders no impact block.
    netWorth?: ClosePreviewNetWorthType;
    // Text, like the residual; optional for the same deploy-order reason.
    committedToPockets?: string;
  };
};

// What the close returns: what it gave back before the row went away, which SOFT
// and HARD have no equivalent of, hence not StandardDeletionSuccessDataType.
export type CloseSuccessDataType = {
  deletedAccountId: number | string;
  closeReason: string;
  closingBalance: string;
  registryClosedAt: string;
  releasedPockets: { pocketId: number | string; amount: number | string }[];
  budgetTerminatedAt: string | null;
  extensionRowsDeleted: number;
};

export type CloseDeletionResponseType = {
  status: number;
  message: string;
  data: CloseSuccessDataType;
};

// Payload for the SOFT/HARD call. The backend needs no body (the method comes
// from the query string); the discriminant is carried so the request
// self-documents, like RTAExecutionPayloadType.
export type StandardExecutionPayloadType = {
  deletionType: StandardDeletionMethodType;
};

// What processStandardDelete returns for SOFT/HARD. impactReport,
// accountsCorrected and finalSlackBalance exist only on the RTA branch, so this
// is not DeletionSuccessDataType.
export type StandardDeletionSuccessDataType = {
  deletedAccountId: number | string;
  action: string; // 'USER_ACTION' | 'ADMIN_ACTION'
  deletionType: StandardDeletionMethodType;
  timestamp: string;
};

// Full response wrapper the controller sends (serviceResult = { status, message, data }). Separate from
// DeletionSuccessDataType, which reads the RTA `data.*` fields as if top-level (a known mismatch).
export type StandardDeletionResponseType = {
  status: number;
  message: string;
  data: StandardDeletionSuccessDataType;
};

// The states a deletion modal can be in.
export type ModalStatusType = 'idle' | 'executing' | 'success' | 'error';
