import { QueryClient } from '@tanstack/react-query';
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './features/auth/RequireAuth';
import { STAFF_ROLES } from './features/auth/types';
import { ApiError } from './lib/api';
import { HomePage } from './pages/HomePage';
import { NotFoundPage, PlaceholderPage } from './pages/PlaceholderPage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Don't retry client errors (401/403/404/422): only transient failures.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

/** Every page except Home is code-split so the first visit stays fast. */
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const MenuPage = page(() => import('./features/menu/MenuPage'), 'MenuPage');
const DishDetailPage = page(() => import('./features/menu/DishDetailPage'), 'DishDetailPage');
const CartPage = page(() => import('./features/cart/CartPage'), 'CartPage');
const AboutPage = page(() => import('./pages/AboutPage'), 'AboutPage');
const GalleryPage = page(() => import('./pages/GalleryPage'), 'GalleryPage');
const EventsPage = page(() => import('./pages/EventsPage'), 'EventsPage');
const ContactPage = page(() => import('./pages/ContactPage'), 'ContactPage');
const FaqPage = page(() => import('./pages/FaqPage'), 'FaqPage');
const PrivacyPage = page(() => import('./pages/legal/PrivacyPage'), 'PrivacyPage');
const TermsPage = page(() => import('./pages/legal/TermsPage'), 'TermsPage');
const StyleGuidePage = page(() => import('./pages/StyleGuidePage'), 'StyleGuidePage');
const LoginPage = page(() => import('./features/auth/pages/LoginPage'), 'LoginPage');
const RegisterPage = page(() => import('./features/auth/pages/RegisterPage'), 'RegisterPage');
const ForgotPasswordPage = page(
  () => import('./features/auth/pages/ForgotPasswordPage'),
  'ForgotPasswordPage',
);
const ResetPasswordPage = page(() => import('./features/auth/pages/ResetPasswordPage'), 'ResetPasswordPage');
const VerifyEmailPage = page(() => import('./features/auth/pages/VerifyEmailPage'), 'VerifyEmailPage');
const AccountPage = page(() => import('./features/account/AccountPage'), 'AccountPage');
const AdminHomePage = page(() => import('./pages/AdminHomePage'), 'AdminHomePage');

const placeholder = (path: string, title: string, phase: string): RouteObject => ({
  path,
  element: <PlaceholderPage title={title} phase={phase} />,
});

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '__hero-capture', Component: lazy(() => import('./features/home/hero/HeroCapture')) }]
  : [];

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'menu', element: <MenuPage /> },
      { path: 'menu/:slug', element: <DishDetailPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'gallery', element: <GalleryPage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'faq', element: <FaqPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'style-guide', element: <StyleGuidePage /> },
      {
        path: 'account',
        element: (
          <RequireAuth>
            <AccountPage />
          </RequireAuth>
        ),
      },
      {
        path: 'admin/*',
        element: (
          <RequireAuth roles={STAFF_ROLES}>
            <AdminHomePage />
          </RequireAuth>
        ),
      },
      placeholder('reservations', 'Reservations', 'Phase 4'),
      placeholder('rewards', 'Interest Account', 'Phase 5'),
      placeholder('rewards-terms', 'Rewards Terms', 'Phase 5'),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  ...devRoutes,
];
