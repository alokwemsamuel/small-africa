import { useLayoutEffect, useRef, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { gsap } from './gsap';
import { prefersReducedMotion } from './useReducedMotion';

type Effect = 'rise' | 'fade' | 'clip';

/**
 * Scroll-triggered reveal (GSAP ScrollTrigger). Animates only transform/opacity/clip-path,
 * so there's no layout shift. With reduced motion the content simply appears.
 * `stagger` animates direct children one after another.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  effect = 'rise',
  stagger,
  delay = 0,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  effect?: Effect;
  stagger?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const targets = stagger ? Array.from(el.children) : [el];
    const from: gsap.TweenVars =
      effect === 'clip'
        ? { clipPath: 'inset(0 0 100% 0)', y: 24 }
        : effect === 'fade'
          ? { opacity: 0 }
          : { opacity: 0, y: 40 };
    const ctx = gsap.context(() => {
      gsap.from(targets, {
        ...from,
        delay,
        stagger: stagger ?? 0,
        duration: effect === 'clip' ? 1.2 : 1,
        clearProps: 'all',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
    }, el);
    return () => ctx.revert();
  }, [effect, stagger, delay]);

  return (
    <Tag ref={ref} className={cn(className)}>
      {children}
    </Tag>
  );
}
