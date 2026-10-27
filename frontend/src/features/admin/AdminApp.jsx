import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DemoRibbon } from '@/components/layout/DemoRibbon';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/Spinner';
import { Toaster } from '@/components/ui/Toaster';
import { useLogout, useMe } from '@/hooks/useAuth';
import { ThemeMenu } from '@/components/layout/ThemeSwitcher';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { can, useAdminMe } from './api';
import { ADMIN_NAV } from './nav';

const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));

const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage');
const OrdersPage = page(() => import('./pages/OrdersPage'), 'OrdersPage');
const OrderTicketPage = page(() => import('./pages/OrderTicketPage'), 'OrderTicketPage');
const ReservationsAdminPage = page(() => import('./pages/ReservationsAdminPage'), 'ReservationsAdminPage');
const MenuAdminPage = page(() => import('./pages/MenuAdminPage'), 'MenuAdminPage');
const CustomersPage = page(() => import('./pages/CustomersPage'), 'CustomersPage');
const CustomerPage = page(() => import('./pages/CustomerPage'), 'CustomerPage');
const RewardsManagerPage = page(() => import('./pages/RewardsManagerPage'), 'RewardsManagerPage');
const ReviewsAdminPage = page(() => import('./pages/ReviewsAdminPage'), 'ReviewsAdminPage');
const CouponsPage = page(() => import('./pages/CouponsPage'), 'CouponsPage');
const EnquiriesPage = page(() => import('./pages/EnquiriesPage'), 'EnquiriesPage');
const StaffPage = page(() => import('./pages/StaffPage'), 'StaffPage');
const SettingsAdminPage = page(() => import('./pages/SettingsAdminPage'), 'SettingsAdminPage');
const AuditPage = page(() => import('./pages/AuditPage'), 'AuditPage');

const ROLE_LABEL = { super_admin: 'Super Admin', manager: 'Manager', staff: 'Staff' };
const POSITION_LABEL = { kitchen: 'Kitchen', front_desk: 'Front desk' };

/** /admin/* : the staff panel, with its own chrome (no public header, footer or smooth scroll). */
export function AdminApp() {
  useSeo({ title: 'Admin' });
  const { data: me, error } = useAdminMe();
  const location = useLocation();

  if (location.pathname.endsWith('/ticket')) {
    // The kitchen ticket prints on its own, without the panel around it.
    return (
      <Suspense fallback={<Spinner label="Loading ticket" />}>
        <Routes>
          <Route path="orders/:reference/ticket" element={<OrderTicketPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <AdminShell me={me}>
      {error ? (
        <Alert tone="error">
          {error instanceof Error ? error.message : 'Could not load the admin panel.'}
        </Alert>
      ) : !me ? (
        <Spinner label="Loading admin" />
      ) : (
        <Suspense
          fallback={
            <div className="grid min-h-60 place-items-center">
              <Spinner label="Loading page" />
            </div>
          }
        >
          <Routes>
            <Route index element={guard(me, 'dashboard.view', <DashboardPage />)} />
            <Route path="orders" element={guard(me, 'orders.view', <OrdersPage />)} />
            <Route path="orders/:reference" element={guard(me, 'orders.view', <OrdersPage />)} />
            <Route
              path="reservations"
              element={guard(me, 'reservations.manage', <ReservationsAdminPage />)}
            />
            <Route path="menu" element={guard(me, 'menu.availability', <MenuAdminPage />)} />
            <Route path="customers" element={guard(me, 'customers.view', <CustomersPage />)} />
            <Route path="customers/:id" element={guard(me, 'customers.view', <CustomerPage />)} />
            <Route path="rewards" element={guard(me, 'loyalty.manage', <RewardsManagerPage />)} />
            <Route path="reviews" element={guard(me, 'reviews.moderate', <ReviewsAdminPage />)} />
            <Route path="coupons" element={guard(me, 'coupons.manage', <CouponsPage />)} />
            <Route path="enquiries" element={guard(me, 'enquiries.manage', <EnquiriesPage />)} />
            <Route path="staff" element={guard(me, 'staff.manage', <StaffPage />)} />
            <Route path="settings" element={guard(me, 'settings.manage', <SettingsAdminPage />)} />
            <Route path="audit" element={guard(me, 'audit.view', <AuditPage />)} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Suspense>
      )}
    </AdminShell>
  );
}

/** The server enforces every permission; this only avoids showing pages that would 403. */
function guard(me, permission, element) {
  return can(me, permission) ? (
    element
  ) : (
    <Alert tone="info" title="Not available for your role">
      Ask a Super Admin if you need access to this section.
    </Alert>
  );
}

function AdminShell({ me, children }) {
  const { data: user } = useMe();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const nav = ADMIN_NAV.filter((n) => can(me, n.permission));
  const roleLabel = me
    ? me.role === 'staff' && me.staffPosition
      ? POSITION_LABEL[me.staffPosition]
      : ROLE_LABEL[me.role]
    : '';

  const links = (
    <ul className="flex flex-col gap-1">
      {nav.map((n) => (
        <li key={n.to}>
          <NavLink
            to={n.to}
            end={n.to === '/admin'}
            className={({ isActive }) =>
              cn(
                'flex min-h-10 items-center rounded-sm px-3 text-sm transition-colors',
                isActive
                  ? 'bg-accent-fill/15 text-primary font-semibold'
                  : 'text-secondary hover:text-primary hover:bg-accent-fill/5',
              )
            }
          >
            {n.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      data-overflow-guard
      className="bg-surface relative min-h-dvh overflow-x-clip lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <a
        href="#admin-main"
        className="bg-accent-fill text-on-accent sr-only z-50 rounded-full px-5 py-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside className="border-line bg-surface-raised hidden border-r lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Link to="/admin" className="flex items-center gap-3 px-5 py-5" aria-label="Small Africa admin home">
          <Logo variant="mark" className="w-10" />
          <span>
            <span className="block font-serif text-lg leading-none">Small Africa</span>
            <span className="eyebrow text-accent text-[10px]">Admin</span>
          </span>
        </Link>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3">
          {links}
        </nav>
        <div className="border-line border-t p-4 text-sm">
          <p className="font-semibold">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-muted text-xs">{roleLabel}</p>
          {me && !me.twoFactorEnabled && me.role !== 'staff' && (
            <Link to="/account?tab=settings" className="text-accent mt-2 block text-xs underline">
              Turn on two-factor sign-in
            </Link>
          )}
          <div className="mt-3 flex items-center gap-2">
            <ThemeMenu />
            <Link to="/" className="text-secondary hover:text-primary text-xs underline">
              View site
            </Link>
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="text-secondary hover:text-primary ml-auto text-xs underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {env.demoMode && <DemoRibbon />}
        <header className="border-line bg-surface-raised sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-4 py-3 lg:hidden">
          <Link to="/admin" className="flex items-center gap-2" aria-label="Small Africa admin home">
            <Logo variant="mark" className="w-9" />
            <span className="eyebrow text-accent">Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeMenu />
            <button
              type="button"
              aria-expanded={open}
              aria-controls="admin-mobile-nav"
              onClick={() => setOpen((o) => !o)}
              className="border-accent/40 text-accent min-h-10 rounded-full border px-4 text-sm font-semibold"
            >
              {open ? 'Close' : 'Menu'}
            </button>
          </div>
        </header>
        {open && (
          <nav
            id="admin-mobile-nav"
            aria-label="Admin"
            className="border-line bg-surface-raised border-b p-3 lg:hidden"
          >
            {links}
            <div className="border-line mt-3 flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-secondary">
                {user?.firstName} · {roleLabel}
              </span>
              <button type="button" onClick={() => logout.mutate()} className="text-accent underline">
                Sign out
              </button>
            </div>
          </nav>
        )}
        <main
          id="admin-main"
          tabIndex={-1}
          className="mx-auto max-w-7xl px-4 py-8 focus:outline-none sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
