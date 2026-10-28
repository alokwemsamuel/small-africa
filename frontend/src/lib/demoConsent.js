import { lazy } from 'react';

/**
 * The demo's simulated provider consent screen, or null in every other build. The demo (GitHub
 * Pages) has no server to sign in through. It lives in the demo bundle: `@/lib/demo` is an empty
 * stub outside the demo, and this branch is removed from those builds at build time.
 */
export const DemoConsent =
  import.meta.env.VITE_DEMO_MODE === 'true'
    ? lazy(() => import('@/lib/demo').then((m) => ({ default: m.SocialConsent })))
    : null;
