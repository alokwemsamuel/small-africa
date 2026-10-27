import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from './useReducedMotion';

/**
 * Scroll-triggered reveal: CSS animations started by an IntersectionObserver, so no animation
 * library loads for it. Animates only transform/opacity/clip-path (no layout shift). With
 * reduced motion the content simply appears. `stagger` animates direct children in turn.
 */
export function Reveal({ children, as: Tag = 'div', effect = 'rise', stagger, delay = 0, className }) {
  const ref = useRef(null);

  // Layout effect: content is hidden before the first paint, so it never flashes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const targets = stagger ? Array.from(el.children) : [el];
    targets.forEach((t, i) => {
      t.dataset.reveal = 'pending';
      t.dataset.revealEffect = effect;
      t.style.setProperty('--reveal-delay', `${delay + i * (stagger ?? 0)}s`);
    });
    // Starts when the top of the block passes 85% of the viewport height.
    const io = new IntersectionObserver(
      (entries) => {
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
  }, [effect, stagger, delay]);

  return (
    <Tag ref={ref} className={cn(className)}>
      {children}
    </Tag>
  );
}
