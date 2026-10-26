import type { Permission } from '@/features/admin/api';
import { ApiError } from '@/lib/api';
import { db, getState, type Row } from '../db';
import { fail } from '../http';
import { sha256 } from '../random';
import { sql } from '../time';
import { audit } from './audit';

/**
 * Sign-in for the demo. Passwords are kept only as salted SHA-256 hashes in this browser.
 * (The real API uses Argon2id, server-side sessions, CSRF tokens, lockouts and 2FA.)
 */

export const STAFF_ROLES = ['super_admin', 'manager', 'staff'];
const SALT = 'small-africa-demo:';

export const hashPassword = (password: string) => sha256(SALT + password);

export function currentUser(): Row | null {
  const id = getState().userId;
  const user = id ? db.byId('users', id) : null;
  return user && user.is_active ? user : null;
}

export function userToPublic(u: Row) {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    staffPosition: u.staff_position,
    emailVerified: u.email_verified_at !== null,
    birthday: u.birthday,
    favouriteKitchenId: u.favourite_kitchen_id,
    referralCode: u.referral_code,
    marketingOptIn: !!u.marketing_opt_in,
    themePreference: u.theme_preference ?? null,
    twoFactorEnabled: u.totp_enabled_at !== null,
    createdAt: u.created_at,
  };
}

const COMMON = [
  'password',
  'password1',
  'password123',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'iloveyou12',
  'smallafrica',
  'smallafrica1',
  'welcome123',
  'letmein123',
  'admin12345',
  'abcdefghij',
  'naija12345',
];

/** PasswordPolicy::problems */
export function passwordProblems(password: string, personal: string[]): string[] {
  const problems: string[] = [];
  const len = [...password].length;
  if (len < 10) problems.push('Use at least 10 characters.');
  if (len > 128) problems.push('Use at most 128 characters.');
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(password)).length;
  if (classes < 3) problems.push('Mix at least three of: lowercase, uppercase, numbers and symbols.');
  if (COMMON.includes(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
    problems.push('That password is too common. Choose something more unique.');
  }
  const lower = password.toLowerCase();
  if (personal.some((v) => v.trim().length >= 4 && lower.includes(v.trim().toLowerCase()))) {
    problems.push('Don’t include your name or email in your password.');
  }
  return problems;
}

export async function login(email: string, password: string) {
  const user = db.find('users', (u) => u.email === email.trim().toLowerCase());
  const hash = await hashPassword(password);
  if (!user || !user.is_active || getState().passwords[user.id] !== hash) {
    throw new ApiError(401, 'invalid_credentials', 'That email and password combination didn’t work.');
  }
  getState().userId = user.id;
  user.last_login_at = sql();
  audit(user.id, 'auth.login', 'user', user.id);
  return userToPublic(user);
}

function newReferralCode(firstName: string): string {
  const base = (firstName.replace(/[^A-Za-z]/g, '').toUpperCase() || 'GUEST').slice(0, 8);
  let referral: string;
  do referral = base + String(1000 + Math.floor(Math.random() * 9000));
  while (db.find('users', (u) => u.referral_code === referral));
  return referral;
}

export async function register(data: Row) {
  const problems = passwordProblems(data.password, [
    data.first_name,
    data.last_name,
    data.email.split('@')[0] ?? '',
  ]);
  if (problems.length) throw fail.field('password', problems.join(' '));
  if (db.find('users', (u) => u.email === data.email)) {
    throw fail.field(
      'email',
      'An account with this email already exists. Try signing in or resetting your password.',
    );
  }
  let referrer: Row | null = null;
  if (data.referral_code) {
    referrer = db.find(
      'users',
      (u) => u.referral_code === String(data.referral_code).trim().toUpperCase() && !!u.is_active,
    );
    if (!referrer) throw fail.field('referral_code', 'That referral code isn’t valid.');
  }
  const user = db.insert('users', {
    role: 'customer',
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone ?? null,
    referral_code: newReferralCode(data.first_name),
    referred_by_user_id: referrer?.id ?? null,
    marketing_opt_in: data.marketing_opt_in ? 1 : 0,
    // No email is sent in the demo, so the address counts as confirmed straight away.
    email_verified_at: sql(),
  });
  db.insert('loyalty_accounts', { user_id: user.id });
  if (referrer) {
    db.insert('referrals', {
      referrer_user_id: referrer.id,
      referred_user_id: user.id,
      referred_phone: data.phone ?? null,
    });
  }
  getState().passwords[user.id] = await hashPassword(data.password);
  getState().userId = user.id;
  audit(user.id, 'auth.register', 'user', user.id);
  return userToPublic(user);
}

export async function changePassword(user: Row, current: string, next: string): Promise<void> {
  if (getState().passwords[user.id] !== (await hashPassword(current))) {
    throw fail.field('current_password', 'Your current password is incorrect.');
  }
  const problems = passwordProblems(next, [
    user.first_name,
    user.last_name,
    String(user.email).split('@')[0] ?? '',
  ]);
  if (problems.length) throw fail.field('new_password', problems.join(' '));
  getState().passwords[user.id] = await hashPassword(next);
  audit(user.id, 'auth.password_changed', 'user', user.id);
}

/* ---------------------------------------------------------------- permissions */

const MANAGERS = ['super_admin', 'manager'];

/** App\Security\Permissions::MAP */
export const PERMISSIONS: Record<Permission, string[]> = {
  'dashboard.view': ['super_admin', 'manager', 'staff:kitchen', 'staff:front_desk'],
  'orders.view': ['super_admin', 'manager', 'staff:kitchen', 'staff:front_desk'],
  'orders.status': ['super_admin', 'manager', 'staff:kitchen', 'staff:front_desk'],
  'orders.refund': MANAGERS,
  'reservations.manage': ['super_admin', 'manager', 'staff:front_desk'],
  'reservations.capacity': MANAGERS,
  'menu.manage': MANAGERS,
  'menu.availability': ['super_admin', 'manager', 'staff:kitchen'],
  'customers.view': ['super_admin', 'manager', 'staff:front_desk'],
  'customers.visits': ['super_admin', 'manager', 'staff:front_desk'],
  'loyalty.manage': MANAGERS,
  'loyalty.adjust': ['super_admin'],
  'loyalty.interest': ['super_admin'],
  'reviews.moderate': MANAGERS,
  'coupons.manage': MANAGERS,
  'enquiries.manage': ['super_admin', 'manager', 'staff:front_desk'],
  'staff.manage': ['super_admin'],
  'settings.manage': MANAGERS,
  'audit.view': MANAGERS,
};

export function can(user: Row | null, permission: Permission): boolean {
  if (!user || !user.is_active) return false;
  const grants = PERMISSIONS[permission];
  return (
    grants.includes(user.role) ||
    (user.role === 'staff' && grants.includes(`staff:${user.staff_position ?? ''}`))
  );
}

export function permissionsFor(user: Row): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(user, p));
}
