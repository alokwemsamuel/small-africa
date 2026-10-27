import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cart } from '@/features/cart/cart';
import { mockApi, renderRoutes } from '@/test/utils';
import { CheckoutPage } from './CheckoutPage';

const member = {
  id: 3,
  firstName: 'Chiamaka',
  lastName: 'Bello',
  email: 'guest@smallafrica.demo',
  phone: '08030000003',
  role: 'customer',
  emailVerified: true,
};

const baseQuote = {
  lines: [
    {
      dishId: 1,
      slug: 'smoky-party-jollof',
      name: 'Smoky Party Jollof',
      kitchen: 'nigerian',
      unitPriceKobo: 1850000,
      quantity: 2,
      lineTotalKobo: 3700000,
      portion: null,
      addons: [],
      note: null,
      containsPork: false,
      isAlcoholic: false,
    },
  ],
  subtotalKobo: 3700000,
  discountKobo: 0,
  coupon: null,
  voucher: null,
  voucherDiscountKobo: 0,
  deliveryFeeKobo: 0,
  freeDeliveryPerk: false,
  packagingFeeKobo: 50000,
  serviceChargeKobo: 0,
  vatIncludedKobo: 258139,
  totalKobo: 3750000,
  walletBalanceKobo: 6850000,
  walletAppliedKobo: 0,
  payableKobo: 3750000,
  fulfilment: 'pickup',
  zone: null,
  scheduledFor: null,
  estimatedReadyAt: '2026-10-20T12:30:00+01:00',
};

it('lets a member pay the whole order with dining credit, without a card', async () => {
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
  const { calls } = mockApi({
    'GET /auth/me': () => ({ body: { user: member } }),
    'GET /site': () => ({ body: { restaurant: {}, openingHours: [], deliveryZones: [] } }),
    'GET /account/addresses': () => ({ body: { addresses: [] } }),
    'GET /account/loyalty': () => ({
      body: {
        wallet: { balanceKobo: 6850000 },
        vouchers: [
          {
            code: 'RW-ABC234',
            title: 'Free dessert',
            source: 'stamp_card',
            dineInOnly: false,
            expiresAt: '2027-01-01 00:00:00',
          },
        ],
      },
    }),
    'POST /checkout/quote': (_u, init) => {
      const body = JSON.parse(String(init.body));
      return {
        body: {
          quote: body.use_wallet ? { ...baseQuote, walletAppliedKobo: 3750000, payableKobo: 0 } : baseQuote,
        },
      };
    },
    'POST /orders': () => ({
      status: 201,
      body: {
        order: { reference: 'SA-WAL123', paymentStatus: 'paid', totalKobo: 0, walletAppliedKobo: 3750000 },
        payment: null,
        trackingToken: 'tok',
        publicKey: null,
      },
    }),
  });
  const { router } = renderRoutes(
    [
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/orders/:reference', element: <p>Tracking page</p> },
    ],
    '/checkout',
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('radio', { name: /pickup/i }));
  await screen.findByRole('button', { name: 'Pay ₦37,500' });
  expect(screen.getByRole('combobox', { name: 'Reward voucher' })).toBeInTheDocument();

  await user.click(await screen.findByRole('checkbox', { name: /use my dining credit/i }));
  const place = await screen.findByRole('button', { name: 'Place order with dining credit' });
  expect(screen.getByText('To pay by card')).toBeInTheDocument();
  await user.click(place);

  expect(await screen.findByText('Tracking page')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/orders/SA-WAL123');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(cart.snapshot()).toHaveLength(0));
  const placed = calls.find((c) => c.method === 'POST' && c.path === '/orders').body;
  expect(placed.use_wallet).toBe(true);
});
