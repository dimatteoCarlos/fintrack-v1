import { useEffect, useRef } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside.ts';
// '?react' and not a bare import: a bare .svg is typed `string` and cannot take
// a className, so only that form carries a React component type.
import DeleteAccountSvg from '../../../../assets/accountActionsMenuSvg/deleteAccountSvg.svg?react';
import EditAccountSvg from '../../../../assets/accountActionsMenuSvg/editAccountSvg.svg?react';
import ViewAccountSvg from '../../../../assets/accountActionsMenuSvg/viewAccountSvg.svg?react';
import './account-actions-menu-styles.css';

type AccountActionsMenuPropType = {
  onClose: () => void;
  isOpen: boolean;
  // The name alone, not the whole account: the menu renders one string, and the
  // pocket and debtor detail screens that open it hold their own types.
  accountName: string;
  // Optional: omitted on a detail screen, where 'View Details' would lead to the
  // screen already open.
  onViewDetails?: () => void;
  onEditAccount: () => void;
  onDeleteAccount: () => void;
  // Row labels, defaulted to the account wording. Pockets override them because
  // "Delete Account" on a pocket would name the wrong object, a real bank account.
  editLabel?: string;
  deleteLabel?: string;
};
export function AccountActionsMenu({
  accountName,
  isOpen,
  onClose,
  onViewDetails,
  onEditAccount,
  onDeleteAccount,
  editLabel = 'Edit Account',
  deleteLabel = 'Delete Account',
}: AccountActionsMenuPropType) {
  const menuRef = useRef<HTMLDivElement>(null);
  // The control that opened the menu, so closing can hand the keyboard back to
  // where it came from instead of dropping it on <body>.
  const triggerRef = useRef<HTMLElement | null>(null);

  useClickOutside(menuRef, onClose);

  // Escape is listened for on the document, not the panel: it has to work from
  // the moment the menu paints, before focus has finished moving into it.
  useEffect(() => {
   if (!isOpen) {
    return;
   }

   const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
     onClose();
    }
   };

   document.addEventListener('keydown', handleKeyDown);

   return () => {
    document.removeEventListener('keydown', handleKeyDown);
   };
  }, [isOpen, onClose]);

  // Focus moves into the menu on open and back to the trigger on close. onClose
  // is deliberately not a dependency: it is a fresh closure on every parent
  // render, and the cleanup would then pull focus back mid-session.
  useEffect(() => {
   if (!isOpen) {
    return;
   }

   triggerRef.current = document.activeElement as HTMLElement | null;
   menuRef.current?.querySelector('button')?.focus();

   return () => {
    // isConnected: an option that navigates away takes the trigger out of the
    // document with it, and focusing a detached node does nothing useful.
    if (triggerRef.current?.isConnected) {
     triggerRef.current.focus();
    }
   };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div className='account-actions-menu__overlay'>
      <div ref={menuRef} className='account-actions-menu'>
        <div className='account-actions-menu__header'>
          <span className='account-actions-menu__account-name'>
            {accountName}
          </span>
        </div>

        <div className='account-actions-menu__options'>
          {/* Rendered only where it leads somewhere else: the dashboard passes
              onViewDetails, a detail screen does not. Icons are aria-hidden in
              the asset because each row already has a text label. */}
          {onViewDetails && (
            <button
              type='button'
              className='account-actions-menu__option'
              onClick={onViewDetails}
            >
              <ViewAccountSvg className='account-actions-menu__icon' />

              <span className='account-actions-menu__text'>View Details</span>
            </button>
          )}

          <button
            type='button'
            className='account-actions-menu__option'
            onClick={onEditAccount}
          >
            <EditAccountSvg className='account-actions-menu__icon' />

            <span className='account-actions-menu__text'>{editLabel}</span>
          </button>

          {/* The modifier is '--delete' (singular) and must match the stylesheet. */}
          <button
            type='button'
            className='account-actions-menu__option account-actions-menu__option--delete'
            onClick={onDeleteAccount}
          >
            <DeleteAccountSvg className='account-actions-menu__icon' />

            <span className='account-actions-menu__text'>{deleteLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccountActionsMenu;
