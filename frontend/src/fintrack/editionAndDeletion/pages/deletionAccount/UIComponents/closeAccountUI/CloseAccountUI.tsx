import { useId, useMemo, useState } from 'react';

import { UseCloseAccountReturnType } from '../../../../hooks/useCloseAccount.ts';
import { ModalStatusType } from '../../../../types/deletionTypes.ts';
import { DictionaryDataType } from '../../../../utils/languages.ts';
import { currencyFormat } from '../../../../../helpers/functions.ts';
import {
 CURRENCY_OPTIONS,
 DEFAULT_CURRENCY,
} from '../../../../../helpers/constants.ts';

import { StandardDeletionDialog } from '../standardDeletionUI/StandardDeletionDialog.tsx';
import CharacterCounter from '../../../../../general_components/characterCounter/CharacterCounter.tsx';

import './closeAccountUI.css';

// Close is a lifecycle operation: it refuses a non-empty account, otherwise releases pockets, stops
// budget series and deletes the row. The dialog shows the balance verdict up front and collects
// the reason the database requires (migration 035, chk_close_reason_accompanies_closure).
export type CloseAccountUIPropType = {
 t: (keyText: keyof DictionaryDataType) => string;
 isOpen: boolean;
 targetAccountId: number | string;
 targetAccountName: string;
 // Used only to warn, before confirming, that a category budget's budget is deleted
 // with the account.
 targetAccountType: string;
 // Close state owned by the page: the balance also decides whether the annulment is
 // offered beside this dialog, and a second hook call here would fetch the preview twice.
 close: UseCloseAccountReturnType;
 onClose: () => void;
 // Called once, only after a successful close - the caller navigates away
 // since the account row no longer exists.
 onClosed: () => void;
 // Which operation this dialog confirms (title, confirm label, blocking-balance rule). The page
 // decides so the trigger button and the confirmation cannot disagree.
 isBalanceReversed?: boolean;
};

// A server amount, sent as text, printed with the account's currency symbol. An
// unparseable one stays as the server wrote it.
const formatPreviewAmount = (text: string, currencyCode: string) => {
 const amount = Number(text);

 return Number.isNaN(amount)
  ? text
  : currencyFormat(currencyCode, amount, CURRENCY_OPTIONS[DEFAULT_CURRENCY]);
};

export const CloseAccountUI = ({
 t,
 isOpen,
 targetAccountId,
 targetAccountName,
 targetAccountType,
 close,
 onClose,
 onClosed,
 isBalanceReversed = false,
}: CloseAccountUIPropType) => {
// Mirrors the schema ceiling on the reason (chk_close_reason_length, migration 036) so the
// field stops at it instead of failing on submit; the database stays the enforcement.
const CLOSE_REASON_MAX_LENGTH = 255;

 const reasonFieldId = useId();
 const [closeReason, setCloseReason] = useState('');

 const {
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
 } = close;

 const status: ModalStatusType = isClosing
  ? 'executing'
  : fetchLoadError
   ? 'error'
   : closeResult
    ? 'success'
    : 'idle';

 const trimmedReason = closeReason.trim();

 // The residual with the account's currency symbol; display only, decisions read the server's text.
 const displayResidual = useMemo(() => {
  if (residual === null) return null;

  return targetAccount === null
   ? residual
   : formatPreviewAmount(residual, targetAccount.currencyCode);
 }, [residual, targetAccount]);

 // Null when nothing is committed or the preview has not said, so no notice is drawn.
 const displayCommitted = useMemo(() => {
  if (committedToPockets === null || targetAccount === null) return null;

  return Number(committedToPockets) > 0
   ? formatPreviewAmount(committedToPockets, targetAccount.currencyCode)
   : null;
 }, [committedToPockets, targetAccount]);

 // Each disabling condition has a visible cause. canClose is ignored on reversal, which exists
 // to make a blocking balance closeable; refusing on it would leave the button unpressable.
 const isConfirmDisabled =
  isLoadingPreview ||
  !!previewError ||
  (!canClose && !isBalanceReversed) ||
  trimmedReason.length === 0;

 const successMessage = useMemo(
  () =>
   t('closeAccountSuccessMessage').replace(
    '{targetAccountName}',
    targetAccountName,
   ),
  [t, targetAccountName],
 );

 // The refusal, quoted before the owner meets it, from the balance the preview returned
 // (the figure the engine derives its own refusal from), not any stored figure.
 const balanceWarning = useMemo(() => {
  if (isLoadingPreview || previewError || canClose || displayResidual === null) {
   return undefined;
  }
  // Same balance, two sentences: under the plain close it is a refusal; under the reversal
  // it states what will be moved, so quoting the refusal would say the button will fail
  // while it is about to succeed.
  if (isBalanceReversed) {
   return t('closeAccountReversalNotice').replace('{residual}', displayResidual);
  }
  return t('closeAccountBlockedByBalance').replace('{residual}', displayResidual);
 }, [
  canClose,
  displayResidual,
  isBalanceReversed,
  isLoadingPreview,
  previewError,
  t,
 ]);

 const handleConfirm = () => {
  executeClose(closeReason, isBalanceReversed);
 };

 const handleClose = () => {
  if (status === 'success') {
   onClosed();
   return;
  }
  onClose();
 };

 return (
  <StandardDeletionDialog
   t={t}
   isOpen={isOpen}
   variant="hard"
   title={t(
    isBalanceReversed ? 'closeAccountReverseTitle' : 'closeAccountTitle',
   )}
   warning={balanceWarning}
   confirmLabel={t(
    isBalanceReversed
     ? 'closeAccountReverseConfirmButton'
     : 'closeAccountConfirmButton',
   )}
   confirmDisabled={isConfirmDisabled}
   successMessage={successMessage}
   errorMessage={fetchLoadError}
   status={status}
   onConfirm={handleConfirm}
   onClose={handleClose}
  >
   <div className="close-account__fields">
    {/* A missing balance renders as a skeleton or a dash, never 0: a zero would read as
        "this account is empty and will close". */}
    <p className="close-account__balance-row">
     <span className="close-account__balance-label">
      {t('closeAccountBalanceLabel')}
     </span>

     {isLoadingPreview ? (
      <span
       className="close-account__balance-skeleton"
       aria-label={t('loading')}
      />
     ) : previewError || displayResidual === null ? (
      <span className="close-account__balance-value">&mdash;</span>
     ) : (
      <span
       className={`close-account__balance-value${
        canClose ? '' : ' close-account__balance-value--blocking'
       }`}
      >
       {displayResidual}
      </span>
     )}
    </p>

    {/* Reversal path only: a plain close refuses any balance, so before and after would match.
        The netWorth guard keeps a frontend released ahead of its backend rendering nothing. */}
    {isBalanceReversed &&
     netWorth &&
     !isLoadingPreview &&
     !previewError && (
      <div className="close-account__net-worth" role="note">
       <p className="close-account__net-worth-title">
        {t('closeNetWorthSectionLabel')}
       </p>

       <p className="close-account__balance-row">
        <span className="close-account__balance-label">
         {t('closeNetWorthBeforeLabel')}
        </span>
        <span className="close-account__balance-value">{netWorth.before}</span>
       </p>

       <p className="close-account__balance-row">
        <span className="close-account__balance-label">
         {t('closeNetWorthAfterLabel')}
        </span>
        <span className="close-account__balance-value">{netWorth.after}</span>
       </p>

       {/* The two figures are equal here, and without this line that reads as
           a bug rather than as the answer. */}
       {!netWorth.countsTowardNetWorth && (
        <p className="close-account__net-worth-note">
         {t('closeNetWorthUnchangedNote')}
        </p>
       )}
      </div>
     )}

    {/* The budget is zeroed forward, not deleted: idsOverlapping keeps months
        before the closure month visible and zeroes the closure month onward.
        The owner is still told before confirming, because the close does not
        come back; only this type carries a budget. */}
    {targetAccountType === 'category_budget' && (
     <p className="close-account__budget-warning" role="note">
      {t('closeAccountBudgetWarning')}
     </p>
    )}

    {/* The amount decides, not the type: only an account that backs a pocket
        has one above zero, and the server sums exactly what the close releases. */}
    {displayCommitted !== null && (
     <p className="close-account__pocket-notice" role="note">
      {t('closeAccountPocketNotice')
       .replace('{amount}', displayCommitted)
       .replace('{name}', targetAccountName)
       .replace('{id}', String(targetAccountId))}
     </p>
    )}

    {previewError && (
     <p className="close-account__preview-error" role="alert">
      {t('closeAccountPreviewError')}
     </p>
    )}

    {/* Required by the schema, so the label says so instead of the owner finding out
        through a 400. */}
    <label className="close-account__label" htmlFor={reasonFieldId}>
     {t('closeAccountReasonLabel')}
     <CharacterCounter
      value={closeReason}
      maxLength={CLOSE_REASON_MAX_LENGTH}
     />
    </label>

    <textarea
     id={reasonFieldId}
     className="close-account__reason"
     value={closeReason}
     onChange={(event) => setCloseReason(event.target.value)}
     placeholder={t('closeAccountReasonPlaceholder')}
     rows={3}
     maxLength={CLOSE_REASON_MAX_LENGTH}
     required
     aria-required="true"
     disabled={isClosing}
    />

    <p className="close-account__hint">{t('closeAccountReasonHint')}</p>
   </div>
  </StandardDeletionDialog>
 );
};

export default CloseAccountUI;
