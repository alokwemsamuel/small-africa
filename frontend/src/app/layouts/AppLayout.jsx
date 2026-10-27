import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { PageTransition } from '@/components/motion/PageTransition';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { Spinner } from '@/components/ui/Spinner';
import { Toaster } from '@/components/ui/Toaster';
import { env } from '@/lib/env';
import { CookieNotice } from '@/components/layout/CookieNotice';
import { DemoRibbon } from '@/components/layout/DemoRibbon';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { WhatsAppButton } from '@/components/layout/WhatsAppButton';

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-accent-fill text-on-accent sr-only z-50 rounded-full px-5 py-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {env.demoMode && <DemoRibbon />}
      <SmoothScroll />
      <SiteHeader />
      {/* At least a screen tall, so the footer starts below the fold and can't jump when data loads. */}
      <main id="main" tabIndex={-1} className="min-h-dvh flex-1 focus:outline-none">
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
