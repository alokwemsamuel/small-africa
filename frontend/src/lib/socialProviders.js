import { env } from '@/lib/env';

/** The sign-in providers, in the order the buttons appear. Labels follow each provider's brand guidelines. */
export const PROVIDERS = [
  { id: 'google', name: 'Google', label: 'Continue with Google' },
  { id: 'apple', name: 'Apple', label: 'Continue with Apple' },
  { id: 'facebook', name: 'Facebook', label: 'Continue with Facebook' },
];

/**
 * The address the browser is sent to; the API takes it from there (see docs/SOCIAL-LOGIN-SETUP.md).
 * @param {'google' | 'apple' | 'facebook'} provider
 * @param {{ mode?: 'sign-up' | 'sign-in', returnTo?: string, referralCode?: string }} [options]
 */
export function oauthStartUrl(provider, { mode, returnTo, referralCode } = {}) {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  if (returnTo) params.set('return', returnTo);
  if (referralCode) params.set('ref', referralCode);
  const query = params.toString();
  return `${env.apiBase}/auth/oauth/${provider}/start${query ? `?${query}` : ''}`;
}
