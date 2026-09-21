import { ModalStatusType, PocketImpactRowType } from "../../../../types/deletionTypes.ts";
import { DictionaryDataType } from "../../../../utils/languages.ts";

import StatusModalUI from "../statusModalUI/StatusModalUI.tsx";
import InitialConfirmationDeleteAccountUI from "./InitialConfirmationDeleteAccountUI.tsx"
import { useModalDialog } from "../../../../../../hooks/useModalDialog.ts";

import './RTAConfirmationModal.css';

export type RTAConfirmationModalPropsType={
 t:(keyText:keyof DictionaryDataType)=>string;
 isOpen:boolean;
 onClose:()=>void;
 onConfirm:()=>void;
 mainStatusFromParent:ModalStatusType;
 message:string;
 affectedAccountsReportCount:number;
 pocketImpact:PocketImpactRowType[];
}
// Guard only: a hook cannot follow the early return below, and focus returns to whatever
// opened the dialog only because it UNMOUNTS on close.
export const RTAConfirmationModal = (props:RTAConfirmationModalPropsType) => {
 if(!props.isOpen) return null;

 return <RTAConfirmationDialog {...props} />;
};

const RTAConfirmationDialog = ({
 t, affectedAccountsReportCount, onClose, onConfirm, message, mainStatusFromParent, pocketImpact
}:RTAConfirmationModalPropsType) => {
const buttonDisabled = mainStatusFromParent === 'executing';

// This element is the dialog; the two screens below declare no roles (nested dialogs confuse
// screen readers). Not portalled: aria-modal hides the page and the Tab cycle holds focus. No
// initial focus is named, so the destructive answer is not focused on open.
const { titleId, dialogProps } = useModalDialog({
 onClose,
 lockPageBehind: false,
 // The account is being deleted; an Escape must not abandon the request halfway. Same
 // condition the buttons disable on.
 canClose: mainStatusFromParent !== 'executing',
});

const getModalContent = ()=>{
switch (mainStatusFromParent){
 case 'idle':
 return(
  <InitialConfirmationDeleteAccountUI
   t={t} affectedAccountsReportCount={affectedAccountsReportCount}
   pocketImpact={pocketImpact}
   buttonDisabled={buttonDisabled}

   onClose={onClose}
   onConfirm={onConfirm}
   mainStatusFromParent={mainStatusFromParent}
   message={message}
   titleId={titleId}

   isOpen
  />
  );

  case 'executing':
  case 'success':
  case 'error':
  return(
   <StatusModalUI
    modalStatus={mainStatusFromParent}
    message={message}
    onClose={onClose}
    autoCloseDelay={4000}
    showCountdown={true}
    t={t}
    titleId={titleId}
   />
  );

  default: return null;
 }
};

return (
 <div
   className="rta-confirmation-modal-overlay open"
   {...dialogProps}
   /* alertdialog once the deletion is running or has answered: that content demands a
      response. The idle screen is an ordinary confirmation. The role is stated after
      the spread so it wins over the hook's default. */
   role={mainStatusFromParent === 'idle' ? 'dialog' : 'alertdialog'}
   /* The paragraph exists only on the status screens, and this element carries the
      dialog role, so it is the one that must reference it. */
   aria-describedby={
    mainStatusFromParent === 'idle' ? undefined : 'status-modal-message'
   }>
  <div className="rta-confirmation-modal-container ">
   {getModalContent()}
  </div>
 </div>
)
 }
