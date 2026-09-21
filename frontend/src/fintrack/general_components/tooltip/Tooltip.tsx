import React, { useId, useState } from 'react';
import './styles/tooltip.css';
type TooltipPropType = {
  tipText: string;
  children: React.ReactNode;
  isActive: boolean;
  tooltipClassName?: string;
  /** Makes the trigger a tab stop that names the tip as its description. Off by default,
   * since most tips repeat a visible label; on for a tip carrying information found
   * nowhere else, such as the exchange rate chip. */
  focusable?: boolean;
  /** Id of the tip element, for a caller whose own child is the focusable trigger and
   * names the tip with aria-describedby; otherwise only the wrapper can reference the
   * generated id. */
  tipId?: string;
};

const Tooltip = ({
  tipText,
  children,
  isActive,
  tooltipClassName,
  focusable = false,
  tipId: tipIdFromCaller,
}: TooltipPropType) => {
  const [isVisible, setIsVisible] = useState<boolean>(!isActive);
  // Escape closes the tip without moving the pointer or the focus, which is
  // what WCAG 2.1's "dismissible" asks for. Reset the moment the pointer or
  // the focus leaves, so the next hover shows it again.
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const generatedTipId = useId();
  const tipId = tipIdFromCaller ?? generatedTipId;

  const handleMouseEnter = () => {
    setIsVisible(true);
  };
  const handleMouseLeave = () => {
    setIsVisible(false);
    setIsDismissed(false);
  };

  // Focus mounts the tip like hover, making it reachable on touch: a tap on a focusable child
  // raises focus and :focus-within shows it. Without this, focus could not remount it after a mouse-out.
  const handleFocus = () => setIsVisible(true);
  const handleBlur = () => {
    setIsVisible(false);
    setIsDismissed(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setIsDismissed(true);
  };

  return (
    <div
      className={`tooltip__wrapper ${isDismissed ? 'is-dismissed' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      /* Unconditional: the key event bubbles from whatever holds focus, so a caller whose
         own child is the trigger gets Escape too. */
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable && !isActive ? tipId : undefined}
    >
      {!isActive && isVisible && (
        <div
          id={tipId}
          className={`tooltip__wrapper--text ${tooltipClassName || ''}`}
        >
          {tipText}
        </div>
      )}

      {children}
    </div>
  );
};

export default Tooltip;
