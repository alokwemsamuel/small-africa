import { api, ApiError, type RequestOptions } from '@/lib/api';
import type { Dashboard } from '@/features/admin/api';
import type { Order, PlacedOrder, Quote } from '@/features/checkout/api';
import type { MenuData } from '@/features/menu/types';
import type { LoyaltySummary, Topup } from '@/features/rewards/api';
import type { Availability, Reservation } from '@/features/reservations/api';
import { monthShift, shiftText } from './build';
import { installDemo, resetDemo } from './index';
import { freezeClock } from './time';

// A Friday evening in Lagos: the restaurant is open and the kitchen is busy.
const NOW = '2026-10-30 19:15:00';

const call = <T>(path: string, options: RequestOptions = {}) => api<T>(path, options);
const post = <T>(path: string, body: unknown = {}, extra: Partial<RequestOptions> = {}) =>
  call<T>(path, { method: 'POST', body, ...extra });

async function signIn(email: string, password: string) {
  await post('/auth/logout');
  return post<{ user: { id: number } }>('/auth/login', { email, password });
}
const ADMIN = ['admin@smallafrica.demo', 'SmallAfrica@Admin2026'] as const;
const GUEST = ['guest@smallafrica.demo', 'SmallAfrica@Guest2026'] as const;

async function errorOf(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected an API error');
}

async function dishId(slug: string) {
  const menu = await call<MenuData>('/menu');
  return menu.dishes.find((d) => d.slug === slug)!.id;
}

beforeAll(async () => {
  freezeClock(NOW);
  window.localStorage.clear();
  await installDemo({ latency: false });
});

afterAll(() => freezeClock(null));

describe('demo data', () => {
  it('fills the dashboard with 30 busy days, more on Fridays and weekends', async () => {
    await signIn(...ADMIN);
    const d = await call<Dashboard>('/admin/dashboard?days=30');
    expect(d.series).toHaveLength(30);
    // Every finished day has orders (today is still going).
    expect(d.series.slice(0, -1).every((s) => s.orders >= 5)).toBe(true);
    const avg = (days: number[]) => {
      const list = d.series
        .slice(0, -1)
        .filter((s) => days.includes(new Date(`${s.date}T12:00:00Z`).getUTCDay()));
      return list.reduce((sum, s) => sum + s.orders, 0) / list.length;
    };
    expect(avg([5])).toBeGreaterThan(avg([1, 2, 3, 4]));
    expect(avg([6, 0])).toBeGreaterThan(avg([1, 2, 3, 4]));
    expect(d.byKitchen.map((k) => k.kitchen)).toEqual(
      expect.arrayContaining(['Nigerian Kitchen', 'Polish Kitchen', 'Continental Kitchen']),
    );
    expect(d.topDishes.slice(0, 2).map((t) => t.name)).toEqual(['Smoky Party Jollof', 'Pierogi Ruskie']);
    expect(d.live.length).toBeGreaterThan(0);
    expect(d.today.orders).toBeGreaterThan(0);
  });

  it('has the seeded customers, reviews, coupons and enquiries', async () => {
    const customers = await call<{ total: number }>('/admin/customers');
    expect(customers.total).toBe(30);
    const reviews = await call<{ total: number }>('/admin/reviews');
    expect(reviews.total).toBeGreaterThanOrEqual(40);
    const coupons = await call<{ coupons: { live: boolean }[] }>('/admin/coupons');
    expect(coupons.coupons.filter((c) => c.live).length).toBeGreaterThanOrEqual(3);
    const enquiries = await call<{ total: number }>('/admin/enquiries');
    expect(enquiries.total).toBe(5);
    const res = await call<{ reservations: unknown[] }>('/admin/reservations?from=2026-10-14&to=2026-11-15');
    expect(res.reservations.length).toBeGreaterThanOrEqual(25);
  });
});

describe('guest checkout', () => {
  it('declines, retries with a new payment reference, then pays and tracks', async () => {
    await post('/auth/logout');
    const jollof = await dishId('smoky-party-jollof');
    const req = {
      fulfilment: 'pickup',
      email: 'ada@example.com',
      name: 'Ada Obi',
      phone: '0803 123 4567',
      items: [{ dish_id: jollof, quantity: 2, portion_id: null, addon_ids: [], note: null }],
    };
    const { quote } = await post<{ quote: Quote }>('/checkout/quote', req);
    expect(quote.totalKobo).toBe(quote.subtotalKobo + quote.packagingFeeKobo + quote.serviceChargeKobo);

    const key = 'demo-test-checkout-0001';
    const first = await post<PlacedOrder>('/orders', req, { idempotencyKey: key });
    expect(first.payment?.provider).toBe('simulated');
    const ref = first.order.reference;
    const declined = await post<{ order: Order }>('/payments/simulate', {
      reference: ref,
      outcome: 'failed',
    });
    expect(declined.order.paymentStatus).toBe('failed');

    const again = await post<PlacedOrder>('/orders', req, { idempotencyKey: key });
    expect(again.order.reference).toBe(ref);
    expect(again.payment?.reference).toBe(`${ref}-2`);
    const paid = await post<{ order: Order }>('/payments/simulate', { reference: ref, outcome: 'success' });
    expect(paid.order).toMatchObject({ paymentStatus: 'paid', status: 'received' });

    const tracked = await call<{ order: Order }>(`/orders/${ref}?t=${first.trackingToken}`);
    expect(tracked.order.items?.[0]).toMatchObject({ quantity: 2, slug: 'smoky-party-jollof' });
    expect((await errorOf(call(`/orders/${ref}?t=wrong`))).status).toBe(404);
  });

  it('applies coupons with the API’s rules and messages', async () => {
    const pierogi = await dishId('pierogi-ruskie');
    const err = await errorOf(
      post('/checkout/quote', {
        fulfilment: 'pickup',
        coupon_code: 'NOPE',
        items: [{ dish_id: pierogi, quantity: 1, addon_ids: [] }],
      }),
    );
    expect(err.status).toBe(422);
    expect(err.fields.coupon_code).toBe('That code isn’t valid.');
  });
});

describe('Interest Account member', () => {
  it('tops up, pays with dining credit and earns points when the order is completed', async () => {
    await signIn(...GUEST);
    const before = await call<LoyaltySummary>('/account/loyalty');

    const start = await post<{ topup: Topup; payment: { reference: string } }>(
      '/account/wallet/topups',
      { amount_naira: 50000 },
      { idempotencyKey: 'demo-test-topup-000001' },
    );
    const topup = await post<{ topup: Topup }>('/payments/simulate', {
      reference: start.topup.reference,
      outcome: 'success',
    });
    expect(topup.topup.status).toBe('paid');
    const after = await call<LoyaltySummary>('/account/loyalty');
    expect(after.wallet.balanceKobo).toBe(before.wallet.balanceKobo + 5_000_000 + start.topup.bonusKobo);

    const suya = await dishId('beef-suya-platter');
    const placed = await post<PlacedOrder>(
      '/orders',
      {
        fulfilment: 'pickup',
        use_wallet: true,
        email: 'guest@smallafrica.demo',
        name: 'Chiamaka Bello',
        phone: '+2348030000003',
        items: [{ dish_id: suya, quantity: 1, addon_ids: [] }],
      },
      { idempotencyKey: 'demo-test-wallet-order-01' },
    );
    // Fully paid with dining credit: no card payment needed.
    expect(placed.payment).toBeNull();
    expect(placed.order.paymentStatus).toBe('paid');

    await signIn(...ADMIN);
    for (const status of ['preparing', 'ready', 'completed']) {
      await post(`/admin/orders/${placed.order.reference}/status`, { status });
    }
    await signIn(...GUEST);
    const orders = await call<{ orders: Order[] }>('/account/orders');
    const done = orders.orders.find((o) => o.reference === placed.order.reference)!;
    expect(done.status).toBe('completed');
    expect(done.pointsEarned).toBeGreaterThan(0);
  });

  it('pays interest once when the admin simulates month-end', async () => {
    await signIn(...ADMIN);
    const me = await call<{ demoTools: boolean }>('/admin/me');
    expect(me.demoTools).toBe(true);
    const run = await post<{ result: { period: string; accountsCredited: number } }>(
      '/admin/loyalty/interest-runs/simulate',
    );
    expect(run.result.period).toBe('2026-10');
    expect(run.result.accountsCredited).toBeGreaterThan(0);
    expect((await errorOf(post('/admin/loyalty/interest-runs/simulate'))).status).toBe(409);
  });
});

describe('reservations', () => {
  it('books against capacity and cancels with the manage link', async () => {
    await post('/auth/logout');
    const avail = await call<Availability>('/reservations/availability?date=2026-10-31&party=2');
    const area = avail.areas.find((a) => a.fitsParty && a.slots.some((s) => s.available))!;
    const slot = area.slots.find((s) => s.available)!;
    const booked = await post<{ reservation: Reservation; manageToken: string }>('/reservations', {
      date: '2026-10-31',
      time: slot.time,
      party_size: 2,
      area: area.slug,
      occasion: 'birthday',
      notes: null,
      name: 'Kasia Nowak',
      email: 'kasia@example.com',
      phone: '+48 600 100 200',
    });
    expect(booked.reservation.status).toBe('confirmed');
    const cancelled = await post<{ reservation: Reservation }>(
      `/reservations/${booked.reservation.code}/cancel`,
      { t: booked.manageToken },
    );
    expect(cancelled.reservation.status).toBe('cancelled');
  });

  it('validates like the API', async () => {
    const err = await errorOf(post('/reservations', { date: '2026-10-31', email: 'not-an-email' }));
    expect(err.status).toBe(422);
    expect(err.fields.email).toBe('Enter a valid email address.');
    expect(err.fields.time).toBe('Time is required.');
  });
});

describe('access control', () => {
  it('applies the same roles and permissions as the API', async () => {
    await post('/auth/logout');
    expect((await errorOf(call('/account/orders'))).status).toBe(401);
    await signIn(...GUEST);
    expect((await errorOf(call('/admin/me'))).status).toBe(403);
    await signIn('kitchen@smallafrica.demo', 'SmallAfrica@Kitchen2026');
    expect((await call<{ permissions: string[] }>('/admin/me')).permissions).toContain('menu.availability');
    expect((await errorOf(call('/admin/customers'))).status).toBe(403);
    expect((await errorOf(signIn('admin@smallafrica.demo', 'wrong-password'))).status).toBe(401);
  });

  it('reset signs out and starts from fresh data', async () => {
    await signIn(...ADMIN);
    await resetDemo();
    expect((await call<{ user: unknown }>('/auth/me')).user).toBeNull();
  });
});

describe('snapshot dates', () => {
  it('moves forward by whole months, never past today', () => {
    expect(monthShift('2026-10-26 09:00:00', new Date(Date.UTC(2026, 9, 30)))).toBe(0);
    expect(monthShift('2026-10-26 09:00:00', new Date(Date.UTC(2026, 11, 20)))).toBe(1);
    expect(monthShift('2026-10-26 09:00:00', new Date(Date.UTC(2026, 11, 27)))).toBe(2);
    expect(shiftText('Interest for September 2026 (dining credit)', 4)).toBe(
      'Interest for January 2027 (dining credit)',
    );
    expect(shiftText('Monthly streak bonus: 3 visits in October', 1)).toBe(
      'Monthly streak bonus: 3 visits in November',
    );
  });
});
