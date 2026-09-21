// One control, two destinations, on any page long enough to need it: past half of the
// scrollable distance it jumps to the top, before that to the bottom.

import { useCallback, useEffect, useRef, useState } from 'react';
import ArrowDownLightSvg from '../../../assets/ArrowDownLightSvg.svg?react';
import './styles/scrollJump-styles.css';

// innerHeight is fractional on a zoomed viewport, so a document that does not scroll can
// still report a sub-pixel distance. Below this there is nothing to jump to.
const MIN_SCROLLABLE_PX = 1;

// How long the control stays visible after the last scroll; at rest it would only cover a row.
const IDLE_HIDE_MS = 2000;

type ScrollJumpProps = {
 // The noun in both button labels, in the reader's words: "list" on an inventory, "page"
 // on a board of cards.
 subject?: string;
};

function ScrollJump({ subject = 'page' }: ScrollJumpProps) {
 // The threshold is half of the scrollable distance, not half a viewport: on a page barely
 // taller than the window a viewport threshold leaves the arrow pointing down at the end
 // and the click does nothing.
 const [jumpsToTop, setJumpsToTop] = useState(false);

 // Nothing to scroll means nothing to jump to: the control removes itself.
 const [canJump, setCanJump] = useState(false);

 // Shown only while the page is scrolling and for IDLE_HIDE_MS after it.
 const [isAwake, setIsAwake] = useState(false);
 // Hovered or focused: the reader is reaching for it, so it must not fade.
 const isHeldRef = useRef(false);
 const hideTimerRef = useRef<number | undefined>(undefined);

 const scheduleHide = useCallback(() => {
  window.clearTimeout(hideTimerRef.current);
  hideTimerRef.current = window.setTimeout(() => {
   if (!isHeldRef.current) setIsAwake(false);
  }, IDLE_HIDE_MS);
 }, []);

 useEffect(() => {
  const decideDirection = () => {
   const scrollableDistance =
    document.documentElement.scrollHeight - window.innerHeight;

   setCanJump(scrollableDistance >= MIN_SCROLLABLE_PX);
   setJumpsToTop(window.scrollY > scrollableDistance / 2);
  };

  // Only a scroll wakes it. A resize or a panel arriving moves the threshold
  // but is not the reader moving through the page.
  const wakeOnScroll = () => {
   decideDirection();
   setIsAwake(true);
   scheduleHide();
  };

  decideDirection();
  window.addEventListener('scroll', wakeOnScroll, { passive: true });

  // Rotating the device changes innerHeight and a panel arriving changes
  // scrollHeight. Neither fires a scroll event, and both move the threshold.
  window.addEventListener('resize', decideDirection);

  const watchDocumentHeight = new ResizeObserver(decideDirection);
  watchDocumentHeight.observe(document.documentElement);

  return () => {
   window.removeEventListener('scroll', wakeOnScroll);
   window.removeEventListener('resize', decideDirection);
   watchDocumentHeight.disconnect();
   window.clearTimeout(hideTimerRef.current);
  };
 }, [scheduleHide]);

 const hold = useCallback(() => {
  isHeldRef.current = true;
  window.clearTimeout(hideTimerRef.current);
 }, []);

 const release = useCallback(() => {
  isHeldRef.current = false;
  scheduleHide();
 }, [scheduleHide]);

 const jumpToEdge = useCallback(() => {
  // Honoured here and not only in CSS: scroll-behavior does not govern a
  // programmatic scroll that names its own behavior.
  const prefersReducedMotion = window.matchMedia(
   '(prefers-reduced-motion: reduce)',
  ).matches;

  window.scrollTo({
   top: jumpsToTop ? 0 : document.documentElement.scrollHeight,
   behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
 }, [jumpsToTop]);

 // Unmounted rather than hidden: a control that cannot act should not hold a
 // tab stop either.
 if (!canJump) return null;

 return (
  <button
   type='button'
   className={`scrollJump${isAwake ? '' : ' scrollJump--asleep'}`}
   onClick={jumpToEdge}
   onPointerEnter={hold}
   onPointerLeave={release}
   onFocus={hold}
   onBlur={release}
   aria-label={
    jumpsToTop ? `Scroll to top of ${subject}` : `Scroll to bottom of ${subject}`
   }
   title={jumpsToTop ? 'Back to top' : 'Go to the end'}
  >
   {/* One drawing for both directions, rotated. A second file would be the
       same arrow upside down. */}
   <ArrowDownLightSvg
    className={`scrollJump__glyph${jumpsToTop ? ' scrollJump__glyph--up' : ''}`}
    aria-hidden='true'
    focusable='false'
   />
  </button>
 );
}

export default ScrollJump;
