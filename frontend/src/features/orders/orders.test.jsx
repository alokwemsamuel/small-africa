import { screen } from '@testing-library/react';
import { mockApi, renderRoutes } from '@/test/utils';
import { OrderTrackingPage } from '@/features/orders/pages/OrderTrackingPage';
import { steps } from './steps';

const order = {
  reference: 'SA-ABC123',
  status: 'preparing',
  paymentStatus: 'paid',
  fulfilment: 'delivery',
  zone: { name: 'Lekki Phase 1', etaMinutes: 45 },
  scheduledFor: null,
  placedAt: '2026-10-20 12:00:00',
  createdAt: '2026-10-20 11:59:00',
  customerName: 'Ada Obi',
  subtotalKobo: 3600000,
  discountKobo: 0,
  deliveryFeeKobo: 250000,
  serviceChargeKobo: 0,
  vatIncludedKobo: 251163,
  totalKobo: 3900000,
  voucherDiscountKobo: 0,
  walletAppliedKobo: 0,
  pointsEarned: 0,
  items: [
    {
      dishId: 1,
      slug: 'smoky-party-jollof',
      name: 'Smoky Party Jollof',
      quantity: 2,
      unitPriceKobo: 1800000,
      lineTotalKobo: 3600000,
      portion: null,
      addons: [],
      containsPork: false,
      note: null,
    },
  ],
  history: [
    { status: 'pending_payment', at: '2026-10-20 11:59:00' },
    { status: 'received', at: '2026-10-20 12:00:00' },
    { status: 'preparing', at: '2026-10-20 12:05:00' },
  ],
  deliveryArea: 'Lekki Phase 1',
  reviewable: false,
};

describe('OrderTrackingPage', () => {
  it('shows progress and the receipt for a valid tracking link', async () => {
    const { calls } = mockApi({ 'GET /orders/SA-ABC123?t=tok': () => ({ body: { order } }) });
    renderRoutes(
      [{ path: '/orders/:reference', element: <OrderTrackingPage /> }],
      '/orders/SA-ABC123?t=tok&new=1',
    );
    expect(await screen.findByText('Thank you, Ada')).toBeInTheDocument();
    const current = screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent('Preparing');
    expect(screen.getByText('Out for delivery')).toBeInTheDocument();
    expect(screen.getByText('₦39,000')).toBeInTheDocument();
    expect(calls[0]?.path).toBe('/orders/SA-ABC123?t=tok');
  });

  it('does not reveal anything without a valid token', async () => {
    mockApi({});
    renderRoutes([{ path: '/orders/:reference', element: <OrderTrackingPage /> }], '/orders/SA-ABC123?t=bad');
    expect(await screen.findByText('We couldn’t find that order')).toBeInTheDocument();
    expect(screen.queryByText('Smoky Party Jollof')).not.toBeInTheDocument();
  });
});

it('uses pickup-specific steps', () => {
  expect(steps({ fulfilment: 'pickup' }).map((s) => s.status)).toEqual([
    'received',
    'preparing',
    'ready',
    'completed',
  ]);
  expect(steps({ fulfilment: 'delivery' }).map((s) => s.status)).toContain('out_for_delivery');
});
