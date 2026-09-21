// Exchange rate chip shown next to a converted amount. Wraps the shared Tooltip so the
// rate styling never leaks into it.

import React from 'react';
import Tooltip from '../tooltip/Tooltip';
import './styles/rateTooltip.css';

type RateTooltipPropType = {
 // Direction and rate, already formatted. Rendered on two lines.
 tipText: string;
 // Names the surface the chip sits on, never the colour it paints itself.
 surface: 'light' | 'dark';
 // Default 'above'. 'anchor-left': trigger at a wide row's right edge, where a centred chip overflows.
 // 'row-centred': the row's middle gap, for rows near a card's top. 'anchor-left-below': opens downward
 // under other content; '-below-badge' also clears the CurrencyBadge ending .form__amount-row.
 placement?:
  | 'above'
  | 'anchor-left'
  | 'row-centred'
  | 'anchor-left-below'
  | 'anchor-left-below-badge'
  // 'below' opens under the trigger, right edges aligned: for a preview with nothing
  // below it but its own field (the budget editor).
  | 'below';
 children: React.ReactNode;
};

const RateTooltip = ({
 tipText,
 surface,
 placement = 'above',
 children,
}: RateTooltipPropType) => {
 // Compound selector so the chip beats the base tooltip rules from another file.
 const chipClassName = [
  'rateTooltip__chip',
  `rateTooltip__chip--${surface}`,
  placement !== 'above' ? `rateTooltip__chip--${placement}` : '',
 ]
  .filter(Boolean)
  .join(' ');

 return (
  <Tooltip
   tipText={tipText}
   isActive={false}
   tooltipClassName={chipClassName}
   /* The rate and its day appear nowhere else on screen, so the trigger takes focus and
      names the chip as its description; otherwise only a pointer could reach them. */
   focusable
  >
   {children}
  </Tooltip>
 );
};

export default RateTooltip;
