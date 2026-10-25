import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { PageTransition } from '@/components/motion/PageTransition';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { Spinner } from '@/components/ui/Spinner';
import { Toaster } from '@/components/ui/Toaster';
import { env } from '@/lib/env';
import { CookieNotice } from './CookieNotice';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { WhatsAppButton } from './WhatsAppButton';

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-accent-fill text-on-accent sr-only z-50 rounded-full px-5 py-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {env.demoMode && (
        <div className="bg-accent-fill/95 tracking-overline text-on-accent py-1.5 text-center text-xs font-semibold uppercase">
          Demo version: no real payments or bookings
        </div>
      )}
      <SmoothScroll />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Suspense
          fallback={
            <div className="text-accent grid min-h-[60vh] place-items-center">
              <Spinner label="Loading page" />
            </div>
          }
        >
          <PageTransition>
            <Outlet />
          </PageTransition>
        </Suspense>
      </main>
      <SiteFooter />
      <WhatsAppButton />
      <CookieNotice />
      <Toaster />
    </div>
  );
}
