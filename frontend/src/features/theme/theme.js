/** Mirrors public/theme-init.js, which applies the same logic before React loads. */
export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'sa-theme';
export const THEME_COLORS: Record<ResolvedTheme, string> = { dark: '#0E0C0A', light: '#F6EFE3' };
const LIGHT_QUERY = '(prefers-color-scheme: light)';

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === 'dark' || v === 'light' || v === 'system';
}

/** UI preference only (never auth data). Storage can be blocked, so every access is guarded. */
export function readStoredPreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

export function storePreference(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore: the choice still applies for this visit */
  }
}

export function systemPrefersLight(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches;
}

export function resolveTheme(pref: ThemePreference, prefersLight: boolean): ResolvedTheme {
  return pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref;
}

export function applyTheme(resolved: ResolvedTheme, pref: ThemePreference): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-preference', pref);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}

/** Subscribes to OS appearance changes; returns an unsubscribe function. */
export function watchSystemTheme(onChange: (prefersLight: boolean) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(LIGHT_QUERY);
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
