import { QueryClient } from '@tanstack/react-query';
import type { RouteObject } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AccountPage } from './features/account/AccountPage';
import { ForgotPasswordPage } from './features/auth/pages/ForgotPasswordPage';
import { LoginPage } from './features/auth/pages/LoginPage';
import { RegisterPage } from './features/auth/pages/RegisterPage';
import { ResetPasswordPage } from './features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from './features/auth/pages/VerifyEmailPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { STAFF_ROLES } from './features/auth/types';
import { ApiError } from './lib/api';
import { AdminHomePage } from './pages/AdminHomePage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage, PlaceholderPage } from './pages/PlaceholderPage';
import { StyleGuidePage } from './pages/StyleGuidePage';

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

const placeholder = (path: string, title: string, phase: string): RouteObject => ({
  path,
  element: <PlaceholderPage title={title} phase={phase} />,
});

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
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
      placeholder('menu', 'The Menu', 'Phase 3'),
      placeholder('reservations', 'Reservations', 'Phase 4'),
      placeholder('events', 'Events & Catering', 'Phase 3'),
      placeholder('about', 'Our Story', 'Phase 3'),
      placeholder('gallery', 'Gallery', 'Phase 3'),
      placeholder('contact', 'Contact', 'Phase 3'),
      placeholder('rewards', 'Interest Account', 'Phase 5'),
      placeholder('faq', 'FAQ', 'Phase 3'),
      placeholder('privacy', 'Privacy Policy', 'Phase 3'),
      placeholder('terms', 'Terms', 'Phase 3'),
      placeholder('rewards-terms', 'Rewards Terms', 'Phase 5'),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
