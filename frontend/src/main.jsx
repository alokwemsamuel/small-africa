import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource-variable/manrope';
import '@fontsource/italiana/400.css';
import './styles/index.css';
import { hydrate } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { matchRoutes } from 'react-router-dom';
import { queryClient, routes } from '@/app/router';
import { api, setTransport } from './lib/api';
import { basename } from './lib/env';

// The GitHub Pages demo runs the API in the browser; this code is left out of other builds.
// The page renders straight away; API calls wait until the demo database is ready. The demo
// starts once the browser is idle, so the first screen's files download first on slow links.
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  const ready = new Promise((resolve) => {
    const start = () => void import('@/lib/demo').then(({ installDemo }) => installDemo().then(resolve));
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 200);
  });
  setTransport((path, options) => ready.then(() => api(path, options)));
}

/** Pages whose content depends on the query string (e.g. ?kitchen=polish) are drawn afresh. */
const USES_QUERY_STRING = ['/menu'];

/** The pre-built page's data, when this HTML file was pre-built for the current address. */
function prebuilt() {
  const el = document.getElementById('prerender');
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    const base = basename === '/' ? '' : basename;
    const path = window.location.pathname.slice(base.length).replace(/\/$/, '') || '/';
    if (data.path !== path) return null;
    if (window.location.search && USES_QUERY_STRING.includes(path)) return null;
    return data;
  } catch {
    return null;
  }
}

const container = document.getElementById('root');
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
const page = prebuilt();
if (page) {
  // Attach to the pre-built HTML (scripts/prerender.mjs) with the data it was built from.
  // The page's own code is loaded first, so React can attach to all of it in one go.
  const matches = matchRoutes(routes, window.location, basename) ?? [];
  await Promise.all(matches.map((m) => m.route.element?.type?.preload?.()).filter(Boolean));
  hydrate(queryClient, page.state);
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
