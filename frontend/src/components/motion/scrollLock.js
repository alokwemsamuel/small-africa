import { getLenis } from './lenis';

let locks = 0;
let saved = null;

/**
 * Stops the page scrolling behind a full-screen overlay, and puts it back exactly where it was.
 * The page is pinned in place (position: fixed) rather than hidden with overflow, which keeps
 * the scroll position and works on iOS. Lenis (smooth scrolling, wheel devices) is paused too.
 * Safe to call more than once: the page is released when the last lock is.
 * @returns {() => void} unlock
 */
export function lockScroll() {
  if (locks++ === 0) {
    const body = document.body;
    const y = window.scrollY;
    // The scrollbar disappears when the page is pinned: keep the layout from jumping sideways.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    saved = {
      y,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    getLenis()?.stop();
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.width = '100%';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }
  let released = false;
  return () => {
    if (released || --locks > 0) return;
    released = true;
    const body = document.body;
    const { y, position, top, width, paddingRight } = saved;
    body.style.position = position;
    body.style.top = top;
    body.style.width = width;
    body.style.paddingRight = paddingRight;
    window.scrollTo({ top: y, behavior: 'instant' });
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo(y, { immediate: true });
      lenis.start();
    }
    saved = null;
  };
}
