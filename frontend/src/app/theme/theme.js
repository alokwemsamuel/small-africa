/** Mirrors public/theme-init.js, which applies the same logic before React loads. */

export const THEME_STORAGE_KEY = 'sa-theme';
const THEME_COLORS = { dark: '#0E0C0A', light: '#F6EFE3' };
const LIGHT_QUERY = '(prefers-color-scheme: light)';

function isThemePreference(v) {
  return v === 'dark' || v === 'light' || v === 'system';
}

/** UI preference only (never auth data). Storage can be blocked, so every access is guarded. */
export function readStoredPreference() {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

export function storePreference(pref) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore: the choice still applies for this visit */
  }
}

export function systemPrefersLight() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(LIGHT_QUERY).matches
  );
}

export function resolveTheme(pref, prefersLight) {
  return pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref;
}

export function applyTheme(resolved, pref) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-preference', pref);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}

/** Subscribes to OS appearance changes; returns an unsubscribe function. */
export function watchSystemTheme(onChange) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(LIGHT_QUERY);
  const handler = (e) => onChange(e.matches);
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
