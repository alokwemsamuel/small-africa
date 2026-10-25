import Lenis from 'lenis';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { gsap, ScrollTrigger } from './gsap';
import { scrollToTop, setLenis } from './lenis';
import { useReducedMotion } from './useReducedMotion';

/**
 * Lenis smooth scrolling for wheel/trackpad. Touch devices keep native momentum scrolling
 * (syncTouch off), so mobile never feels laggy or hijacked. Lenis drives GSAP's ticker and
 * updates ScrollTrigger on every frame so pinned/scrubbed animations stay in sync.
 */
export function SmoothScroll() {
  const reduced = useReducedMotion();
  const { pathname } = useLocation();

  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, syncTouch: false, anchors: true });
    setLenis(lenis);
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add('lenis');
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      setLenis(null);
      document.documentElement.classList.remove('lenis');
    };
  }, [reduced]);

  // New page: start at the top and let ScrollTrigger re-measure the new layout.
  useEffect(() => {
    scrollToTop();
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 120);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return null;
}
