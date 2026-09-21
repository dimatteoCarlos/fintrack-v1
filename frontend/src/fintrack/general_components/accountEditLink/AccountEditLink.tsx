// The control that opens the account editor from a detail card.

// '?react' and not the bare form: only that import carries a React type, so the
// glyph can take a className. The bare one is typed as a string.
import EditSvg from '../../../assets/userProfileMenuSvg/editSvg.svg?react';
import { Link } from 'react-router-dom';
import './styles/accountEditLink-styles.css';

type AccountEditLinkPropType = {
 // The editor fetches the account itself, so the id is all it needs.
 accountId: string;
 // Where the editor returns after saving or cancelling, so a card returns to itself.
 returnRoute: string;
 // Names the account in the accessible label; a bare "Edit account" is ambiguous.
 accountName: string;
 // The surface the control sits on, not the colour it paints. Detail cards are
 // dark; 'light' is for cream panels and white headers.
 surface?: 'dark' | 'light';
 // The route the module was entered from, so a later deletion returns out of the
 // module rather than to a card whose account no longer exists.
 originRoute?: string;
};

// A Link, not a button: the destination is a route, so open-in-new-tab comes from the browser.
// Not a variant of AccountActionsTrigger, whose aria-haspopup would announce a popup here.
// A detail card offers editing only; deletion lives in accounting.
function AccountEditLink({
 accountId,
 returnRoute,
 accountName,
 surface = 'dark',
 originRoute,
}: AccountEditLinkPropType) {
 return (
  <Link
   to={`/fintrack/account/${accountId}/edit`}
   state={{ previousRoute: returnRoute, originRoute }}
   className={`accountEditLink accountEditLink--${surface}`}
   aria-label={`Edit ${accountName}`}
  >
   <EditSvg className='accountEditLink__glyph' aria-hidden='true' />
  </Link>
 );
}

export default AccountEditLink;
