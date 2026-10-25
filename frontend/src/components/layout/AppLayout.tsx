import { Outlet, ScrollRestoration } from 'react-router-dom';
import { env } from '@/lib/env';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-gold text-obsidian sr-only z-50 rounded-full px-5 py-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {env.demoMode && (
        <div className="bg-gold/95 tracking-overline text-obsidian py-1.5 text-center text-xs font-semibold uppercase">
          Demo version: no real payments or bookings
        </div>
      )}
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </div>
  );
}
