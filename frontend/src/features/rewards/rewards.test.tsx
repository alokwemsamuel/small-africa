import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell } from '@/components/layout/NotificationBell';
import type { User } from '@/features/auth/types';
import { mockApi, renderRoutes } from '@/test/utils';
import { bonusFor, type LoyaltySummary } from './api';
import { InterestAccountPanel } from './InterestAccountPanel';

const guest: User = {
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
  createdAt: '2025-08-01 00:00:00',
};

const bands = [
  { minKobo: 10000000, bonusBp: 1000 },
  { minKobo: 5000000, bonusBp: 500 },
];

const account: LoyaltySummary = {
  member: { name: 'Chiamaka Bello', since: '2025-08-01 00:00:00', birthdayWeek: false, hasBirthday: true },
  tier: {
    key: 'gold',
    name: 'Gold',
    multiplier: 1.5,
    perks: ['1.5× points', 'Free delivery', 'Complimentary welcome drink'],
    spend12mKobo: 66250000,
    next: { key: 'black_diamond', name: 'Black Diamond', remainingKobo: 83750000, progress: 0.1625 },
  },
  tiers: [],
  wallet: {
    balanceKobo: 6850000,
    interest: {
      rateBp: 200,
      capKobo: 500000,
      minBalanceKobo: 2000000,
      lowestThisMonthKobo: 6850000,
      projectedKobo: 137000,
      last: { amountKobo: 179800, period: '2026-09', at: '2026-10-01 00:10:00' },
    },
    topup: {
      presetsKobo: [1000000, 2500000, 5000000, 10000000],
      minKobo: 500000,
      maxKobo: 100000000,
      bonusBands: bands,
    },
  },
  points: {
    balance: 2340,
    valueKobo: 2340000,
    earnPer1000Naira: 5,
    doublePointsWeekdays: [2, 3],
    expiresAt: '2027-10-23',
    nextReward: { name: 'Chef’s Tasting upgrade', pointsCost: 4000, remaining: 1660 },
  },
  stampCard: {
    stamps: 7,
    size: 10,
    rewards: [
      { stamp: 5, reward: 'Free dessert' },
      { stamp: 10, reward: 'Free main course' },
    ],
    next: { stamp: 10, reward: 'Free main course', remaining: 3 },
    lifetime: 17,
  },
  streak: { month: '2026-10', count: 2, target: 3, bonusPoints: 200 },
  referral: {
    code: 'GUEST2026',
    link: 'http://localhost:5173/register?ref=GUEST2026',
    creditKobo: 200000,
    rewarded: 2,
    pending: 0,
  },
  rewards: [
    {
      slug: 'credit-1000',
      name: '₦1,000 dining credit',
      description: 'Convert 100 points.',
      pointsCost: 100,
      type: 'credit',
      creditKobo: 100000,
      dineInOnly: false,
      affordable: true,
    },
    {
      slug: 'tasting-upgrade',
      name: 'Chef’s Tasting upgrade',
      description: 'In the restaurant.',
      pointsCost: 4000,
      type: 'upgrade',
      creditKobo: null,
      dineInOnly: true,
      affordable: false,
    },
  ],
  vouchers: [
    {
      code: 'RW-ABC234',
      title: 'Free dessert',
      source: 'stamp_card',
      dineInOnly: false,
      expiresAt: '2027-01-03 20:40:00',
    },
  ],
  offers: [],
};

function setup(extra: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi({
    'GET /auth/me': () => ({ body: { user: guest } }),
    'GET /account/loyalty': () => ({ body: account }),
    'GET /account/loyalty/history?kind=wallet': () => ({
      body: {
        entries: [
          {
            id: 9,
            type: 'interest',
            direction: 'credit',
            amount: 179800,
            balanceAfter: 10037000,
            reference: '2026-09',
            description: 'Interest for September 2026 (dining credit)',
            at: '2026-10-01 00:10:00',
          },
        ],
        nextBefore: null,
      },
    }),
    ...extra,
  });
  renderRoutes([{ path: '/account', element: <InterestAccountPanel /> }], '/account');
  return api;
}

describe('InterestAccountPanel', () => {
  it('shows the membership card, tier progress and statement', async () => {
    setup();
    const card = await screen.findByRole('region', { name: 'Gold membership card for Chiamaka Bello' });
    expect(within(card).getByText('₦68,500')).toBeInTheDocument();
    expect(within(card).getByText('2,340')).toBeInTheDocument();
    expect(within(card).getByText('3 more visits to a free main course')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress to Black Diamond' })).toHaveAttribute(
      'aria-valuenow',
      '16',
    );
    expect(screen.getByText('₦837,500')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '7 of 10 stamps' })).toBeInTheDocument();
    expect(screen.getByText(/1 more visit this month for \+200 bonus points/)).toBeInTheDocument();
    expect(await screen.findByText('Interest for September 2026 (dining credit)')).toBeInTheDocument();
    expect(screen.getByText(/isn’t a bank account/)).toBeInTheDocument();
    expect(screen.getByText(/Boosts don’t stack/)).toBeInTheDocument();
  });

  it('only lets members redeem what they can afford, after confirming', async () => {
    const { calls } = setup({
      'POST /account/rewards/credit-1000/redeem': () => ({
        body: {
          result: { type: 'credit', creditKobo: 100000 },
          account: { ...account, points: { ...account.points, balance: 2240 } },
        },
      }),
    });
    const user = userEvent.setup();
    expect(
      await screen.findByRole('button', { name: 'Redeem Chef’s Tasting upgrade for 4000 points' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Redeem ₦1,000 dining credit for 100 points' }));
    expect(calls.some((c) => c.path.includes('/redeem'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/account/rewards/credit-1000/redeem')).toBeDefined(),
    );
    const call = calls.find((c) => c.path === '/account/rewards/credit-1000/redeem')!;
    expect(call.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('previews the top-up bonus and pays through the simulated gateway', async () => {
    const topup = {
      reference: 'TU-ABC234',
      amountKobo: 5000000,
      bonusKobo: 250000,
      status: 'pending',
      paidAt: null,
    };
    const { calls } = setup({
      'POST /account/wallet/topups': () => ({
        status: 201,
        body: {
          topup,
          payment: {
            provider: 'simulated',
            reference: 'TU-ABC234',
            accessCode: 'sim',
            authorizationUrl: null,
          },
        },
      }),
      'POST /payments/simulate': () => ({
        body: { topup: { ...topup, status: 'paid', paidAt: '2026-10-25 12:00:00' } },
      }),
    });
    const user = userEvent.setup();
    await screen.findByRole('radiogroup', { name: 'Top-up amount' });
    // ₦50,000 is preselected: ₦52,500 of credit.
    expect(screen.getByText('₦52,500')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Or another amount (₦)'), '1000');
    expect(screen.getByRole('button', { name: /^Top up/ })).toBeDisabled();
    await user.clear(screen.getByLabelText('Or another amount (₦)'));
    await user.click(screen.getByRole('radio', { name: /₦50,000/ }));
    await user.click(screen.getByRole('button', { name: 'Top up ₦50,000' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₦50,000' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/payments/simulate')).toBe(true));
    expect(calls.find((c) => c.path === '/account/wallet/topups')?.body).toEqual({ amount_naira: 50000 });
    expect(calls.find((c) => c.path === '/payments/simulate')?.body).toEqual({
      reference: 'TU-ABC234',
      outcome: 'success',
    });
  });
});

describe('NotificationBell', () => {
  it('shows unread notifications and marks them read', async () => {
    const items = [
      {
        id: 1,
        type: 'interest',
        title: 'You earned ₦1,798 interest',
        body: 'Come and enjoy it!',
        read: false,
        at: '2026-10-01 00:10:00',
      },
    ];
    const { calls } = mockApi({
      'GET /account/notifications': () => ({ body: { items, unread: 1 } }),
      'POST /account/notifications/read': () => ({
        body: { items: items.map((n) => ({ ...n, read: true })), unread: 0 },
      }),
    });
    renderRoutes([{ path: '/', element: <NotificationBell /> }]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    expect(screen.getByText('You earned ₦1,798 interest')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/account/notifications/read')?.body).toEqual({});
  });
});

it('mirrors the server’s top-up bonus bands', () => {
  expect(bonusFor(4999900, bands)).toBe(0);
  expect(bonusFor(5000000, bands)).toBe(250000);
  expect(bonusFor(10000000, bands)).toBe(1000000);
});
