import { api, ApiError } from '@/lib/api';
import { installDemo, resetDemo } from './index';
import { freezeClock } from './time';

const post = (path, body = {}) => api(path, { method: 'POST', body });

async function errorOf(p) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Expected an API error');
}

const finish = {
  phone: '0803 123 4567',
  birthday_day: 14,
  birthday_month: 7,
  referral_code: null,
  accept_terms: true,
};

beforeAll(async () => {
  freezeClock('2026-10-30 19:15:00');
  window.localStorage.clear();
  await installDemo({ latency: false });
});
beforeEach(async () => {
  await resetDemo();
});
afterAll(() => freezeClock(null));

describe('demo: simulated social sign-in', () => {
  it('offers all three providers', async () => {
    expect((await api('/auth/providers')).providers).toEqual(['google', 'apple', 'facebook']);
  });

  it('creates a customer from the simulated provider, who still has to finish the welcome step', async () => {
    const r = await post('/auth/social/demo', { provider: 'google' });
    expect(r.isNew).toBe(true);
    expect(r.user).toMatchObject({
      firstName: 'Ada',
      lastName: 'Okafor',
      email: 'ada.okafor@example.com',
      role: 'customer',
      emailVerified: true,
      phone: null,
      hasPassword: false,
      welcome: { provider: 'google', needsEmail: false },
    });
    expect((await api('/auth/me')).user.welcome).toMatchObject({ provider: 'google' });
  });

  it('finishing creates the Bronze card, keeps the phone and the birthday, and clears the welcome step', async () => {
    await post('/auth/social/demo', { provider: 'apple' });
    const r = await post('/auth/welcome', finish);
    expect(r.user).toMatchObject({ phone: '+2348031234567', birthday: '2000-07-14', welcome: null });
    const loyalty = await api('/account/loyalty');
    expect(loyalty.tier.key).toBe('bronze');
    expect((await errorOf(post('/auth/welcome', finish))).status).toBe(400);
  });

  it('checks the details: phone, terms, a real birthday, a valid referral code', async () => {
    await post('/auth/social/demo', { provider: 'facebook' });
    expect((await errorOf(post('/auth/welcome', { ...finish, phone: '' }))).fields?.phone).toBeTruthy();
    expect(
      (await errorOf(post('/auth/welcome', { ...finish, accept_terms: false }))).fields?.accept_terms,
    ).toBeTruthy();
    expect(
      (await errorOf(post('/auth/welcome', { ...finish, birthday_day: 31, birthday_month: 4 }))).fields
        ?.birthday_day,
    ).toBeTruthy();
    expect(
      (await errorOf(post('/auth/welcome', { ...finish, birthday_month: null }))).fields?.birthday_day,
    ).toBeTruthy();
    expect(
      (await errorOf(post('/auth/welcome', { ...finish, referral_code: 'NOSUCHCODE' }))).fields
        ?.referral_code,
    ).toBeTruthy();
    // A leap day is a real birthday.
    const ok = await post('/auth/welcome', { ...finish, birthday_day: 29, birthday_month: 2 });
    expect(ok.user.birthday).toBe('2000-02-29');
  });

  it('records a referral when the code is valid', async () => {
    const guest = await post('/auth/login', {
      email: 'guest@smallafrica.demo',
      password: 'SmallAfrica@Guest2026',
    });
    await post('/auth/logout');
    await post('/auth/social/demo', { provider: 'google' });
    const r = await post('/auth/welcome', {
      ...finish,
      referral_code: guest.user.referralCode.toLowerCase(),
    });
    expect(r.user.welcome).toBeNull();
  });

  it('signs the same person in again, straight to their account', async () => {
    await post('/auth/social/demo', { provider: 'google' });
    await post('/auth/welcome', finish);
    await post('/auth/logout');
    expect((await api('/auth/me')).user).toBeNull();
    const again = await post('/auth/social/demo', { provider: 'google' });
    expect(again.isNew).toBe(false);
    expect(again.user.welcome).toBeNull();
    expect(again.user.phone).toBe('+2348031234567');
  });

  it('needs someone signed in for the welcome step', async () => {
    await post('/auth/logout');
    expect((await errorOf(post('/auth/welcome', finish))).status).toBe(401);
  });

  it('rejects an unknown provider', async () => {
    expect((await errorOf(post('/auth/social/demo', { provider: 'myspace' }))).status).toBe(422);
  });
});
