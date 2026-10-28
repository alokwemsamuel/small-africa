import { api } from '@/lib/api';
import { installDemo, resetDemo } from './index';
import { freezeClock } from './time';

const post = (path, body = {}, extra = {}) => api(path, { method: 'POST', body, ...extra });
const signIn = async (email, password) => {
  await post('/auth/logout');
  return post('/auth/login', { email, password });
};
const ADMIN = ['admin@smallafrica.demo', 'SmallAfrica@Admin2026'];

beforeAll(async () => {
  freezeClock('2026-10-30 19:15:00');
  window.localStorage.clear();
  await installDemo({ latency: false });
});
beforeEach(async () => {
  await resetDemo();
});
afterAll(() => freezeClock(null));

/** Signs a new customer up, then places, pays and completes one order for them. */
async function newCustomerCompletesAnOrder(email, phone, key) {
  await post('/auth/logout');
  const reg = await post('/auth/register', {
    first_name: 'Ada',
    last_name: 'Newcomer',
    email,
    phone,
    password: 'Lagos-Table-2026!x',
    accept_terms: true,
  });
  const menu = await api('/menu');
  const placed = await post(
    '/orders',
    {
      fulfilment: 'pickup',
      email,
      name: 'Ada Newcomer',
      phone,
      items: [{ dish_id: menu.dishes[0].id, quantity: 2, addon_ids: [] }],
    },
    { idempotencyKey: key },
  );
  await post('/payments/simulate', { reference: placed.order.reference, outcome: 'success' });
  const user = reg.user;
  await signIn(...ADMIN);
  for (const status of ['preparing', 'ready', 'completed']) {
    await post(`/admin/orders/${placed.order.reference}/status`, { status });
  }
  return user;
}

const statement = async () => (await api('/account/loyalty/history?kind=points')).entries ?? [];

describe('demo: welcome bonus', () => {
  it('shows the amount on the public site settings', async () => {
    expect((await api('/site')).loyalty.welcomeBonusPoints).toBe(200);
  });

  it('adds 200 points after the first completed order, and the admin can switch it off', async () => {
    const user = await newCustomerCompletesAnOrder(
      'first@example.com',
      '08031112222',
      'demo-welcome-order-01',
    );
    await signIn('first@example.com', 'Lagos-Table-2026!x');
    const entries = await statement();
    const bonus = entries.filter((e) => /Welcome bonus/.test(e.description));
    expect(user.firstName).toBe('Ada');
    expect(bonus).toHaveLength(1);
    expect(bonus[0].amount).toBe(200);

    // Off: the next new customer gets no bonus.
    await signIn(...ADMIN);
    const settings = (await api('/admin/loyalty/settings')).settings;
    await api('/admin/loyalty/settings', {
      method: 'PUT',
      body: { ...settings, welcome_bonus_points: 0 },
    });
    expect((await api('/site')).loyalty.welcomeBonusPoints).toBe(0);
    await newCustomerCompletesAnOrder('second@example.com', '08039998888', 'demo-welcome-order-02');
    await signIn('second@example.com', 'Lagos-Table-2026!x');
    expect((await statement()).filter((e) => /Welcome bonus/.test(e.description))).toHaveLength(0);
  });
});
