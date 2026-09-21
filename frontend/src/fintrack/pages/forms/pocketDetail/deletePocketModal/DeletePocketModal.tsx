// Deletion confirmation, then a result pane of the figures freed per account. A modal, not a route,
// which would unmount the card the owner is deciding on. No balance moves: a pocket never held cash,
// and a non-zero net never blocks the deletion.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { deletePocket } from '../../../../api/pocketApi.ts';
import { usePocketBoardStore } from '../../../../stores/usePocketBoardStore.ts';
import { usePocketDetailStore } from '../../../../stores/usePocketDetailStore.ts';
import { normalizeError } from '../../../../helpers/normalizeError.ts';
import { numberFormatCurrency } from '../../../../helpers/functions.ts';
import { CurrencyType } from '../../../../types/types.ts';
import { DeletePocketResult } from '../../../../types/pocketTypes.ts';
import { useModalDialog } from '../../../../../hooks/useModalDialog.ts';

import './styles/deletePocketModal-styles.css';


// Where the owner lands once the pocket is gone. Not the card they came from:
// that card describes a pocket that no longer exists.
const BOARD_ROUTE = '/fintrack/pocket';

type DeletePocketModalPropType = {
 pocketId: number;
 pocketName: string;
 // The pocket's accounting currency, the unit of every freed figure.
 currency: CurrencyType;
 // Dismisses the question; not called once the deletion has run, when the only
 // exit is the board.
 onClose: () => void;
};

function DeletePocketModal({
 pocketId,
 pocketName,
 currency,
 onClose,
}: DeletePocketModalPropType) {
 const navigateTo = useNavigate();
 const confirmRef = useRef<HTMLButtonElement>(null);

 const [isDeleting, setIsDeleting] = useState<boolean>(false);
 const [result, setResult] = useState<DeletePocketResult | null>(null);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);

 // No initial focus named: a pre-focused destructive answer is one stray Enter away. canClose stops
 // Escape on the result pane, where the pocket is gone and only the navigating button exits. The
 // title id is per instance so two open panels do not both name the first heading.
 const { titleId, dialogProps } = useModalDialog({
  onClose,
  canClose: result === null && !isDeleting,
 });

 const asMoney = (value: number) => numberFormatCurrency(value, 2, currency);

 async function onConfirm() {
  setIsDeleting(true);
  setErrorMessage(null);

  try {
   const deleted = await deletePocket(pocketId);
   setResult(deleted);
  } catch (error) {
   console.error('🔥 Error deleting the pocket', error);
   const { message } = normalizeError(error);
   setErrorMessage(message);
  } finally {
   setIsDeleting(false);
  }
 }

 // Refreshed, not marked stale: this lands the owner on the board, and a stale flag would keep the
 // deleted pocket visible until another fetch. The board's mount joins this in-flight request. The
 // detail store is cleared so the next pocket opened does not flash this one's figures.
 function onFinish() {
  usePocketDetailStore.getState().clear();
  void usePocketBoardStore.getState().refreshBoard();

  navigateTo(BOARD_ROUTE);
 }

 return createPortal(
  <div className='pocketDelete__overlay'>
   <div className='pocketDelete__panel' {...dialogProps}>
    {result === null ? (
     <>
      <h2 className='pocketDelete__title' id={titleId}>
       Delete {pocketName}?
      </h2>

      <p className='pocketDelete__body'>
       The goal goes away and every account funding it stops holding cash for
       it. No balance moves — the money was only ever committed, and it goes
       back to being unassigned.
      </p>

      {errorMessage && (
       <p className='pocketDelete__error' role='alert'>
        {errorMessage}
       </p>
      )}

      <div className='pocketDelete__actions'>
       <button
        type='button'
        className='pocketDelete__button pocketDelete__button--quiet'
        onClick={onClose}
        disabled={isDeleting}
       >
        Keep it
       </button>

       <button
        type='button'
        className='pocketDelete__button pocketDelete__button--confirm'
        onClick={() => void onConfirm()}
        disabled={isDeleting}
        ref={confirmRef}
       >
        {isDeleting ? 'Deleting…' : 'Delete pocket'}
       </button>
      </div>
     </>
    ) : (
     <>
      <h2 className='pocketDelete__title' id={titleId}>
       {result.name} is gone
      </h2>

      {result.freed.length === 0 ? (
       <p className='pocketDelete__body'>
        Nothing had been committed to it, so nothing came back.
       </p>
      ) : (
       <>
        <p className='pocketDelete__body'>
         This cash is unassigned again:
        </p>

        <ul className='pocketDelete__freed'>
         {result.freed.map((account) => (
          <li className='pocketDelete__freedRow' key={account.accountId}>
           <span className='pocketDelete__freedName'>
            {account.accountName}
           </span>
           <span className='pocketDelete__freedAmount'>
            {asMoney(account.freedCash)}
           </span>
          </li>
         ))}
        </ul>
       </>
      )}

      <div className='pocketDelete__actions'>
       <button
        type='button'
        className='pocketDelete__button pocketDelete__button--confirm'
        onClick={onFinish}
       >
        Back to pockets
       </button>
      </div>
     </>
    )}
   </div>
  </div>,
  document.body,
 );
}

export default DeletePocketModal;
