//frontend/src/fintrack/pages/pocket/hooks/useCompactHeroOnScroll.ts
// The scroll handler for a screen under PocketLayout: scrolled, the hero above
// keeps its three figures only; back at the very top, it shows them all again.
import { UIEvent, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { PocketOutletContextType } from '../PocketLayout';

export function useCompactHeroOnScroll() {
 const { setIsHeroCompact } = useOutletContext<PocketOutletContextType>();

 // A sibling route under the same layout must not inherit a shrunken hero.
 useEffect(() => () => setIsHeroCompact(false), [setIsHeroCompact]);

 // Shrinks past a few pixels and grows back only at the very top, so a scroll
 // that hovers near the threshold does not make the hero flicker.
 return (event: UIEvent<HTMLElement>) => {
  const top = event.currentTarget.scrollTop;
  setIsHeroCompact((wasCompact) =>
   top > 16 ? true : top === 0 ? false : wasCompact,
  );
 };
}
