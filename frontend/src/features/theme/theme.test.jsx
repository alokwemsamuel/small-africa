import script from '../../../public/theme-init.js?raw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockColorScheme } from '@/test/matchMedia';
import { mockApi } from '@/test/utils';
import { ThemeProvider } from './ThemeProvider';
import { ThemeMenu, ThemeSegmented } from './ThemeSwitcher';
import { THEME_STORAGE_KEY } from './theme';

const root = document.documentElement;
const user = (themePreference) => ({
  id: 3,
  firstName: 'Chiamaka',
  lastName: 'Bello',
  email: 'guest@smallafrica.demo',
  role: 'customer',
  themePreference,
});

function renderSwitcher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ThemeMenu />
        <ThemeSegmented />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute('data-theme');
  document.head.innerHTML = '<meta name="theme-color" content="#0E0C0A" />';
});

describe('appearance preference', () => {
  it('defaults to Dark', async () => {
    mockColorScheme(true);
    mockApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderSwitcher();
    await waitFor(() => expect(root.dataset.theme).toBe('dark'));
    expect(screen.getByRole('radio', { name: /Dark/ })).toBeChecked();
  });

  it('persists the choice in localStorage and updates the browser bar colour', async () => {
    mockColorScheme(false);
    mockApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderSwitcher();
    await userEvent.click(screen.getByRole('radio', { name: /Light/ }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(root.dataset.theme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#F6EFE3');
  });

  it('restores a saved preference on the next visit', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    mockColorScheme(false);
    mockApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderSwitcher();
    expect(screen.getByRole('radio', { name: /Light/ })).toBeChecked();
    await waitFor(() => expect(root.dataset.theme).toBe('light'));
  });

  it('System follows the device and updates live when it changes', async () => {
    const scheme = mockColorScheme(false);
    mockApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderSwitcher();
    await userEvent.click(screen.getByRole('radio', { name: /System/ }));
    expect(root.dataset.theme).toBe('dark');
    act(() => scheme.setLight(true));
    expect(root.dataset.theme).toBe('light');
    act(() => scheme.setLight(false));
    expect(root.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('ignores OS changes while an explicit theme is chosen', async () => {
    const scheme = mockColorScheme(false);
    mockApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderSwitcher();
    await userEvent.click(screen.getByRole('radio', { name: /Dark/ }));
    act(() => scheme.setLight(true));
    expect(root.dataset.theme).toBe('dark');
  });

  it('saves the choice to the profile for signed-in users', async () => {
    mockColorScheme(false);
    const { calls } = mockApi({
      'GET /auth/me': () => ({ body: { user: user(null) } }),
      'PATCH /account/profile': () => ({ body: { user: user('light') } }),
    });
    renderSwitcher();
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/me')).toBe(true));
    await userEvent.click(screen.getByRole('radio', { name: /Light/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ theme_preference: 'light' }),
    );
  });

  it('adopts the preference saved on the profile (follows the user across devices)', async () => {
    mockColorScheme(false);
    const { calls } = mockApi({ 'GET /auth/me': () => ({ body: { user: user('light') } }) });
    renderSwitcher();
    await waitFor(() => expect(root.dataset.theme).toBe('light'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('header menu is keyboard operable and announces the choice', async () => {
    mockColorScheme(false);
    mockApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderSwitcher();
    const button = screen.getByRole('button', { name: /Appearance: Dark/ });
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu', { name: 'Appearance' });
    expect(within(menu).getByRole('menuitemradio', { name: /Dark/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(root.dataset.theme).toBe('light');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Appearance: Light/ })).toHaveFocus();
  });
});

describe('public/theme-init.js (runs before React)', () => {
  const run = () => new Function(script)();

  it.each([
    [null, false, 'dark'],
    ['light', false, 'light'],
    ['system', true, 'light'],
    ['system', false, 'dark'],
    ['garbage', true, 'dark'],
  ])('stored=%s prefersLight=%s → %s', (stored, prefersLight, expected) => {
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
    mockColorScheme(prefersLight);
    run();
    expect(root.dataset.theme).toBe(expected);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      expected === 'light' ? '#F6EFE3' : '#0E0C0A',
    );
  });

  it('survives blocked storage', () => {
    mockColorScheme(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    run();
    expect(root.dataset.theme).toBe('dark');
  });
});
