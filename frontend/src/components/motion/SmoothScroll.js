import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { scrollToTop, setLenis } from './lenis';
import { loadGsap, refreshScrollTriggers } from './loadGsap';
import { useReducedMotion } from './useReducedMotion';

/**
 * Lenis smooth scrolling for wheel/trackpad only: touch devices keep native momentum
 * scrolling and never download it. Lenis and GSAP load after first paint; Lenis then drives
 * GSAP's ticker and updates ScrollTrigger on every frame so scrubbed animations stay in sync.
 */
export function SmoothScroll() {
  const reduced = useReducedMotion();
  const { pathname } = useLocation();

  useEffect(() => {
    if (reduced || !window.matchMedia?.('(pointer: fine)').matches) return;
    let cancelled = false;
    let cleanup = () => {};
    void Promise.all([import('lenis'), loadGsap()]).then(([{ default: Lenis }, { gsap, ScrollTrigger }]) => {
      if (cancelled) return;
      const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, syncTouch: false, anchors: true });
      setLenis(lenis);
      lenis.on('scroll', ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      document.documentElement.classList.add('lenis');
      cleanup = () => {
        gsap.ticker.remove(tick);
        lenis.destroy();
        setLenis(null);
        document.documentElement.classList.remove('lenis');
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [reduced]);

  // New page: start at the top and let ScrollTrigger re-measure the new layout.
  useEffect(() => {
    scrollToTop();
    const id = window.setTimeout(refreshScrollTriggers, 120);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return null;
}
