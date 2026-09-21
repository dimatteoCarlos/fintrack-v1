import { useMemo } from 'react';

import { useStandardAccountDeletion } from '../../../../hooks/useStandardAccountDeletion.ts';
import { DELETION_TYPE_HARD, ModalStatusType } from '../../../../types/deletionTypes.ts';
import { DictionaryDataType } from '../../../../utils/languages.ts';

import { StandardDeletionDialog } from '../standardDeletionUI/StandardDeletionDialog.tsx';

// Permanent erase that does not reverse the account's impact on counterparties; the warning copy
// says so, unlike RTA's cosmetic "Confirm Hard Deletion" label. No client-side role check: the
// backend admin gate is currently permissive and a mirror would hide the action inconsistently.
export type HardDeleteConfirmationUIPropType = {
 t: (keyText: keyof DictionaryDataType) => string;
 isOpen: boolean;
 targetAccountId: number | string;
 targetAccountName: string;
 onClose: () => void;
 // Called once, only after a successful erase - the caller navigates away
 // since the account no longer exists.
 onErased: () => void;
};

export const HardDeleteConfirmationUI = ({
 t,
 isOpen,
 targetAccountId,
 targetAccountName,
 onClose,
 onErased,
}: HardDeleteConfirmationUIPropType) => {
 const { executeStandardDeletion, isExecutingDeletion, deletionResult, fetchLoadError } =
  useStandardAccountDeletion(DELETION_TYPE_HARD, targetAccountId);

 const status: ModalStatusType = isExecutingDeletion
  ? 'executing'
  : fetchLoadError
   ? 'error'
   : deletionResult
    ? 'success'
    : 'idle';

 const successMessage = useMemo(
  () =>
   t('hardDeleteSuccessMessage').replace('{targetAccountName}', targetAccountName),
  [t, targetAccountName],
 );

 const handleConfirm = () => {
  executeStandardDeletion();
 };

 const handleClose = () => {
  if (status === 'success') {
   onErased();
   return;
  }
  onClose();
 };

 return (
  <StandardDeletionDialog
   t={t}
   isOpen={isOpen}
   variant="hard"
   title={t('hardDeleteTitle')}
   description={t('hardDeleteDescription')}
   warning={t('hardDeleteWarning')}
   confirmLabel={t('hardDeleteConfirmButton')}
   successMessage={successMessage}
   errorMessage={fetchLoadError}
   status={status}
   onConfirm={handleConfirm}
   onClose={handleClose}
  />
 );
};

export default HardDeleteConfirmationUI;
