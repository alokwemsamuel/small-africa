import { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/hydration';
import { prefersReducedMotion } from './useReducedMotion';

/**
 * Scroll-triggered reveal: CSS animations started by an IntersectionObserver, so no animation
 * library loads for it. Animates only transform/opacity/clip-path (no layout shift). With
 * reduced motion the content simply appears. `stagger` animates direct children in turn.
 *
 * On a pre-built page the content is already showing when React attaches: blocks already on
 * screen stay as they are (hiding them to fade them in again would flicker and delay the
 * page's largest paint). Blocks further down still reveal as they scroll into view.
 */
// The server (pre-built pages) has no layout phase; reveals start in the browser.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function Reveal({ children, as: Tag = 'div', effect = 'rise', stagger, delay = 0, className }) {
  const ref = useRef(null);
  // True only when this block was first drawn by attaching to a pre-built page.
  const hydrated = useHydrated();
  const attaching = useRef(!hydrated).current;

  // Layout effect: content is hidden before the first paint, so it never flashes.
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const targets = stagger ? Array.from(el.children) : [el];
    const hide = () =>
      targets.forEach((t, i) => {
        t.dataset.reveal = 'pending';
        t.dataset.revealEffect = effect;
        t.style.setProperty('--reveal-delay', `${delay + i * (stagger ?? 0)}s`);
      });
    if (!attaching) hide();
    // Pre-built page: the observer's first report says where the block is, without forcing a
    // layout. Already on screen: leave it. Further down: hide it (unseen) until it scrolls in.
    let firstReport = attaching;
    // Starts when the top of the block passes 85% of the viewport height.
    const io = new IntersectionObserver(
      (entries) => {
        if (firstReport) {
          firstReport = false;
          if (entries[0].boundingClientRect.top < window.innerHeight) return io.disconnect();
          return hide();
        }
        if (!entries.some((e) => e.isIntersecting)) return;
        targets.forEach((t) => (t.dataset.reveal = 'in'));
        io.disconnect();
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      targets.forEach((t) => {
        delete t.dataset.reveal;
        delete t.dataset.revealEffect;
      });
    };
  }, [effect, stagger, delay, attaching]);

  return (
    <Tag ref={ref} className={cn(className)}>
      {children}
    </Tag>
  );
}
