/*
 * Applies the saved appearance before the first paint (no flash of the wrong theme), hides the
 * cookie notice in pre-built pages for visitors who already closed it, and on the home page
 * starts loading the hero poster early.
 * Loaded as a blocking external script from <head>, so the CSP needs no 'unsafe-inline'.
 * Must stay in sync with src/app/theme/theme.js (storage key and colours) and
 * src/components/layout/CookieNotice.jsx (storage key).
 */
(function () {
  var pref = 'dark';
  try {
    var saved = window.localStorage.getItem('sa-theme');
    if (saved === 'dark' || saved === 'light' || saved === 'system') pref = saved;
    if (window.localStorage.getItem('sa-cookie-notice') === '1') {
      document.documentElement.setAttribute('data-cookie-notice', 'closed');
    }
  } catch (_e) {
    /* storage blocked (private mode): keep the default */
  }
  var prefersLight = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  var resolved = pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref;
  var root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-preference', pref);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#F6EFE3' : '#0E0C0A');

  // Home page only: the largest image is the hero poster, so start fetching it now rather than
  // after the app's JavaScript. Same files and media rule as Hero.jsx; browsers without AVIF
  // skip the hint and the <picture> picks WebP as usual.
  var src = document.currentScript && document.currentScript.src;
  var base = src ? src.replace(/theme-init\.js.*$/, '') : '';
  if (base && location.origin + location.pathname === base) {
    var portrait = '(orientation: portrait) and (max-width: 1024px)';
    [
      ['poster-720x1280.avif', portrait],
      ['poster-1920.avif', 'not all and ' + portrait],
    ].forEach(function (p) {
      var link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.type = 'image/avif';
      link.href = base + 'hero/' + p[0];
      link.media = p[1];
      link.setAttribute('fetchpriority', 'high');
      document.head.appendChild(link);
    });
  }
})();
