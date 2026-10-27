import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { mockColorScheme } from '@/test/matchMedia';
import { mockApi } from '@/test/utils';
import { MobileMenu } from './MobileMenu';

const site = {
  restaurant: {
    address: 'Victoria Island, Lagos, Nigeria',
    phone: '+234 700 000 0000',
    whatsapp: '+2347000000000',
    instagram: 'https://instagram.com/smallafrica',
    tiktok: 'https://tiktok.com/@smallafrica',
  },
  openingHours: [
    { dayOfWeek: 1, opensAt: '12:00', closesAt: '23:00', isClosed: false },
    { dayOfWeek: 5, opensAt: '12:00', closesAt: '23:59', isClosed: false },
    { dayOfWeek: 0, opensAt: '13:00', closesAt: '22:00', isClosed: false },
  ],
};
const person = (role, firstName = 'Chiamaka') => ({
  id: 3,
  firstName,
  lastName: 'Bello',
  email: 'guest@smallafrica.demo',
  role,
  staffPosition: role === 'customer' ? null : 'front_desk',
  themePreference: null,
});

/** The header's part: a hamburger that opens the menu, and the current path. */
function Harness() {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const { pathname } = useLocation();
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen(true)}
      >
        Open menu
      </button>
      <p data-testid="path">{pathname}</p>
      <MobileMenu open={open} onClose={() => setOpen(false)} returnFocusRef={button} />
    </>
  );
}

function setup({ user = null, path = '/menu' } = {}) {
  mockColorScheme(false);
  mockApi({
    'GET /auth/me': () => ({ body: { user } }),
    'GET /site': () => ({ body: site }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Harness />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return view;
}

const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  return screen.findByRole('dialog', { name: 'Site menu' });
};
const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 });

describe('MobileMenu', () => {
  afterEach(() => {
    // Leave no history entry or pinned page behind for the next test.
    document.body.removeAttribute('style');
  });

  it('opens as a modal dialog outside the header, with the numbered links', async () => {
    const { container } = setup({ path: '/menu' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const dialog = await openMenu();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('id', 'mobile-nav');
    // Drawn into <body>, not inside the app (and so not inside the blurred header).
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    const links = within(dialog.querySelector('nav')).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Home01',
      'Menu02',
      'Reservations03',
      'Events & catering04',
      'Rewards05',
      'About & gallery06',
      'Contact07',
    ]);
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the current page, and keeps About & gallery together', async () => {
    setup({ path: '/gallery' });
    const dialog = await openMenu();
    expect(within(dialog).getByRole('link', { name: /About & gallery/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(dialog).getByRole('link', { name: /^Menu/ })).not.toHaveAttribute('aria-current');
  });

  it('shows Sign in for a guest, and the first name (plus Admin for staff) once signed in', async () => {
    const guest = setup();
    const guestDialog = await openMenu();
    expect(within(guestDialog).getByRole('link', { name: /Sign in \/ Join/ })).toBeInTheDocument();
    guest.unmount();

    setup({ user: person('customer', 'Ada') });
    const member = await openMenu();
    expect(await within(member).findByRole('link', { name: /Ada/ })).toHaveAttribute('href', '/account');
    expect(within(member).queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('gives staff an Admin link', async () => {
    setup({ user: person('manager') });
    const dialog = await openMenu();
    expect(await within(dialog).findByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('has the actions, the theme switch and the restaurant details', async () => {
    setup();
    const dialog = await openMenu();
    expect(within(dialog).getByRole('link', { name: 'Reserve a table' })).toHaveAttribute(
      'href',
      '/reservations',
    );
    expect(within(dialog).getByRole('link', { name: 'Order online' })).toHaveAttribute('href', '/menu');
    expect(within(dialog).getByRole('radio', { name: /Auto/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Dark/ })).toBeChecked();
    expect(await within(dialog).findByText('Victoria Island, Lagos, Nigeria')).toBeInTheDocument();
    expect(await within(dialog).findByText('12:00 – late')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/2347000000000'),
    );
    expect(within(dialog).getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+2347000000000');
    expect(within(dialog).getByRole('link', { name: /Instagram/ })).toHaveAttribute(
      'href',
      site.restaurant.instagram,
    );
    expect(within(dialog).getByRole('link', { name: /TikTok/ })).toHaveAttribute(
      'href',
      site.restaurant.tiktok,
    );
  });

  it('moves focus into the menu, locks the page, and puts both back on close (✕)', async () => {
    setup();
    const hamburger = screen.getByRole('button', { name: 'Open menu' });
    const dialog = await openMenu();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close menu' })).toHaveFocus());
    expect(document.body.style.position).toBe('fixed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close menu' }));
    await closed();
    expect(document.body.style.position).toBe('');
    expect(hamburger).toHaveFocus();
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps Tab inside the menu', async () => {
    setup();
    const dialog = await openMenu();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close menu' })).toHaveFocus());
    // Shift+Tab from the first control wraps to the last one, inside the menu.
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(within(dialog).getByRole('button', { name: 'Close menu' }));
    await userEvent.tab();
    expect(within(dialog).getByRole('button', { name: 'Close menu' })).toHaveFocus();
  });

  it('closes with Escape', async () => {
    setup();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    await closed();
  });

  it('closes with the phone back button, and leaves the page where it was', async () => {
    setup({ path: '/menu' });
    await openMenu();
    expect(window.history.state?.saMenu).toBe(true);
    window.history.back();
    await closed();
    expect(screen.getByTestId('path')).toHaveTextContent('/menu');
    expect(window.history.state?.saMenu).toBeFalsy();
  });

  it('closes by tapping the dark backdrop', async () => {
    setup();
    await openMenu();
    const backdrop = document.body.querySelector('button[tabindex="-1"][aria-hidden="true"]');
    await userEvent.click(backdrop);
    await closed();
  });

  it('closes and goes to the page when a link is tapped', async () => {
    setup({ path: '/menu' });
    const dialog = await openMenu();
    await userEvent.click(within(dialog).getByRole('link', { name: /Reservations/ }));
    await closed();
    expect(screen.getByTestId('path')).toHaveTextContent('/reservations');
    expect(window.history.state?.saMenu).toBeFalsy();
  });
});
