// What an indicator means, wrapping the shared Tooltip so positioning and Escape dismissal stay shared.

import { useId } from 'react';

import InfoSvg from '../../../assets/InfoSvg.svg?react';
import Tooltip from '../tooltip/Tooltip';

import './styles/kpiTooltip.css';

type KpiTooltipProps = {
 // The indicator's name as it reads on screen; also the trigger's accessible
 // name, so a screen reader hears which button this is instead of "info" six times.
 label: string;
 // One or two sentences: the tip's whole content, and what the trigger points at
 // with aria-describedby.
 definition: string;
 // The surface the trigger sits on, not its colour: 'cream' is the data panels,
 // 'dark' the app ground. The chip inverts with it, since a cream chip on a cream
 // card is invisible.
 surface?: 'cream' | 'dark';
};

// On the label, not the amount: a hover target on the figure would disturb the element that must stay
// scannable. A button so the affordance is visible and a tap raises focus on touch screens (the shared
// Tooltip shows on :focus-within).
export const KpiTooltip = ({
 label,
 definition,
 surface = 'dark',
}: KpiTooltipProps) => {
 // Owned here: the element that references the id is this component's own child.
 const tipId = useId();

 return (
  <Tooltip
   tipText={definition}
   isActive={false}
   tooltipClassName={`kpiTooltip__tip kpiTooltip__tip--${surface}`}
   tipId={tipId}
  >
   <button
    type='button'
    className={`kpiTooltip__trigger kpiTooltip__trigger--${surface}`}
    aria-label={`What ${label} means`}
    aria-describedby={tipId}
   >
    <InfoSvg />
   </button>
  </Tooltip>
 );
};
