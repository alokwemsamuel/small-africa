import { ApiError, setTransport } from '@/lib/api';
import { buildState } from './build';
import { clearPersisted, loadPersisted, persist, setState } from './db';
import { dispatch } from './router';
export { SocialConsent } from './SocialConsent';
import '@/lib/demo/routes/public';
import '@/lib/demo/routes/account';
import '@/lib/demo/routes/admin';
import { now, ymd } from './time';

/**
 * Demo mode (VITE_DEMO_MODE=true, the GitHub Pages build): the whole API runs in the browser
 * against a copy of the seeded database kept in localStorage. No server, no real payments.
 */

const pause = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

let latency = true;

const demoTransport = async (path, options) => {
  // A short, realistic delay so loading states behave as they do against the real API.
  if (latency) await pause(120 + Math.random() * 200, options.signal);
  try {
    const result = await dispatch(path, options);
    if ((options.method ?? 'GET') !== 'GET') persist();
    // A copy, so screens can never change the database by editing what they were given.
    return structuredClone(result);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error('[demo]', path, e);
    throw new ApiError(500, 'server_error', 'Something went wrong in the demo. Try “Reset demo data”.');
  }
};

let snapshotUsed = false;

/** Builds in a Web Worker so the page stays responsive while the demo starts. */
function buildInWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./build.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      worker.terminate();
      resolve(JSON.parse(e.data));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };
    worker.postMessage('build');
  });
}

async function freshState() {
  if (typeof Worker !== 'undefined') {
    try {
      const state = await buildInWorker();
      setState(state);
      return state;
    } catch {
      // Fall back to building here (e.g. workers blocked).
    }
  }
  const snapshot = (await import('./snapshot.json')).default;
  const consume = !snapshotUsed;
  snapshotUsed = true;
  return buildState(snapshot, now(), { consume });
}

/**
 * `latency: false` answers instantly (tests). A fresh build is not saved until something
 * changes (the first sign-in, order or booking): it is the same all day, so a reload rebuilds
 * it identically, and the first visit skips writing ~1.5 MB to storage.
 */
export async function installDemo(options = {}) {
  latency = options.latency ?? true;
  const saved = loadPersisted();
  // A new day starts from fresh data, so "today" on the dashboard is always busy.
  if (saved && saved.builtOn === ymd(now())) setState(saved);
  else await freshState();
  setTransport(demoTransport);
}

/** Starts the demo over (signed out, today's data). */
export async function resetDemo() {
  clearPersisted();
  await freshState();
}
