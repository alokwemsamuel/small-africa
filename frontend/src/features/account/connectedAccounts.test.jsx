import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { mockApi, renderRoutes } from '@/test/utils';
import { ConnectedAccounts } from './ConnectedAccounts';

vi.mock('@/lib/redirect', () => ({ redirectTo: vi.fn() }));
const { redirectTo } = await import('@/lib/redirect');

const routes = [{ path: '/account', element: <ConnectedAccounts /> }];
const connected = {
  provider: 'google',
  email: 'ada@example.com',
  connectedAt: '2026-10-20 10:00:00',
  lastUsedAt: null,
};
const identities = (body) => ({ 'GET /account/identities': () => ({ body }) });

describe('Connected accounts', () => {
  it('shows what is connected and what could be, with the right button on each', async () => {
    mockApi(
      identities({ identities: [connected], hasPassword: true, available: ['google', 'apple', 'facebook'] }),
    );
    renderRoutes(routes, '/account');
    expect(await screen.findByRole('heading', { name: 'Connected accounts' })).toBeInTheDocument();
    expect(screen.getByText(/Connected · ada@example.com/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Apple' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Facebook' })).toBeInTheDocument();
    expect(screen.queryByText(/have a password yet/)).toBeNull();
  });

  it('only offers providers that have keys, and still lets a connected one be disconnected', async () => {
    mockApi(
      identities({
        identities: [{ ...connected, provider: 'facebook' }],
        hasPassword: true,
        available: ['google'],
      }),
    );
    renderRoutes(routes, '/account');
    await screen.findByRole('heading', { name: 'Connected accounts' });
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Apple' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Disconnect Facebook' })).toBeInTheDocument();
  });

  it('leaves the section out when there is nothing to connect or the server cannot say', async () => {
    mockApi(identities({ identities: [], hasPassword: true, available: [] }));
    const view = renderRoutes(routes, '/account');
    await waitFor(() => expect(screen.queryByText('Loading connected accounts')).toBeNull());
    expect(view.container).toBeEmptyDOMElement();
    view.unmount();
    mockApi({});
    const none = renderRoutes(routes, '/account');
    await waitFor(() => expect(screen.queryByText('Loading connected accounts')).toBeNull());
    expect(none.container).toBeEmptyDOMElement();
  });

  it('sends the browser to the provider to connect, in "link" mode', async () => {
    mockApi(identities({ identities: [], hasPassword: true, available: ['apple'] }));
    renderRoutes(routes, '/account');
    await userEvent.click(await screen.findByRole('button', { name: 'Connect Apple' }));
    expect(redirectTo).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/oauth\/apple\/start\?mode=link$/));
  });

  it('disconnects a provider', async () => {
    let removed = null;
    let list = [connected, { ...connected, provider: 'apple' }];
    mockApi({
      'GET /account/identities': () => ({
        body: { identities: list, hasPassword: false, available: ['google', 'apple'] },
      }),
      'DELETE /account/identities/apple': () => {
        removed = 'apple';
        list = [connected];
        return { body: { ok: true } };
      },
    });
    renderRoutes(routes, '/account');
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect Apple' }));
    await waitFor(() => expect(removed).toBe('apple'));
    expect(await screen.findByRole('button', { name: 'Connect Apple' })).toBeInTheDocument();
  });

  it('explains why the last way to sign in cannot be disconnected, and points to the password', async () => {
    mockApi({
      ...identities({ identities: [connected], hasPassword: false, available: ['google'] }),
      'DELETE /account/identities/google': () => ({
        status: 409,
        body: {
          error: {
            code: 'last_sign_in_method',
            message: 'This is your only way to sign in. Set a password first, then you can disconnect it.',
          },
        },
      }),
    });
    renderRoutes(routes, '/account');
    expect(await screen.findByText(/have a password yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect Google' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/only way to sign in/)).toBeInTheDocument();
    expect(screen.getByText(/Connected · ada@example.com/)).toBeInTheDocument();
  });

  it('shows the result of connecting, or of a failed attempt, from the address', async () => {
    mockApi(identities({ identities: [connected], hasPassword: true, available: ['google'] }));
    const ok = renderRoutes(routes, '/account?connected=google');
    expect(await screen.findByText('Google is now connected.')).toBeInTheDocument();
    ok.unmount();
    mockApi(identities({ identities: [], hasPassword: true, available: ['google'] }));
    renderRoutes(routes, '/account?error=social_in_use');
    expect(await screen.findByText(/already connected to another Small Africa customer/)).toBeInTheDocument();
  });
});
