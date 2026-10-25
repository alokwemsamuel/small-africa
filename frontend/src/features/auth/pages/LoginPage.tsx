import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { env } from '@/lib/env';
import { applyServerErrors } from '@/lib/forms';
import { useLogin, useTwoFactorLogin } from '../hooks';
import { loginSchema, twoFactorSchema, type LoginValues, type TwoFactorValues } from '../schemas';
import { isStaff, type User } from '../types';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin', email: 'admin@smallafrica.demo', password: 'SmallAfrica@Admin2026' },
  { role: 'Manager', email: 'manager@smallafrica.demo', password: 'SmallAfrica@Manager2026' },
  { role: 'Customer', email: 'guest@smallafrica.demo', password: 'SmallAfrica@Guest2026' },
];

/** Only same-site paths are followed after sign-in (prevents open redirects). */
function safeRedirect(from: unknown): string | null {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/\\')
    ? from
    : null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [twoFactor, setTwoFactor] = useState(false);

  const done = (user: User) => {
    const from = safeRedirect((location.state as { from?: unknown } | null)?.from);
    navigate(from ?? (isStaff(user) ? '/admin' : '/account'), { replace: true });
  };

  return (
    <AuthLayout
      eyebrow={twoFactor ? 'Two-step verification' : 'Welcome back'}
      title={twoFactor ? 'Enter your code' : 'Sign in'}
      intro={
        twoFactor ? (
          'Open your authenticator app and enter the 6-digit code for Small Africa.'
        ) : (
          <>
            New here?{' '}
            <Link to="/register" className="text-gold underline-offset-4 hover:underline">
              Create an account
            </Link>{' '}
            and start earning dining credit.
          </>
        )
      }
    >
      {twoFactor ? (
        <TwoFactorForm onDone={done} />
      ) : (
        <PasswordForm onTwoFactor={() => setTwoFactor(true)} onDone={done} />
      )}
      {env.demoMode && !twoFactor && <DemoCredentials />}
    </AuthLayout>
  );
}

function PasswordForm({ onDone, onTwoFactor }: { onDone: (u: User) => void; onTwoFactor: () => void }) {
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, setValue, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const r = await login.mutateAsync(values);
      if (r.twoFactorRequired) onTwoFactor();
      else if (r.user) onDone(r.user);
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['email', 'password']));
      setValue('password', '');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={formState.errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        revealable
        error={formState.errors.password?.message}
        {...register('password')}
      />
      <div className="-mt-2 text-right">
        <Link to="/forgot-password" className="text-gold text-sm underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" size="lg" loading={formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

function TwoFactorForm({ onDone }: { onDone: (u: User) => void }) {
  const verify = useTwoFactorLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, setFocus, formState } = useForm<TwoFactorValues>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: { code: '' },
  });
  // Move focus to the code field when this step appears (announced via the new heading).
  useEffect(() => setFocus('code'), [setFocus]);

  const onSubmit = handleSubmit(async ({ code }) => {
    setFormError(null);
    try {
      onDone((await verify.mutateAsync(code)).user);
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['code']));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]"
        error={formState.errors.code?.message}
        {...register('code')}
      />
      <Button type="submit" size="lg" loading={formState.isSubmitting}>
        Verify and sign in
      </Button>
    </form>
  );
}

function DemoCredentials() {
  return (
    <details className="border-gold/30 bg-ebony/60 mt-10 rounded-sm border p-4 text-sm open:pb-5">
      <summary className="text-gold cursor-pointer font-semibold">Demo credentials</summary>
      <ul className="mt-4 flex flex-col gap-3">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.email} className="grid gap-0.5">
            <span className="text-smoke eyebrow">{a.role}</span>
            <span className="text-ivory font-mono text-xs">{a.email}</span>
            <span className="text-sand font-mono text-xs">{a.password}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
