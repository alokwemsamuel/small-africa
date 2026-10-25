/*
 * Applies the saved appearance before the first paint (no flash of the wrong theme).
 * Loaded as a blocking external script from <head>, so the CSP needs no 'unsafe-inline'.
 * Must stay in sync with src/features/theme/theme.ts (storage key and colours).
 */
(function () {
  var pref = 'dark';
  try {
    var saved = window.localStorage.getItem('sa-theme');
    if (saved === 'dark' || saved === 'light' || saved === 'system') pref = saved;
  } catch (e) {
    /* storage blocked (private mode): keep the default */
  }
  var prefersLight = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  var resolved = pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref;
  var root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-preference', pref);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#F6EFE3' : '#0E0C0A');
})();
