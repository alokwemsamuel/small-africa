import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource-variable/manrope';
import '@fontsource/italiana/400.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { api, setTransport } from './lib/api';

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
