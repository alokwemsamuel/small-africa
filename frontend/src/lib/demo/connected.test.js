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
  birthday_day: null,
  birthday_month: null,
  referral_code: null,
  accept_terms: true,
};
const GOOD_PASSWORD = 'Jollof&Pierogi-2026';

beforeAll(async () => {
  freezeClock('2026-10-30 19:15:00');
  window.localStorage.clear();
  await installDemo({ latency: false });
});
beforeEach(async () => {
  await resetDemo();
});
afterAll(() => freezeClock(null));

describe('demo: connected accounts', () => {
  it('lists what is connected, whether there is a password, and what could be connected', async () => {
    await post('/auth/social/demo', { provider: 'google' });
    await post('/auth/welcome', finish);
    const r = await api('/account/identities');
    expect(r.identities).toHaveLength(1);
    expect(r.identities[0]).toMatchObject({ provider: 'google', email: 'ada.okafor@example.com' });
    expect(r.hasPassword).toBe(false);
    expect(r.available).toEqual(['google', 'apple', 'facebook']);
  });

  it('will not disconnect the only way to sign in, until a password is set', async () => {
    await post('/auth/social/demo', { provider: 'google' });
    const blocked = await errorOf(api('/account/identities/google', { method: 'DELETE' }));
    expect(blocked.status).toBe(409);
    expect(blocked.code).toBe('last_sign_in_method');

    expect(
      (await errorOf(post('/account/password/set', { new_password: 'short' }))).fields?.new_password,
    ).toBeTruthy();
    await post('/account/password/set', { new_password: GOOD_PASSWORD });
    expect((await api('/account/identities')).hasPassword).toBe(true);
    expect((await errorOf(post('/account/password/set', { new_password: GOOD_PASSWORD }))).code).toBe(
      'has_password',
    );

    await api('/account/identities/google', { method: 'DELETE' });
    expect((await api('/account/identities')).identities).toEqual([]);
    // They can now sign in with the email and the new password.
    await post('/auth/logout');
    const again = await post('/auth/login', { email: 'ada.okafor@example.com', password: GOOD_PASSWORD });
    expect(again.user.firstName).toBe('Ada');
    expect((await errorOf(api('/account/identities/apple', { method: 'DELETE' }))).status).toBe(404);
  });

  it('connects a second provider and lets either one go while the other remains', async () => {
    await post('/auth/social/demo', { provider: 'google' });
    await post('/account/identities/demo', { provider: 'facebook' });
    expect((await api('/account/identities')).identities.map((i) => i.provider)).toEqual([
      'google',
      'facebook',
    ]);
    await api('/account/identities/facebook', { method: 'DELETE' });
    expect((await api('/account/identities')).identities.map((i) => i.provider)).toEqual(['google']);
  });

  it('will not connect a provider account that belongs to another customer', async () => {
    await post('/auth/social/demo', { provider: 'google' });
    await post('/auth/logout');
    await post('/auth/login', { email: 'guest@smallafrica.demo', password: 'SmallAfrica@Guest2026' });
    const refused = await errorOf(post('/account/identities/demo', { provider: 'google' }));
    expect(refused.status).toBe(409);
    expect(refused.code).toBe('in_use');
  });

  it('keeps staff out of connected accounts', async () => {
    await post('/auth/login', { email: 'admin@smallafrica.demo', password: 'SmallAfrica@Admin2026' });
    expect((await errorOf(api('/account/identities'))).status).toBe(403);
    expect((await errorOf(post('/account/identities/demo', { provider: 'apple' }))).status).toBe(403);
  });

  it('points to "set a password" when there is no password to change', async () => {
    await post('/auth/social/demo', { provider: 'apple' });
    const e = await errorOf(
      post('/account/password', { current_password: 'whatever', new_password: GOOD_PASSWORD }),
    );
    expect(e.fields?.current_password).toMatch(/no password yet/);
  });
});
