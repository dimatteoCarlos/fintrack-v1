import { useMemo } from 'react';

import { useStandardAccountDeletion } from '../../../../hooks/useStandardAccountDeletion.ts';
import { DELETION_TYPE_SOFT, ModalStatusType } from '../../../../types/deletionTypes.ts';
import { DictionaryDataType } from '../../../../utils/languages.ts';

import { StandardDeletionDialog } from '../standardDeletionUI/StandardDeletionDialog.tsx';

// Soft deactivation is a reversible one-column UPDATE (deleted_at) that needs no
// admin check or impact report, so its copy and confirm button read as low-stakes.
export type SoftDeactivateAccountUIPropType = {
 t: (keyText: keyof DictionaryDataType) => string;
 isOpen: boolean;
 targetAccountId: number | string;
 targetAccountName: string;
 onClose: () => void;
 // Called once, only after a successful deactivation - the caller navigates
 // away since the account just left the active list.
 onDeactivated: () => void;
};

export const SoftDeactivateAccountUI = ({
 t,
 isOpen,
 targetAccountId,
 targetAccountName,
 onClose,
 onDeactivated,
}: SoftDeactivateAccountUIPropType) => {
 const { executeStandardDeletion, isExecutingDeletion, deletionResult, fetchLoadError } =
  useStandardAccountDeletion(DELETION_TYPE_SOFT, targetAccountId);

 const status: ModalStatusType = isExecutingDeletion
  ? 'executing'
  : fetchLoadError
   ? 'error'
   : deletionResult
    ? 'success'
    : 'idle';

 const successMessage = useMemo(
  () =>
   t('softDeactivateSuccessMessage').replace(
    '{targetAccountName}',
    targetAccountName,
   ),
  [t, targetAccountName],
 );

 const handleConfirm = () => {
  executeStandardDeletion();
 };

 const handleClose = () => {
  if (status === 'success') {
   onDeactivated();
   return;
  }
  onClose();
 };

 return (
  <StandardDeletionDialog
   t={t}
   isOpen={isOpen}
   variant="soft"
   title={t('softDeactivateTitle')}
   description={t('softDeactivateDescription')}
   confirmLabel={t('softDeactivateConfirmButton')}
   successMessage={successMessage}
   errorMessage={fetchLoadError}
   status={status}
   onConfirm={handleConfirm}
   onClose={handleClose}
  />
 );
};

export default SoftDeactivateAccountUI;
