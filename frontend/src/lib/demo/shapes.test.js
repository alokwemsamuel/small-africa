import { api } from '@/lib/api';
import { RESPONSES } from '@/lib/apiSchemas';
import { installDemo } from './index';
import { freezeClock } from './time';

// The demo-mode API must answer exactly like the PHP API: every response the app relies on is
// checked against the schemas written from the PHP controllers (src/lib/apiSchemas.js).

const NOW = '2026-10-30 19:15:00'; // a Friday evening, restaurant open

/** Calls the demo API and validates the answer against the schema for that route. */
async function checked(path, options = {}) {
  const data = await api(path, options);
  const method = options.method ?? 'GET';
  const entry = RESPONSES.find(([m, re]) => m === method && re.test(path.split('?')[0]));
  expect(entry, `no schema for ${method} ${path}`).toBeTruthy();
  const result = entry[2].safeParse(data);
  expect(result.success, `${method} ${path}: ${JSON.stringify(result.error?.issues.slice(0, 3))}`).toBe(true);
  return data;
}

const post = (path, body, extra = {}) => checked(path, { method: 'POST', body, ...extra });

beforeAll(async () => {
  freezeClock(NOW);
  window.localStorage.clear();
  await installDemo({ latency: false });
});
afterAll(() => freezeClock(null));

it('public pages: menu, dish, site, availability', async () => {
  const menu = await checked('/menu');
  await checked('/menu/smoky-party-jollof');
  await checked('/site');
  await checked('/reservations/availability?date=2026-10-31&party=2');
  await checked('/auth/me');
  expect(menu.dishes.length).toBeGreaterThan(40);
});

it('checkout: quote, order, simulated payment, tracking', async () => {
  const { dishes } = await api('/menu');
  const jollof = dishes.find((d) => d.slug === 'smoky-party-jollof');
  const req = {
    fulfilment: 'pickup',
    email: 'shape@example.com',
    name: 'Shape Test',
    phone: '0803 123 4567',
    items: [{ dish_id: jollof.id, quantity: 1, portion_id: null, addon_ids: [] }],
  };
  await post('/checkout/quote', req);
  const placed = await post('/orders', req, { idempotencyKey: 'shape-test-order-0001' });
  await post('/payments/simulate', { reference: placed.order.reference, outcome: 'success' });
  await checked(`/orders/${placed.order.reference}?t=${placed.trackingToken}`);
});

it('member: sign-in, Interest Account, top-up, orders', async () => {
  await post('/auth/login', { email: 'guest@smallafrica.demo', password: 'SmallAfrica@Guest2026' });
  await checked('/account/loyalty');
  await checked('/account/orders');
  const start = await post(
    '/account/wallet/topups',
    { amount_naira: 10000 },
    { idempotencyKey: 'shape-test-topup-0001' },
  );
  await post('/payments/simulate', { reference: start.topup.reference, outcome: 'success' });
});

it('admin: dashboard', async () => {
  await post('/auth/login', { email: 'admin@smallafrica.demo', password: 'SmallAfrica@Admin2026' });
  await checked('/admin/dashboard?days=7');
  await checked('/admin/dashboard?days=30');
});
