import { z } from 'zod';

/** Mirrors backend PasswordPolicy so users get instant feedback; the server still decides. */
const PASSWORD_MIN = 10;

export function passwordProblems(password, personal = []) {
  const problems = [];
  if (password.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (password.length > 128) problems.push('Use at most 128 characters.');
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(password)).length;
  if (classes < 3) problems.push('Mix at least three of: lowercase, uppercase, numbers and symbols.');
  const lower = password.toLowerCase();
  if (personal.some((p) => p.trim().length >= 4 && lower.includes(p.trim().toLowerCase()))) {
    problems.push('Don’t include your name or email in your password.');
  }
  return problems;
}

/** 0–4 for the strength meter. */
export function passwordScore(password) {
  if (!password) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(password)).length;
  let score = 0;
  if (password.length >= PASSWORD_MIN) score++;
  if (password.length >= 14) score++;
  if (classes >= 3) score++;
  if (classes === 4) score++;
  return score;
}

const strongPassword = z.string().superRefine((v, ctx) => {
  const problems = passwordProblems(v);
  if (problems.length) ctx.addIssue({ code: 'custom', message: problems.join(' ') });
});

const email = z.email({ error: 'Enter a valid email address.' }).max(191);
const nigerianPhone = /^(\+?234|0)[789][01]\d{8}$|^\+[1-9]\d{7,14}$/;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: 'Enter your password.' }),
});

export const registerSchema = z
  .object({
    first_name: z.string().trim().min(1, { error: 'First name is required.' }).max(80),
    last_name: z.string().trim().min(1, { error: 'Last name is required.' }).max(80),
    email,
    phone: z
      .string()
      .trim()
      .refine((v) => v === '' || nigerianPhone.test(v.replace(/[\s\-()]/g, '')), {
        error: 'Enter a valid phone number, e.g. 0803 123 4567.',
      }),
    password: strongPassword,
    referral_code: z.string().trim().max(20),
    marketing_opt_in: z.boolean(),
    accept_terms: z.boolean().refine((v) => v, { error: 'Please accept the Terms and Privacy Policy.' }),
  })
  .superRefine((v, ctx) => {
    // Personal-info check needs the other fields, so it runs once the object is otherwise valid.
    const personal = [v.first_name, v.last_name, v.email.split('@')[0] ?? ''];
    const lower = v.password.toLowerCase();
    if (personal.some((p) => p.trim().length >= 4 && lower.includes(p.trim().toLowerCase()))) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Don’t include your name or email in your password.',
      });
    }
  });

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // February: leap day allowed

/**
 * The "almost there" step after a social sign-up. The birthday is a day and a month only, both or neither.
 * @param {{ needsEmail?: boolean }} [options] the provider didn't give us an email: ask for it
 */
export function welcomeSchema({ needsEmail = false } = {}) {
  return z
    .object({
      email: needsEmail ? email : z.string().optional(),
      phone: z
        .string()
        .trim()
        .min(1, { error: 'Enter your phone number.' })
        .refine((v) => nigerianPhone.test(v.replace(/[\s\-()]/g, '')), {
          error: 'Enter a valid phone number, e.g. 0803 123 4567.',
        }),
      birthday_day: z.string(),
      birthday_month: z.string(),
      referral_code: z.string().trim().max(20),
      accept_terms: z
        .boolean()
        .refine((v) => v, { error: 'Please accept the Terms, Privacy Policy and Rewards Terms.' }),
    })
    .superRefine((v, ctx) => {
      if (v.birthday_day === '' && v.birthday_month === '') return;
      const day = Number(v.birthday_day);
      const month = Number(v.birthday_month);
      if (v.birthday_day === '' || v.birthday_month === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['birthday_day'],
          message: 'Choose both the day and the month, or leave both empty.',
        });
      } else if (!(month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1])) {
        ctx.addIssue({ code: 'custom', path: ['birthday_day'], message: 'That date doesn’t exist.' });
      }
    });
}

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password: strongPassword, confirm: z.string() })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm)
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Passwords don’t match.' });
  });

export const twoFactorSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: 'Enter the 6-digit code from your authenticator app.' }),
});
