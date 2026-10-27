import { vi } from 'vitest';

/** Controllable prefers-color-scheme mock. Call setLight() to simulate the OS changing. */
export function mockColorScheme(initialLight) {
  let light = initialLight;
  const listeners = new Set();
  const mql = (query) => ({
    get matches() {
      return query.includes('light') ? light : !light;
    },
    media: query,
    onchange: null,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  vi.stubGlobal('matchMedia', vi.fn(mql));
  return {
    setLight(next) {
      light = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}
