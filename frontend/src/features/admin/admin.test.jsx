import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { mockApi, renderRoutes } from '@/test/utils';
import { AdminApp } from './AdminApp';
import type { AdminMe, Dashboard } from './api';
import { niceTicks } from './scale';

const user = (role: string, staffPosition: string | null = null) => ({
  id: 9,
  firstName: 'Tomasz',
  lastName: 'Kowalski',
  email: 'manager@smallafrica.demo',
  phone: null,
  role,
  staffPosition,
  emailVerified: true,
  birthday: null,
  favouriteKitchenId: null,
  referralCode: null,
  marketingOptIn: false,
  themePreference: null,
  twoFactorEnabled: false,
  createdAt: '2026-01-01 00:00:00',
});

const kpi = { revenueKobo: 5550000, orders: 3, reservations: 4, covers: 11, averageOrderKobo: 1850000 };
const dashboard: Dashboard = {
  today: kpi,
  yesterday: { ...kpi, revenueKobo: 3700000, orders: 2, averageOrderKobo: 1850000 },
  period: { ...kpi, days: 7 },
  series: ['2026-10-19', '2026-10-20'].map((date, i) => ({
    date,
    revenueKobo: (i + 1) * 1850000,
    orders: i + 1,
    reservations: 2,
  })),
  topDishes: [{ name: 'Smoky Party Jollof', quantity: 7, revenueKobo: 12950000 }],
  byKitchen: [{ kitchen: 'Nigerian Kitchen', revenueKobo: 12950000 }],
  live: [
    {
      reference: 'SA-LIVE01',
      status: 'preparing',
      fulfilment: 'pickup',
      customerName: 'Ada Obi',
      totalKobo: 1900000,
      items: 1,
      placedAt: '2026-10-20 11:40:00',
      scheduledFor: null,
    },
  ],
  pending: { reviews: 2, enquiries: 1, messages: 0 },
  loyalty: { members: 17, walletKobo: 41234400, points: 42858 },
  generatedAt: '2026-10-20T12:00:00+01:00',
};

function setup(
  me: AdminMe,
  role: string,
  position: string | null,
  extra: Parameters<typeof mockApi>[0] = {},
  path = '/admin',
) {
  const api = mockApi({
    'GET /auth/me': () => ({ body: { user: user(role, position) } }),
    'GET /admin/me': () => ({ body: me }),
    'GET /admin/dashboard?days=7': () => ({ body: dashboard }),
    ...extra,
  });
  renderRoutes(
    [
      {
        path: '/admin/*',
        element: (
          <ThemeProvider>
            <AdminApp />
          </ThemeProvider>
        ),
      },
    ],
    path,
  );
  return api;
}

const managerMe: AdminMe = {
  permissions: [
    'dashboard.view',
    'orders.view',
    'orders.status',
    'orders.refund',
    'reservations.manage',
    'reservations.capacity',
    'menu.manage',
    'menu.availability',
    'customers.view',
    'customers.visits',
    'loyalty.manage',
    'reviews.moderate',
    'coupons.manage',
    'enquiries.manage',
    'settings.manage',
    'audit.view',
  ],
  role: 'manager',
  staffPosition: null,
  twoFactorEnabled: false,
  demoTools: false,
};
const kitchenMe: AdminMe = {
  permissions: ['dashboard.view', 'orders.view', 'orders.status', 'menu.availability'],
  role: 'staff',
  staffPosition: 'kitchen',
  twoFactorEnabled: false,
  demoTools: false,
};

describe('Admin panel', () => {
  it('shows only the sections a role may use', async () => {
    setup(kitchenMe, 'staff', 'kitchen');
    await screen.findByRole('link', { name: 'Orders' });
    const nav = screen.getAllByRole('navigation', { name: 'Admin' });
    const links = within(nav[0]!)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(links).toEqual(['Dashboard', 'Orders', 'Menu']);
    expect(screen.queryByText('Reviews to moderate')).not.toBeInTheDocument();
  });

  it('managers see every manager section and a 2FA prompt', async () => {
    setup(managerMe, 'manager', null);
    await screen.findByRole('link', { name: 'Orders' });
    const nav = screen.getAllByRole('navigation', { name: 'Admin' });
    const links = within(nav[0]!)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(links).toContain('Interest Account');
    expect(links).not.toContain('Staff & roles');
    expect(screen.getByRole('link', { name: 'Turn on two-factor sign-in' })).toBeInTheDocument();
  });

  it('dashboard shows figures, deltas, the live feed and a table view of each chart', async () => {
    setup(managerMe, 'manager', null);
    expect(await screen.findByText('₦55,500')).toBeInTheDocument();
    expect(screen.getAllByText('+50% vs yesterday')).toHaveLength(2); // revenue and orders
    expect(screen.getByText('11 guests expected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SA-LIVE01' })).toHaveAttribute(
      'href',
      '/admin/orders/SA-LIVE01',
    );
    const chart = screen.getByRole('img', { name: /Revenue per day/ });
    expect(chart.getAttribute('aria-label')).toMatch(/Highest: Tuesday,? 20 October, ₦37,000/);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Show table' })[0]!);
    expect(screen.getByRole('cell', { name: '₦18,500' })).toBeInTheDocument();
    expect(screen.getByText('Reviews to moderate').nextSibling).toHaveTextContent('2');
  });

  it('a page the role can’t use explains why instead of loading', async () => {
    setup(kitchenMe, 'staff', 'kitchen', {}, '/admin/customers');
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
  });

  it('kitchen staff move an order forward from the order view', async () => {
    const order = {
      reference: 'SA-LIVE01',
      status: 'received',
      paymentStatus: 'paid',
      fulfilment: 'pickup',
      zone: null,
      scheduledFor: null,
      placedAt: '2026-10-20 11:40:00',
      createdAt: '2026-10-20 11:39:00',
      customerName: 'Ada Obi',
      subtotalKobo: 1850000,
      discountKobo: 0,
      voucherDiscountKobo: 0,
      deliveryFeeKobo: 50000,
      serviceChargeKobo: 0,
      vatIncludedKobo: 129069,
      walletAppliedKobo: 0,
      totalKobo: 1900000,
      pointsEarned: 0,
      items: [
        {
          dishId: 1,
          slug: 'smoky-party-jollof',
          name: 'Smoky Party Jollof',
          quantity: 1,
          unitPriceKobo: 1850000,
          lineTotalKobo: 1850000,
          portion: null,
          addons: [],
          containsPork: false,
          note: 'Extra pepper',
        },
      ],
      history: [{ status: 'received', at: '2026-10-20 11:40:00', note: null, by: null }],
      payments: [],
      customer: {
        name: 'Ada Obi',
        email: 'ada@example.com',
        phone: '+2348031234567',
        userId: null,
        tier: null,
      },
      address: null,
      notes: null,
      refundFlag: false,
      cancelledReason: null,
      coupon: null,
      nextStatuses: ['preparing'],
    };
    const { calls } = setup(
      kitchenMe,
      'staff',
      'kitchen',
      {
        'GET /admin/orders?status=received%2Cpreparing%2Cready%2Cout_for_delivery&page=1': () => ({
          body: { items: [], page: 1, pages: 1, total: 0 },
        }),
        'GET /admin/orders/SA-LIVE01': () => ({ body: { order } }),
        'POST /admin/orders/SA-LIVE01/status': () => ({
          body: { order: { ...order, status: 'preparing', nextStatuses: ['ready'] } },
        }),
      },
      '/admin/orders/SA-LIVE01',
    );
    const dialog = await screen.findByRole('dialog', { name: 'Order SA-LIVE01' });
    expect(await within(dialog).findByText('Note: Extra pepper')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Flag for refund' })).not.toBeInTheDocument();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Start preparing' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/admin/orders/SA-LIVE01/status')?.body).toEqual({
        status: 'preparing',
        note: null,
      }),
    );
    expect(await within(dialog).findByRole('button', { name: 'Mark ready' })).toBeInTheDocument();
  });
});

it('chooses clean axis ticks, whole numbers for counts', () => {
  expect(niceTicks(28500)).toEqual([0, 10000, 20000, 30000]);
  expect(niceTicks(1, 4, true)).toEqual([0, 1]);
  expect(niceTicks(7, 4, true)).toEqual([0, 2, 4, 6, 8]);
  expect(niceTicks(0)).toEqual([0, 1]);
});
