import { ReactNode, useEffect, useRef, useState } from 'react';

import { useModalDialog } from '../../../../../../hooks/useModalDialog.ts';
import { ModalStatusType } from '../../../../types/deletionTypes.ts';
import { DictionaryDataType } from '../../../../utils/languages.ts';

import './standardDeletionDialog.css';

// Shared dialog for SOFT, HARD and CLOSE deletion: one state machine (idle ->
// executing -> success/error). SOFT and HARD read their method from the DELETE
// query string and need no impact report, so they share nothing with the RTA modal.
export type StandardDeletionDialogPropType = {
 t: (keyText: keyof DictionaryDataType) => string;
 isOpen: boolean;
 // Drives the confirm button's accent and the panel's border only - both
 // variants render on the same raised surface.
 variant: 'soft' | 'hard';
 title: string;
 // Omitted by CLOSE: its screen already says the deletion cannot be undone.
 description?: string;
 // Only HARD supplies this: the sentence naming what is deliberately not
 // corrected. Rendered as its own banner so it cannot be mistaken for the
 // plain description above it.
 warning?: string;
 confirmLabel: string;
 // Disables the confirm without hiding it. Only CLOSE passes it: its confirm
 // waits on the preview, a zero balance and a written reason.
 confirmDisabled?: boolean;
 // Rendered in the idle body under the description and warning; CLOSE puts the
 // balance and the mandatory reason field here.
 children?: ReactNode;
 // Success-screen sentence, already resolved by the caller
 // ({targetAccountName} substituted).
 successMessage: string;
 // The API's own message on failure (useStandardAccountDeletion's
 // fetchLoadError), already a readable sentence.
 errorMessage: string | null;
 status: ModalStatusType;
 autoCloseSeconds?: number;
 onConfirm: () => void;
 onClose: () => void;
};

// Guard only: a hook cannot follow an early return, so the content (and its
// useModalDialog call) mounts only while isOpen is true.
export const StandardDeletionDialog = (props: StandardDeletionDialogPropType) => {
 if (!props.isOpen) return null;

 return <StandardDeletionDialogContent {...props} />;
};

const StandardDeletionDialogContent = ({
 t,
 variant,
 title,
 description,
 warning,
 confirmLabel,
 confirmDisabled = false,
 children,
 successMessage,
 errorMessage,
 status,
 autoCloseSeconds = 4,
 onConfirm,
 onClose,
}: StandardDeletionDialogPropType) => {
 const isBusy = status === 'executing';

 // Not portalled, so the page behind is not inert: aria-modal hides it from
 // screen readers and the hook's Tab cycle keeps focus inside.
 const { titleId, dialogProps } = useModalDialog({
  onClose,
  lockPageBehind: false,
  // An Escape must not abandon a request in flight.
  canClose: !isBusy,
 });

 // Auto-close countdown, on success and error alike.
 const [secondsLeft, setSecondsLeft] = useState(autoCloseSeconds);
 const hasClosedRef = useRef(false);

 useEffect(() => {
  if (status !== 'success' && status !== 'error') return;

  hasClosedRef.current = false;
  setSecondsLeft(autoCloseSeconds);

  const intervalId = setInterval(() => {
   setSecondsLeft((prev) => {
    if (prev <= 1) {
     clearInterval(intervalId);
     return 0;
    }
    return prev - 1;
   });
  }, 1000);

  return () => clearInterval(intervalId);
 }, [status, autoCloseSeconds]);

 useEffect(() => {
  if (
   secondsLeft === 0 &&
   !hasClosedRef.current &&
   (status === 'success' || status === 'error')
  ) {
   hasClosedRef.current = true;
   onClose();
  }
 }, [secondsLeft, status, onClose]);

 const heading =
  status === 'executing'
   ? t('processing')
   : status === 'success'
    ? t('successTitle')
    : status === 'error'
     ? t('errorTitle')
     : title;

 return (
  <div
   className="standard-deletion-dialog__overlay"
   {...dialogProps}
   /* alertdialog once the deletion runs or has answered (the content demands a
      response); the idle screen is a plain dialog. Declared after the spread so
      it overrides the hook's default 'dialog'. */
   role={status === 'idle' ? 'dialog' : 'alertdialog'}
   aria-describedby={
    status === 'idle' ? undefined : 'standard-deletion-dialog-message'
   }
  >
   <div
    className={`standard-deletion-dialog__panel standard-deletion-dialog__panel--${variant}`}
   >
    {status === 'idle' && (
     <>
      <h3 id={titleId} className="standard-deletion-dialog__title">
       {heading}
      </h3>

      {description && (
       <p className="standard-deletion-dialog__description">{description}</p>
      )}

      {warning && (
       <div className="standard-deletion-dialog__warning" role="alert">
        <svg
         className="standard-deletion-dialog__warning-icon"
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         strokeWidth="2"
         strokeLinecap="round"
         strokeLinejoin="round"
         aria-hidden="true"
         focusable="false"
        >
         <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
         <line x1="12" y1="9" x2="12" y2="13" />
         <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="standard-deletion-dialog__warning-text">{warning}</p>
       </div>
      )}

      {children}

      <div className="standard-deletion-dialog__actions">
       <button
        type="button"
        className="standard-deletion-dialog__button standard-deletion-dialog__button--ghost"
        onClick={onClose}
        aria-label={t('cancel')}
       >
        {t('cancel')}
       </button>

       <button
        type="button"
        className={`standard-deletion-dialog__button standard-deletion-dialog__button--${variant}`}
        onClick={onConfirm}
        disabled={confirmDisabled}
        aria-disabled={confirmDisabled}
        aria-label={confirmLabel}
       >
        {confirmLabel}
       </button>
      </div>
     </>
    )}

    {status === 'executing' && (
     <div className="standard-deletion-dialog__status" role="status" aria-live="polite">
      <svg
       className="standard-deletion-dialog__spinner"
       viewBox="0 0 24 24"
       fill="none"
       stroke="currentColor"
       strokeWidth="3"
       strokeLinecap="round"
       aria-hidden="true"
       focusable="false"
      >
       <circle cx="12" cy="12" r="10" pathLength="100" strokeDasharray="25 75" />
      </svg>
      <h3 id={titleId} className="standard-deletion-dialog__title">
       {heading}
      </h3>
     </div>
    )}

    {(status === 'success' || status === 'error') && (
     <div className="standard-deletion-dialog__status">
      <h3 id={titleId} className="standard-deletion-dialog__title">
       {heading}
      </h3>

      <p
       id="standard-deletion-dialog-message"
       className="standard-deletion-dialog__message"
      >
       {status === 'success' ? successMessage : errorMessage}
      </p>

      <p className="standard-deletion-dialog__countdown">
       {t('autoCloseIn')}
       <span className="standard-deletion-dialog__countdown-number">
        {secondsLeft}s
       </span>
      </p>

      <div className="standard-deletion-dialog__actions">
       <button
        type="button"
        className="standard-deletion-dialog__button standard-deletion-dialog__button--ghost"
        onClick={onClose}
        aria-label={t('closeButton')}
       >
        {t('closeButton')}
       </button>
      </div>
     </div>
    )}
   </div>
  </div>
 );
};

export default StandardDeletionDialog;
