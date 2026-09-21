// Presentational avatar button with a hover and touch tooltip; used by UserProfileMenu.
import React, { useCallback, useRef, useState } from 'react';

import styles from './styles/userAvatar.module.css';

type UserAvatarPropsType= {
/** Single character shown in the avatar. */
 initial: string;
 /** Suppresses the tooltip, e.g. while the menu is open. */
 isTooltipDisabled: boolean;

 userEmail?: string;

 userName?: string;

 onClickFn:  React.MouseEventHandler<HTMLElement>;

 id?: string;

 className?: string;

 isDisabled?: boolean;

/** Avatar edge length in pixels. */
 size?: number;
}

const UserAvatar: React.FC<UserAvatarPropsType> = React.memo(({
  onClickFn,
  isTooltipDisabled,
  initial,

  userEmail,
  userName,

  isDisabled = false,
  size=32,
  id,
  className = ''

}) => {

const [isTooltipShown, setIsTooltipShown] = useState<boolean>(false);

const avatarRef = useRef<HTMLDivElement>(null);

const handleInternalClick = useCallback((event:React.MouseEvent<HTMLElement>)=>{
if(isDisabled)return;
onClickFn(event);
},[isDisabled,onClickFn]);

const handleMouseEnter = ():void => {
if (!isTooltipDisabled && !isDisabled) {
setIsTooltipShown(true);
 }
};

const handleMouseLeave = ():void => {
setIsTooltipShown(false);
};

// The avatar is a div with role="button", so Enter and Space activation is handled
// here; Escape hides the tooltip.
const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
if (isDisabled) return; 

if (event.key === 'Enter' || event.key === ' ') {
 event.preventDefault();
 handleInternalClick(event as unknown as React.MouseEvent<HTMLElement>);
 }

if (event.key === 'Escape') {
 setIsTooltipShown(false);
 }
};
const handleTouchStart=():void=>{
// Touch has no hover, so the tooltip shows briefly (2 seconds).
if (!isTooltipDisabled && !isDisabled) {
 setIsTooltipShown(true);
 setTimeout(()=>setIsTooltipShown(false),2000)
 }
};

// Tooltip text priority: username, then email, then the initial.
const tooltipContent:string = userName || userEmail || initial;

const avatarClasses: string = [
styles.avatar,
isDisabled ? styles.disabled : '',
className
]
.filter(Boolean)
.join(' ');

const avatarStyle: React.CSSProperties = size
? {
 width: `${size}px`,
 height: `${size}px`,
 fontSize: `${Math.max(12, size / 2.5)}px`
}
: {};

 const ariaAttributes = {
 'role': 'button',
 'aria-label': 'Open user profile menu',
 'aria-disabled': isDisabled,
 'tabIndex': isDisabled ? -1 : 0
  };

return (
<div className={`${styles.badgeContainer} ${className}`}>
 <div
  ref={avatarRef}
  id={id}
  className={avatarClasses}
  style={avatarStyle}
  {...ariaAttributes}
  onClick={handleInternalClick}
  onMouseEnter={handleMouseEnter}
  onMouseLeave={handleMouseLeave}
  onTouchStart={handleTouchStart}
  onKeyDown={handleKeyDown}
  data-testid="user-avatar"
>
<span className={styles.avatarInitial} aria-hidden="true">
 {initial}
</span>

{isTooltipShown && !isTooltipDisabled && !isDisabled &&(
 <div 
  className={styles.tooltip}
  role="tooltip"
  aria-hidden="true"
 >
  <span className={styles.tooltipContent}>
   {tooltipContent}
  </span>
 <div className={styles.tooltipArrow} />
</div>
  )}
 </div>
</div>
 );
});

// Display name for React DevTools
UserAvatar.displayName = 'UserAvatar';

export default UserAvatar;