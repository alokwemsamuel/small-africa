import { QueryClient } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { AppLayout } from '@/app/layouts/AppLayout';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { STAFF_ROLES } from '@/lib/roles';
import { ApiError } from '@/lib/api';
import { HomePage } from '@/features/home/pages/HomePage';
import { NotFoundPage } from '@/components/layout/NotFoundPage';

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
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));

const MenuPage = page(() => import('@/features/menu/pages/MenuPage'), 'MenuPage');
const DishDetailPage = page(() => import('@/features/menu/pages/DishDetailPage'), 'DishDetailPage');
const CartPage = page(() => import('@/features/cart-checkout/pages/CartPage'), 'CartPage');
const AboutPage = page(() => import('@/features/content/pages/AboutPage'), 'AboutPage');
const GalleryPage = page(() => import('@/features/content/pages/GalleryPage'), 'GalleryPage');
const EventsPage = page(() => import('@/features/events/pages/EventsPage'), 'EventsPage');
const ContactPage = page(() => import('@/features/content/pages/ContactPage'), 'ContactPage');
const FaqPage = page(() => import('@/features/content/pages/FaqPage'), 'FaqPage');
const PrivacyPage = page(() => import('@/features/content/pages/legal/PrivacyPage'), 'PrivacyPage');
const TermsPage = page(() => import('@/features/content/pages/legal/TermsPage'), 'TermsPage');
const StyleGuidePage = page(() => import('@/features/content/pages/StyleGuidePage'), 'StyleGuidePage');
const LoginPage = page(() => import('@/features/auth/pages/LoginPage'), 'LoginPage');
const RegisterPage = page(() => import('@/features/auth/pages/RegisterPage'), 'RegisterPage');
const ForgotPasswordPage = page(
  () => import('@/features/auth/pages/ForgotPasswordPage'),
  'ForgotPasswordPage',
);
const ResetPasswordPage = page(() => import('@/features/auth/pages/ResetPasswordPage'), 'ResetPasswordPage');
const VerifyEmailPage = page(() => import('@/features/auth/pages/VerifyEmailPage'), 'VerifyEmailPage');
const CheckoutPage = page(() => import('@/features/cart-checkout/pages/CheckoutPage'), 'CheckoutPage');
const OrderTrackingPage = page(
  () => import('@/features/orders/pages/OrderTrackingPage'),
  'OrderTrackingPage',
);
const ReservationsPage = page(
  () => import('@/features/reservations/pages/ReservationsPage'),
  'ReservationsPage',
);
const ManageReservationPage = page(
  () => import('@/features/reservations/pages/ManageReservationPage'),
  'ManageReservationPage',
);
const RewardsPage = page(() => import('@/features/rewards/pages/RewardsPage'), 'RewardsPage');
const RewardsTermsPage = page(
  () => import('@/features/content/pages/legal/RewardsTermsPage'),
  'RewardsTermsPage',
);
const AccountPage = page(() => import('@/features/account/pages/AccountPage'), 'AccountPage');
const AdminApp = page(() => import('@/features/admin/AdminApp'), 'AdminApp');

export const routes = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'menu', element: <MenuPage /> },
      { path: 'menu/:slug', element: <DishDetailPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'orders/:reference', element: <OrderTrackingPage /> },
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
      { path: 'reservations', element: <ReservationsPage /> },
      { path: 'reservations/:code', element: <ManageReservationPage /> },
      { path: 'rewards', element: <RewardsPage /> },
      { path: 'rewards-terms', element: <RewardsTermsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    // The admin panel has its own layout (no public header, footer or smooth scroll).
    path: 'admin/*',
    element: (
      <RequireAuth roles={STAFF_ROLES}>
        <Suspense fallback={null}>
          <AdminApp />
        </Suspense>
      </RequireAuth>
    ),
  },
];
