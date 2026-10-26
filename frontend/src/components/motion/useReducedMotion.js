import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(fn: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', fn);
  return () => mql.removeEventListener('change', fn);
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** Live `prefers-reduced-motion`: every animation in the app checks this. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
