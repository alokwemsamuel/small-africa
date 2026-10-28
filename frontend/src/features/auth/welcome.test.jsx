import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderRoutes } from '@/test/utils';
import { welcomeSchema } from '@/lib/authSchemas';
import { WelcomePage } from './pages/WelcomePage';

const person = (welcome, extra = {}) => ({
  id: 7,
  firstName: 'Ada',
  lastName: 'Okafor',
  email: 'ada.okafor@example.com',
  phone: null,
  role: 'customer',
  staffPosition: null,
  emailVerified: true,
  birthday: null,
  favouriteKitchenId: null,
  referralCode: 'ADA1234',
  marketingOptIn: false,
  themePreference: null,
  twoFactorEnabled: false,
  createdAt: '2026-10-27 10:00:00',
  welcome,
  ...extra,
});
const routes = [
  { path: '/welcome', element: <WelcomePage /> },
  { path: '/login', element: <p>Login page</p> },
  { path: '/account', element: <p>Account page</p> },
  { path: '/admin', element: <p>Admin page</p> },
];
const me = (user) => ({ 'GET /auth/me': () => ({ body: { user } }) });

describe('/welcome', () => {
  it('sends someone who is signed out to sign in', async () => {
    mockApi(me(null));
    renderRoutes(routes, '/welcome');
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('sends everyone who has nothing left to finish to their account (or admin)', async () => {
    mockApi(me(person(null)));
    const view = renderRoutes(routes, '/welcome');
    expect(await screen.findByText('Account page')).toBeInTheDocument();
    view.unmount();
    mockApi(me(person(null, { role: 'manager' })));
    renderRoutes(routes, '/welcome');
    expect(await screen.findByText('Admin page')).toBeInTheDocument();
  });

  it('shows the card, the heading and every field', async () => {
    mockApi(me(person({ provider: 'google', needsEmail: false })));
    renderRoutes(routes, '/welcome?ref=friend77');
    expect(await screen.findByRole('heading', { name: 'Welcome to the table' })).toBeInTheDocument();
    expect(screen.getByText('Almost there')).toBeInTheDocument();
    expect(screen.getByText('Ada Okafor')).toBeInTheDocument();
    expect(screen.getByText('AO')).toBeInTheDocument();
    expect(screen.getByText('ada.okafor@example.com')).toBeInTheDocument();
    expect(screen.getByText(/delivery calls and reservation reminders/)).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Birthday: day' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Birthday: month' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Referral code/)).toHaveValue('FRIEND77');
    expect(screen.getByRole('link', { name: 'Rewards Terms' })).toHaveAttribute('href', '/rewards-terms');
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.getByRole('button', { name: 'Finish and start earning' })).toBeInTheDocument();
    expect(screen.getByText(/Bronze membership card is ready/)).toBeInTheDocument();
  });

  it('tells the new member about the welcome bonus, using the amount the restaurant set', async () => {
    mockApi({
      ...me(person({ provider: 'google', needsEmail: false })),
      'GET /site': () => ({ body: { loyalty: { welcomeBonusPoints: 200 } } }),
    });
    renderRoutes(routes, '/welcome');
    expect(await screen.findByText(/Earn 200 bonus points on your first order\./)).toBeInTheDocument();
    expect(screen.queryByText(/Points start adding up/)).toBeNull();
  });

  it('needs a phone number and the terms, and checks both', async () => {
    mockApi(me(person({ provider: 'apple', needsEmail: false })));
    renderRoutes(routes, '/welcome');
    await userEvent.click(await screen.findByRole('button', { name: 'Finish and start earning' }));
    expect(await screen.findByText('Enter your phone number.')).toBeInTheDocument();
    expect(screen.getByText(/Please accept the Terms, Privacy Policy and Rewards Terms/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Phone'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Finish and start earning' }));
    expect(await screen.findByText(/Enter a valid phone number/)).toBeInTheDocument();
  });

  it('sends the details and goes to the account', async () => {
    let sent;
    mockApi({
      ...me(person({ provider: 'facebook', needsEmail: false })),
      'POST /auth/welcome': (_url, init) => {
        sent = JSON.parse(init.body);
        return { body: { user: person(null, { phone: '08031234567' }) } };
      },
    });
    renderRoutes(routes, '/welcome');
    await userEvent.type(await screen.findByLabelText('Phone'), '0803 123 4567');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Birthday: day' }), '14');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Birthday: month' }), '7');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Finish and start earning' }));
    expect(await screen.findByText('Account page')).toBeInTheDocument();
    expect(sent).toMatchObject({
      phone: '0803 123 4567',
      birthday_day: 14,
      birthday_month: 7,
      referral_code: null,
      accept_terms: true,
    });
    expect(sent).not.toHaveProperty('email');
  });

  it('asks for the email when the provider did not share one', async () => {
    let sent;
    mockApi({
      ...me(person({ provider: 'facebook', needsEmail: true })),
      'POST /auth/welcome': (_url, init) => {
        sent = JSON.parse(init.body);
        return { body: { user: person(null) } };
      },
    });
    renderRoutes(routes, '/welcome');
    await userEvent.click(await screen.findByRole('button', { name: 'Finish and start earning' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Phone'), '08031234567');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Finish and start earning' }));
    await waitFor(() => expect(sent?.email).toBe('ada@example.com'));
  });

  it('shows what the server says is wrong with a field', async () => {
    mockApi({
      ...me(person({ provider: 'google', needsEmail: false })),
      'POST /auth/welcome': () => ({
        status: 422,
        body: {
          error: {
            code: 'validation_failed',
            message: 'Check the form.',
            fields: { referral_code: 'That referral code isn’t valid.' },
          },
        },
      }),
    });
    renderRoutes(routes, '/welcome');
    await userEvent.type(await screen.findByLabelText('Phone'), '08031234567');
    await userEvent.type(screen.getByLabelText(/Referral code/), 'nope');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Finish and start earning' }));
    expect(await screen.findByText('That referral code isn’t valid.')).toBeInTheDocument();
    expect(screen.queryByText('Account page')).toBeNull();
  });
});

describe('welcomeSchema', () => {
  const base = {
    email: '',
    phone: '0803 123 4567',
    birthday_day: '',
    birthday_month: '',
    referral_code: '',
    accept_terms: true,
  };
  const ok = (v, options) => welcomeSchema(options).safeParse({ ...base, ...v }).success;

  it('takes a Nigerian or international phone number', () => {
    expect(ok({})).toBe(true);
    expect(ok({ phone: '+2348031234567' })).toBe(true);
    expect(ok({ phone: '+48 600 123 456' })).toBe(true);
    expect(ok({ phone: '12345' })).toBe(false);
    expect(ok({ phone: '' })).toBe(false);
  });

  it('needs both the day and the month of a real date, or neither', () => {
    expect(ok({ birthday_day: '29', birthday_month: '2' })).toBe(true);
    expect(ok({ birthday_day: '31', birthday_month: '4' })).toBe(false);
    expect(ok({ birthday_day: '30', birthday_month: '2' })).toBe(false);
    expect(ok({ birthday_day: '14' })).toBe(false);
    expect(ok({ birthday_month: '7' })).toBe(false);
  });

  it('needs the terms ticked, and an email only when asked for one', () => {
    expect(ok({ accept_terms: false })).toBe(false);
    expect(ok({}, { needsEmail: true })).toBe(false);
    expect(ok({ email: 'ada@example.com' }, { needsEmail: true })).toBe(true);
  });
});
