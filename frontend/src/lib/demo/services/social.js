import { db, getState } from '@/lib/demo/db';
import { fail } from '@/lib/demo/http';
import { sql } from '@/lib/demo/time';
import { audit } from './audit';
import { STAFF_ROLES, userToPublic } from './auth';

/**
 * Simulated "Continue with Google / Apple / Facebook" for the demo. Nothing leaves the browser and
 * no real account is used: each provider is a made-up person. The rules are the real API's
 * (backend/src/Services/SocialAuthService.php): an existing identity signs in, a new one creates
 * a customer who still has to finish /welcome, staff are refused.
 */

export const PROVIDER_IDS = ['google', 'apple', 'facebook'];

/** Who each simulated provider says you are. */
export const DEMO_PEOPLE = {
  google: { firstName: 'Ada', lastName: 'Okafor', email: 'ada.okafor@example.com' },
  apple: { firstName: 'Kasia', lastName: 'Nowak', email: 'kasia.nowak@example.com' },
  facebook: { firstName: 'Tunde', lastName: 'Bello', email: 'tunde.bello@example.com' },
};

function newReferralCode(firstName) {
  const base = (firstName.replace(/[^A-Za-z]/g, '').toUpperCase() || 'GUEST').slice(0, 8);
  let code;
  do code = base + String(1000 + Math.floor(Math.random() * 9000));
  while (db.find('users', (u) => u.referral_code === code));
  return code;
}

const subjectOf = (provider) => `demo-${provider}-subject`;

/** Signs in (or signs up) as the simulated person for this provider. */
export function socialSignIn(provider) {
  const person = DEMO_PEOPLE[provider];
  if (!person) throw fail.badRequest('Unknown sign-in provider.');
  const identity = db.find(
    'user_identities',
    (i) => i.provider === provider && i.provider_user_id === subjectOf(provider),
  );
  let user = identity ? db.byId('users', identity.user_id) : null;
  let isNew = false;

  if (!user) {
    // Same verified email as an existing account: link to it (never to staff).
    user = db.find('users', (u) => u.email === person.email);
    if (user) {
      if (STAFF_ROLES.includes(user.role))
        throw fail.forbidden('Staff accounts sign in with email, password and two-step verification.');
    } else {
      isNew = true;
      user = db.insert('users', {
        role: 'customer',
        first_name: person.firstName,
        last_name: person.lastName,
        email: person.email,
        phone: null,
        referral_code: newReferralCode(person.firstName),
        referred_by_user_id: null,
        marketing_opt_in: 0,
        email_verified_at: sql(),
        signup_provider: provider,
        onboarded_at: null,
      });
      db.insert('loyalty_accounts', { user_id: user.id });
      audit(user.id, 'auth.register', 'user', user.id);
    }
    db.insert('user_identities', {
      user_id: user.id,
      provider,
      provider_user_id: subjectOf(provider),
      email: person.email,
      created_at: sql(),
      last_used_at: sql(),
    });
  } else {
    identity.last_used_at = sql();
  }
  if (!user.is_active) throw fail.forbidden('This account is switched off.');
  if (STAFF_ROLES.includes(user.role))
    throw fail.forbidden('Staff accounts sign in with email, password and two-step verification.');
  getState().userId = user.id;
  user.last_login_at = sql();
  audit(user.id, 'auth.social_login', 'user', user.id, { provider });
  return { user: userToPublic(user), isNew };
}

/** Finishes the "almost there" step: phone, optional birthday and referral code, terms. */
export function completeWelcome(user, data) {
  if (!user.signup_provider || user.onboarded_at) throw fail.badRequest('There is nothing left to finish.');
  if (data.accept_terms !== true) {
    throw fail.field(
      'accept_terms',
      'Please accept the Terms, Privacy Policy and Rewards Terms to continue.',
    );
  }
  let referrer = null;
  if (data.referral_code) {
    referrer = db.find(
      'users',
      (u) =>
        u.referral_code === String(data.referral_code).trim().toUpperCase() &&
        !!u.is_active &&
        u.id !== user.id,
    );
    if (!referrer) throw fail.field('referral_code', 'That referral code isn’t valid.');
  }
  const hasDay = data.birthday_day !== null && data.birthday_day !== undefined;
  const hasMonth = data.birthday_month !== null && data.birthday_month !== undefined;
  if (hasDay !== hasMonth)
    throw fail.field('birthday_day', 'Choose both the day and the month, or leave both empty.');
  if (hasDay) {
    const probe = new Date(Date.UTC(2000, data.birthday_month - 1, data.birthday_day));
    if (probe.getUTCMonth() !== data.birthday_month - 1)
      throw fail.field('birthday_day', 'That date doesn’t exist.');
    // Day and month only: 2000 is a leap year, so 29 February is allowed.
    user.birthday = `2000-${String(data.birthday_month).padStart(2, '0')}-${String(data.birthday_day).padStart(2, '0')}`;
  }
  user.phone = data.phone;
  user.terms_accepted_at = sql();
  if (referrer) {
    user.referred_by_user_id = referrer.id;
    db.insert('referrals', {
      referrer_user_id: referrer.id,
      referred_user_id: user.id,
      referred_phone: data.phone,
    });
  }
  user.onboarded_at = sql();
  audit(user.id, 'auth.welcome_completed', 'user', user.id);
  return userToPublic(user);
}
