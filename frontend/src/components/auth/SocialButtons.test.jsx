import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { mockApi, renderRoutes } from '@/test/utils';
import { SocialButtons } from './SocialButtons';

vi.mock('@/lib/redirect', () => ({ redirectTo: vi.fn() }));
const { redirectTo } = await import('@/lib/redirect');

const page = (props) => [{ path: '/', element: <SocialButtons mode="sign-up" {...props} /> }];
const providers = (list) => mockApi({ 'GET /auth/providers': () => ({ body: { providers: list } }) });

describe('SocialButtons', () => {
  it('shows only the providers the server has keys for, with the sign-up divider', async () => {
    providers(['google', 'facebook']);
    renderRoutes(page());
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
    expect(screen.getByRole('separator')).toHaveTextContent('or sign up with email');
  });

  it('shows all three, in the order Google, Apple, Facebook', async () => {
    providers(['facebook', 'apple', 'google']);
    renderRoutes(page());
    await screen.findByRole('button', { name: 'Continue with Google' });
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['Continue with Google', 'Continue with Apple', 'Continue with Facebook']);
  });

  it('draws nothing at all (no divider either) when no provider is enabled', async () => {
    const { calls } = providers([]);
    const { container } = renderRoutes(page());
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/providers')).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
  });

  it('draws nothing when the server cannot say which providers exist', async () => {
    mockApi({});
    const { container } = renderRoutes(page());
    await new Promise((r) => setTimeout(r, 60));
    expect(container).toBeEmptyDOMElement();
  });

  it('says "sign in" on the sign-in page', async () => {
    providers(['google']);
    renderRoutes([{ path: '/', element: <SocialButtons mode="sign-in" /> }]);
    expect(await screen.findByRole('separator')).toHaveTextContent('or sign in with email');
  });

  it('sends the browser to the API, with a spinner and every button locked while it goes', async () => {
    providers(['google', 'apple']);
    renderRoutes(page({ referralCode: 'ADA1234', returnTo: '/checkout' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(redirectTo).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/oauth\/google\/start\?mode=sign-up&return=%2Fcheckout&ref=ADA1234$/),
    );
    const google = screen.getByRole('button', { name: /Continue with Google/ });
    expect(google).toHaveAttribute('aria-busy', 'true');
    expect(within(google).getByRole('status')).toHaveTextContent('Opening Google');
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeDisabled();
  });
});
