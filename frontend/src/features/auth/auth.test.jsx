import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoutes, mockApi } from '@/test/utils';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './RequireAuth';

const guest = {
  id: 3,
  firstName: 'Chiamaka',
  lastName: 'Bello',
  email: 'guest@smallafrica.demo',
  phone: null,
  role: 'customer',
  staffPosition: null,
  emailVerified: true,
  birthday: null,
  favouriteKitchenId: null,
  referralCode: 'GUEST2026',
  marketingOptIn: false,
  themePreference: null,
  twoFactorEnabled: false,
  createdAt: '2026-01-01 00:00:00',
};

const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/account',
    element: (
      <RequireAuth>
        <p>Account area</p>
      </RequireAuth>
    ),
  },
  {
    path: '/admin',
    element: (
      <RequireAuth roles={['super_admin', 'manager', 'staff']}>
        <p>Admin area</p>
      </RequireAuth>
    ),
  },
  { path: '/', element: <p>Home</p> },
];

describe('LoginPage', () => {
  it('validates before calling the API', async () => {
    const { calls } = mockApi({});
    renderRoutes(routes, '/login');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/auth/login')).toHaveLength(0);
  });

  it('sends the CSRF token and shows server errors', async () => {
    const { calls } = mockApi({
      'POST /auth/login': () => ({
        status: 401,
        body: {
          error: { code: 'invalid_credentials', message: 'That email and password combination didn’t work.' },
        },
      }),
    });
    renderRoutes(routes, '/login');
    await userEvent.type(screen.getByLabelText('Email'), 'guest@smallafrica.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password combination didn’t work.',
    );
    const login = calls.find((c) => c.path === '/auth/login');
    expect(login?.headers['X-CSRF-Token']).toBe('test-token');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('signs in and returns to the protected page the user came from', async () => {
    mockApi({
      'GET /auth/me': () => ({ body: { user: null } }),
      'POST /auth/login': () => ({ body: { user: guest, csrfToken: 'rotated' } }),
    });
    const { router } = renderRoutes(routes, '/account');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));

    await userEvent.type(
      await screen.findByLabelText('Email', {}, { timeout: 5000 }),
      'guest@smallafrica.demo',
    );
    await userEvent.type(screen.getByLabelText('Password'), 'SmallAfrica@Guest2026');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Account area', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('moves to the 2FA step when the server asks for it', async () => {
    mockApi({ 'POST /auth/login': () => ({ body: { twoFactorRequired: true } }) });
    renderRoutes(routes, '/login');
    await userEvent.type(screen.getByLabelText('Email'), 'admin@smallafrica.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'SmallAfrica@Admin2026');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByLabelText('6-digit code')).toBeInTheDocument();
  });

  it('retries once with a fresh token after a CSRF mismatch', async () => {
    let attempts = 0;
    mockApi({
      'POST /auth/login': () => {
        attempts++;
        return attempts === 1
          ? { status: 403, body: { error: { code: 'csrf_mismatch', message: 'expired' } } }
          : { body: { twoFactorRequired: true } };
      },
    });
    renderRoutes(routes, '/login');
    await userEvent.type(screen.getByLabelText('Email'), 'admin@smallafrica.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'SmallAfrica@Admin2026');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByLabelText('6-digit code')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});

describe('RequireAuth', () => {
  it('keeps customers out of staff routes', async () => {
    mockApi({ 'GET /auth/me': () => ({ body: { user: guest } }) });
    const { router } = renderRoutes(routes, '/admin');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByText('Admin area')).not.toBeInTheDocument();
  });
});
