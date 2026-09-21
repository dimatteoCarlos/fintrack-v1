// Opens AccountActionsMenu: a real <button> (focusable, keyboard-operable). Own BEM block: reusing
// `icon3dots` would fight two page stylesheets, decided by lazy-route CSS load order.

// '?react', not the bare form: only that import carries a React type, so the
// glyph can take a className. The bare import is typed as a string.
import Dots3LightSvg from '../../../assets/Dots3LightSvg.svg?react';
import './styles/accountActionsTrigger-styles.css';

type AccountActionsTriggerPropType = {
 // Carries the event: a caller whose whole card is clickable needs it to stop
 // the bubble, or the menu opens twice on one press.
 onClick: (event: React.MouseEvent) => void;
 // Names the account in the accessible label. A bare "Account actions" repeated
 // down a list says nothing about which row it belongs to.
 accountName: string;
 // The surface the button sits on, not the colour it paints. Every current
 // caller is on the dark app background; 'light' exists for the cream panels
 // and white headers the same control lands on elsewhere.
 surface?: 'dark' | 'light';
 // Whether the menu it opens is currently open. Announced, not styled.
 isOpen?: boolean;
 disabled?: boolean;
};

function AccountActionsTrigger({
 onClick,
 accountName,
 surface = 'dark',
 isOpen = false,
 disabled = false,
}: AccountActionsTriggerPropType) {
 return (
  <button
   type='button'
   className={`accountActionsTrigger accountActionsTrigger--${surface}`}
   onClick={onClick}
   disabled={disabled}
   aria-label={`Account actions for ${accountName}`}
   aria-haspopup='menu'
   aria-expanded={isOpen}
  >
   <Dots3LightSvg className='accountActionsTrigger__glyph' />
  </button>
 );
}

export default AccountActionsTrigger;
