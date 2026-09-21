// Shared modal behaviour: dialog semantics, Escape to close, Tab cycle, focus moved in and restored.
// `inert` on #root does not contain Tab, so the cycle below closes that gap. A consumer keeping
// `lockPageBehind` MUST portal into document.body, or the dialog goes inert with #root.

import { useEffect, useId, useRef } from 'react';

// Every native focus stop except disabled ones. Visibility is tested with
// getClientRects, not offsetParent: a fixed panel has no offset parent, so every
// stop inside it would be discarded as hidden.
const FOCUS_STOPS =
 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
 ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalDialogOptions = {
 onClose: () => void;
 // Read on every render; a modal lowers it while a submit is in flight so it
 // cannot be dismissed mid-request.
 canClose?: boolean;
 // Runs once on mount with the panel node. A callback rather than a ref so the
 // caller picks the operation (select() on a prefilled input, not focus()).
 onInitialFocus?: (panel: HTMLDivElement) => void;
 // Makes #root inert while the dialog is open. Only a portalled dialog may keep
 // it true: inside #root the attribute would disable the dialog itself.
 lockPageBehind?: boolean;
};

export function useModalDialog({
 onClose,
 canClose = true,
 onInitialFocus,
 lockPageBehind = true,
}: ModalDialogOptions) {
 const panelRef = useRef<HTMLDivElement>(null);
 const titleId = useId();

 // A ref, not a dependency: an inline arrow changes every render and would
 // re-run the mount effect, moving the caret while the user types.
 const initialFocusRef = useRef(onInitialFocus);
 initialFocusRef.current = onInitialFocus;

 // Read once: portalling is fixed per component, and a ref keeps the mount
 // effect's dependency list empty.
 const lockPageBehindRef = useRef(lockPageBehind);

 useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
   if (event.key === 'Escape' && canClose) {
    onClose();
    return;
   }

   const panel = panelRef.current;
   if (event.key !== 'Tab' || !panel) return;

   // Queried on every Tab: fields appear and buttons disable mid-submit, so a
   // list captured on mount would send focus to a stale node.
   const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUS_STOPS))
    .filter((node) => node.getClientRects().length > 0);
   if (stops.length === 0) return;

   const first = stops[0];
   const last = stops[stops.length - 1];
   const active = document.activeElement;

   // The panel holds focus when no caller claimed it; Shift+Tab from there has
   // nothing earlier to reach, so it wraps to the last stop.
   if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
   } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
   }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
 }, [onClose, canClose]);

 // Restore the captured overflow instead of clearing it: another overlay may
 // still hold the scroll lock.
 useEffect(() => {
  const root = lockPageBehindRef.current
   ? document.getElementById('root')
   : null;
  const previousOverflow = document.body.style.overflow;
  const previouslyFocused = document.activeElement;

  root?.setAttribute('inert', '');
  document.body.style.overflow = 'hidden';

  // The caller picks what takes focus; the panel is the fallback, including for
  // a dialog whose dangerous answer must not start focused.
  const panel = panelRef.current;
  if (initialFocusRef.current && panel) initialFocusRef.current(panel);
  else panel?.focus();

  return () => {
   root?.removeAttribute('inert');
   document.body.style.overflow = previousOverflow;
   // Must follow the inert removal: focusing a node inside inert content is a
   // no-op.
   if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  };
 }, []);

 return {
  // Spread onto the panel. The id is generated so two dialogs mounted at once
  // do not share it and point at the same heading.
  titleId,
  panelRef,
  dialogProps: {
   ref: panelRef,
   role: 'dialog' as const,
   'aria-modal': true,
   'aria-labelledby': titleId,
   tabIndex: -1,
  },
 };
}
