import { startTransition, useEffect, useState, useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};

/**
 * False on the server and while React attaches to pre-built HTML; true afterwards (and at
 * once in pages drawn only in the browser). Use it for anything that depends on this browser
 * (saved theme, basket, today's date), so the first render matches the pre-built page.
 *
 * The switch to true is a low-priority update (startTransition), so React finishes attaching
 * every part of the page first instead of throwing the pre-built HTML away.
 * @returns {boolean}
 */
export function useHydrated() {
  const inBrowserRender = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [hydrated, setHydrated] = useState(inBrowserRender);
  useEffect(() => {
    if (!hydrated) startTransition(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
}
