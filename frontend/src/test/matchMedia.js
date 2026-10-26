import { vi } from 'vitest';

/** Controllable prefers-color-scheme mock. Call setLight() to simulate the OS changing. */
export function mockColorScheme(initialLight: boolean) {
  let light = initialLight;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = (query: string) =>
    ({
      get matches() {
        return query.includes('light') ? light : !light;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(mql));
  return {
    setLight(next: boolean) {
      light = next;
      listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}
