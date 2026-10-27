import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cart } from '@/features/cart/cart';
import { mockApi, renderRoutes } from '@/test/utils';
import { CheckoutPage } from './CheckoutPage';

const site = {
  restaurant: {},
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dayOfWeek: d,
    opensAt: '12:00',
    closesAt: '22:00',
    isClosed: false,
  })),
  deliveryZones: [
    {
      slug: 'victoria-island',
      name: 'Victoria Island',
      feeKobo: 200000,
      minOrderKobo: 1500000,
      etaMinutes: 35,
    },
  ],
};

const quote = {
  lines: [
    {
      dishId: 1,
      slug: 'smoky-party-jollof',
      name: 'Smoky Party Jollof',
      kitchen: 'nigerian',
      unitPriceKobo: 1800000,
      quantity: 2,
      lineTotalKobo: 3600000,
      portion: null,
      addons: [],
      note: null,
      containsPork: false,
      isAlcoholic: false,
    },
  ],
  subtotalKobo: 3600000,
  discountKobo: 0,
  coupon: null,
  voucher: null,
  voucherDiscountKobo: 0,
  deliveryFeeKobo: 0,
  freeDeliveryPerk: false,
  packagingFeeKobo: 50000,
  serviceChargeKobo: 0,
  vatIncludedKobo: 251163,
  totalKobo: 3650000,
  walletBalanceKobo: 0,
  walletAppliedKobo: 0,
  payableKobo: 3650000,
  fulfilment: 'pickup',
  zone: null,
  scheduledFor: null,
  estimatedReadyAt: '2026-10-20 12:30',
};

const order = (paymentStatus) => ({
  reference: 'SA-ABC123',
  status: paymentStatus === 'paid' ? 'received' : 'pending_payment',
  paymentStatus,
  fulfilment: 'pickup',
  zone: null,
  scheduledFor: null,
  placedAt: null,
  createdAt: '2026-10-20 12:00:00',
  customerName: 'Ada Obi',
  subtotalKobo: 3600000,
  discountKobo: 0,
  voucherDiscountKobo: 0,
  deliveryFeeKobo: 0,
  serviceChargeKobo: 0,
  vatIncludedKobo: 251163,
  walletAppliedKobo: 0,
  totalKobo: 3650000,
  pointsEarned: 0,
});

const placed = {
  order: order('unpaid'),
  payment: { provider: 'simulated', reference: 'SIM-1', accessCode: 'sim', authorizationUrl: null },
  trackingToken: 'tok/en+1',
  publicKey: null,
};

function setup(outcome = 'paid') {
  cart.clear();
  cart.add(
    {
      dishId: 1,
      slug: 'smoky-party-jollof',
      name: 'Smoky Party Jollof',
      kitchen: 'nigerian',
      unitPriceKobo: 1,
      portionId: null,
      portionName: null,
      addonIds: [],
      addonNames: [],
      containsPork: false,
    },
    2,
  );
  const api = mockApi({
    'GET /auth/me': () => ({ body: { user: null } }),
    'GET /site': () => ({ body: site }),
    'POST /checkout/quote': () => ({ body: { quote } }),
    'POST /orders': () => ({ status: 201, body: placed }),
    'POST /payments/simulate': () => ({ body: { order: order(outcome) } }),
  });
  const utils = renderRoutes(
    [
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/orders/:reference', element: <p>Tracking page</p> },
    ],
    '/checkout',
  );
  return { ...api, ...utils };
}

async function fillAndPay() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: /pickup/i }));
  await screen.findByRole('button', { name: 'Pay ₦36,500' });
  await user.type(screen.getByLabelText('Full name'), 'Ada Obi');
  await user.type(screen.getByLabelText('Phone'), '08031234567');
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.click(screen.getByRole('button', { name: 'Pay ₦36,500' }));
  return user;
}

describe('CheckoutPage', () => {
  afterEach(() => cart.clear());

  it('shows the server total and sends only identifiers, never prices', async () => {
    const { calls } = setup();
    await fillAndPay();
    const placeCall = calls.find((c) => c.method === 'POST' && c.path === '/orders');
    const body = placeCall.body;
    expect(body.fulfilment).toBe('pickup');
    expect(body.items).toEqual([{ dish_id: 1, quantity: 2, portion_id: null, addon_ids: [], note: null }]);
    expect(JSON.stringify(body)).not.toMatch(/price|total/i);
    expect(placeCall.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('pays through the simulated gateway, clears the cart and opens tracking', async () => {
    const { router } = setup('paid');
    const user = await fillAndPay();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/no card is charged/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Pay ₦36,500' }));
    expect(await screen.findByText('Tracking page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/orders/SA-ABC123');
    expect(router.state.location.search).toBe('?t=tok%2Fen%2B1&new=1');
    expect(cart.snapshot()).toHaveLength(0);
  });

  it('keeps the cart and explains a declined payment', async () => {
    setup('failed');
    const user = await fillAndPay();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Simulate decline' }));
    expect(await screen.findByText(/payment was declined/i)).toBeInTheDocument();
    expect(cart.snapshot()).toHaveLength(1);
  });

  it('reuses the idempotency key when the guest retries the same order', async () => {
    const { calls } = setup('failed');
    const user = await fillAndPay();
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Simulate decline' }),
    );
    await screen.findByText(/payment was declined/i);
    await user.click(screen.getByRole('button', { name: 'Pay ₦36,500' }));
    await screen.findByRole('dialog');
    const keys = calls.filter((c) => c.path === '/orders').map((c) => c.headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('does not re-quote on every keystroke of the email address', async () => {
    const { calls } = setup();
    await fillAndPay();
    const quotes = calls.filter((c) => c.path === '/checkout/quote');
    expect(quotes.length).toBeLessThanOrEqual(3);
  });

  it('validates contact details before placing the order', async () => {
    const { calls } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: /pickup/i }));
    await user.click(await screen.findByRole('button', { name: 'Pay ₦36,500' }));
    expect(await screen.findByText('Your name is required.')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === '/orders')).toBe(false));
  });
});
