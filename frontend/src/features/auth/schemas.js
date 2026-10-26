import { z } from 'zod';

/** Mirrors backend PasswordPolicy so users get instant feedback; the server still decides. */
export const PASSWORD_MIN = 10;

export function passwordProblems(password: string, personal: string[] = []): string[] {
  const problems: string[] = [];
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
export function passwordScore(password: string): number {
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
export type LoginValues = z.infer<typeof loginSchema>;

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
export type RegisterValues = z.input<typeof registerSchema>;

export const forgotSchema = z.object({ email });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const resetSchema = z
  .object({ password: strongPassword, confirm: z.string() })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm)
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Passwords don’t match.' });
  });
export type ResetValues = z.infer<typeof resetSchema>;

export const twoFactorSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: 'Enter the 6-digit code from your authenticator app.' }),
});
export type TwoFactorValues = z.infer<typeof twoFactorSchema>;
