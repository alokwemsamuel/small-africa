/** Friendly messages for the `?error=` the API adds when it sends someone back from a provider. */
const MESSAGES = {
  social_cancelled: 'You cancelled that sign-in. No problem: try again, or use your email.',
  social_failed: 'We couldn’t complete that sign-in. Please try again, or use your email.',
  social_expired: 'That sign-in took too long. Please start again.',
  social_disabled: 'That sign-in option isn’t available right now. Please use your email.',
  social_email_unverified:
    'That provider hasn’t confirmed your email address, so we can’t link it to an existing account. Sign in with your password first, then connect it from your account page.',
  social_staff: 'Staff accounts sign in with email, password and two-step verification.',
  social_inactive: 'This account is switched off. Please contact us if you think that’s a mistake.',
  social_in_use: 'That account is already connected to another Small Africa customer.',
};

/** @param {string | null | undefined} code @returns {string | null} */
export function socialErrorMessage(code) {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES.social_failed;
}
