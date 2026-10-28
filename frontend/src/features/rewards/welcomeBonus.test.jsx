import { screen } from '@testing-library/react';
import { mockApi, renderRoutes } from '@/test/utils';
import { RewardsTermsPage } from '@/features/content/pages/legal/RewardsTermsPage';
import { RewardsPage } from './pages/RewardsPage';

const site = (welcomeBonusPoints) => ({
  restaurant: {},
  openingHours: [],
  deliveryZones: [],
  loyalty: {
    tiers: [],
    earnPointsPer1000Naira: 5,
    interestRateBp: 200,
    welcomeBonusPoints,
  },
});
const api = (points) => ({
  'GET /site': () => ({ body: site(points) }),
  'GET /auth/me': () => ({ body: { user: null } }),
  'GET /rewards': () => ({ body: { rewards: [] } }),
});

describe('welcome bonus wording', () => {
  it('/rewards says "Earn 200 bonus points on your first order"', async () => {
    mockApi(api(200));
    renderRoutes([{ path: '/rewards', element: <RewardsPage /> }], '/rewards');
    expect(await screen.findByText('Earn 200 bonus points on your first order')).toBeInTheDocument();
  });

  it('/rewards follows the amount the admin sets, and hides it when it is 0', async () => {
    mockApi(api(350));
    const view = renderRoutes([{ path: '/rewards', element: <RewardsPage /> }], '/rewards');
    expect(await screen.findByText('Earn 350 bonus points on your first order')).toBeInTheDocument();
    view.unmount();
    mockApi(api(0));
    renderRoutes([{ path: '/rewards', element: <RewardsPage /> }], '/rewards');
    expect(await screen.findByRole('heading', { name: 'Join the table' })).toBeInTheDocument();
    expect(screen.queryByText(/bonus points on your first order/)).toBeNull();
  });

  it('the Rewards Terms state the rule, and drop it when the bonus is off', async () => {
    mockApi(api(200));
    const view = renderRoutes([{ path: '/rewards-terms', element: <RewardsTermsPage /> }], '/rewards-terms');
    expect(await screen.findByText('Earn 200 bonus points on your first order.')).toBeInTheDocument();
    view.unmount();
    mockApi(api(0));
    renderRoutes([{ path: '/rewards-terms', element: <RewardsTermsPage /> }], '/rewards-terms');
    expect(await screen.findByRole('heading', { name: /. Points$/ })).toBeInTheDocument();
    expect(screen.queryByText(/bonus points on your first order/)).toBeNull();
  });
});
