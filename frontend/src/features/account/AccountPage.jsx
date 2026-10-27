import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { TextField } from '@/components/ui/TextField';
import { useChangePassword, useMe, useResendVerification, useUpdateProfile } from '@/features/auth/hooks';
import { passwordProblems } from '@/features/auth/schemas';
import { ThemeSegmented } from '@/features/theme/ThemeSwitcher';
import { ApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { InterestAccountPanel } from '@/features/rewards/InterestAccountPanel';
import { AddressesPanel, OrdersPanel, ReservationsPanel, ReviewsPanel } from './AccountPanels';

export function AccountPage() {
  const { data: user } = useMe();
  const [params] = useSearchParams();
  if (!user) return null;

  return (
    <div className="container-luxe py-12 sm:py-16">
      <header className="border-accent/15 flex flex-col gap-6 border-b pb-10 sm:flex-row sm:items-center">
        <span
          aria-hidden="true"
          className="border-accent text-accent grid size-20 place-items-center rounded-full border font-serif text-3xl"
        >
          {initials(user.firstName, user.lastName)}
        </span>
        <div>
          <p className="text-accent eyebrow">My account</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">
            {params.get('welcome') ? 'Welcome to the table, ' : 'Hello, '}
            {user.firstName}
          </h1>
          {user.referralCode && (
            <p className="text-muted mt-2 text-sm">
              Your referral code:{' '}
              <span className="text-accent font-semibold tracking-wider">{user.referralCode}</span>
            </p>
          )}
        </div>
      </header>

      {!user.emailVerified && <VerifyBanner />}

      <AccountTabs />
    </div>
  );
}

const TABS = [
  ['rewards', 'Interest Account'],
  ['orders', 'Orders'],
  ['reservations', 'Reservations'],
  ['addresses', 'Addresses'],
  ['reviews', 'Reviews'],
  ['settings', 'Settings'],
];

function AccountTabs() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some(([t]) => t === requested) ? requested : 'rewards';
  const select = (t) =>
    setParams(
      (p) => {
        p.set('tab', t);
        p.delete('welcome');
        return p;
      },
      { replace: true },
    );
  // Roving arrow-key focus, per the WAI-ARIA tabs pattern.
  const onKey = (e, i) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const next = TABS[(i + d + TABS.length) % TABS.length][0];
    select(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Account sections"
        className="border-line mt-10 flex gap-1 overflow-x-auto border-b"
      >
        {TABS.map(([t, label], i) => (
          <button
            key={t}
            id={`tab-${t}`}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => select(t)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'tracking-button -mb-px min-h-12 shrink-0 border-b-2 px-4 text-xs font-semibold uppercase transition-colors',
              tab === t
                ? 'border-accent text-accent'
                : 'text-secondary hover:text-primary border-transparent',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="mt-8 focus:outline-none"
      >
        {tab === 'rewards' && <InterestAccountPanel />}
        {tab === 'orders' && <OrdersPanel />}
        {tab === 'reservations' && <ReservationsPanel />}
        {tab === 'addresses' && <AddressesPanel />}
        {tab === 'reviews' && <ReviewsPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </>
  );
}

function SettingsPanel() {
  const { data: user } = useMe();
  if (!user) return null;
  return (
    <>
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <section
          aria-labelledby="profile-h"
          className="border-accent/15 bg-surface-raised rounded-md border p-6 sm:p-8"
        >
          <h2 id="profile-h" className="text-3xl">
            Profile
          </h2>
          <ProfileForm user={user} />
        </section>
        <section
          aria-labelledby="password-h"
          className="border-accent/15 bg-surface-raised rounded-md border p-6 sm:p-8"
        >
          <h2 id="password-h" className="text-3xl">
            Password
          </h2>
          <PasswordForm />
        </section>
      </div>

      <section
        aria-labelledby="prefs-h"
        className="border-accent/15 bg-surface-raised mt-12 rounded-md border p-6 sm:p-8"
      >
        <h2 id="prefs-h" className="text-3xl">
          Preferences
        </h2>
        <p className="text-muted mt-2 text-sm">Saved to your account, so it follows you to every device.</p>
        <ThemeSegmented className="mt-6" />
      </section>
    </>
  );
}

function VerifyBanner() {
  const resend = useResendVerification();
  return (
    <Alert tone="info" className="mt-8" title="Please confirm your email">
      <p>
        We sent a confirmation link to your inbox. Confirming activates wallet top-ups and referral rewards.
      </p>
      {resend.isSuccess ? (
        <p className="text-accent mt-2">A new link is on its way.</p>
      ) : (
        <button
          type="button"
          className="text-accent mt-2 underline"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
        >
          {resend.isPending ? 'Sending…' : 'Resend the link'}
        </button>
      )}
      {resend.error instanceof ApiError && <p className="text-danger mt-2">{resend.error.message}</p>}
    </Alert>
  );
}

const profileSchema = z.object({
  first_name: z.string().trim().min(1, { error: 'First name is required.' }).max(80),
  last_name: z.string().trim().min(1, { error: 'Last name is required.' }).max(80),
  phone: z.string().trim(),
  birthday: z.string(),
  marketing_opt_in: z.boolean(),
});

function ProfileForm({ user }) {
  const update = useUpdateProfile();
  const [status, setStatus] = useState(null);
  const { register, handleSubmit, setError, formState } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: user.firstName,
      last_name: user.lastName,
      phone: user.phone ?? '',
      birthday: user.birthday ?? '',
      marketing_opt_in: user.marketingOptIn,
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setStatus(null);
    const body = {
      first_name: v.first_name,
      last_name: v.last_name,
      phone: v.phone || null,
      marketing_opt_in: v.marketing_opt_in,
    };
    if (!user.birthday && v.birthday) body.birthday = v.birthday;
    try {
      await update.mutateAsync(body);
      setStatus({ tone: 'success', text: 'Profile saved.' });
    } catch (e) {
      const msg = applyServerErrors(e, setError, ['first_name', 'last_name', 'phone', 'birthday']);
      if (msg) setStatus({ tone: 'error', text: msg });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-5">
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="First name"
          autoComplete="given-name"
          error={formState.errors.first_name?.message}
          {...register('first_name')}
        />
        <TextField
          label="Last name"
          autoComplete="family-name"
          error={formState.errors.last_name?.message}
          {...register('last_name')}
        />
      </div>
      <TextField label="Email" value={user.email} readOnly disabled hint="Contact us to change your email." />
      <TextField
        label="Phone"
        type="tel"
        autoComplete="tel"
        error={formState.errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Birthday"
        type="date"
        disabled={!!user.birthday}
        hint={
          user.birthday
            ? 'Set. Contact us if it needs correcting.'
            : 'Unlocks your birthday dessert and double points. Can be set once.'
        }
        error={formState.errors.birthday?.message}
        {...register('birthday')}
      />
      <label className="text-secondary flex items-center gap-3 text-sm">
        <input type="checkbox" className="accent-accent-fill size-5" {...register('marketing_opt_in')} />
        Email me menus, events and member offers
      </label>
      <Button type="submit" loading={formState.isSubmitting} className="self-start">
        Save profile
      </Button>
    </form>
  );
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, { error: 'Enter your current password.' }),
    new_password: z.string(),
  })
  .superRefine((v, ctx) => {
    const p = passwordProblems(v.new_password);
    if (p.length) ctx.addIssue({ code: 'custom', path: ['new_password'], message: p.join(' ') });
  });

function PasswordForm() {
  const change = useChangePassword();
  const [status, setStatus] = useState(null);
  const { register, handleSubmit, setError, reset, watch, formState } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '' },
  });

  const onSubmit = handleSubmit(async (v) => {
    setStatus(null);
    try {
      const r = await change.mutateAsync(v);
      setStatus({ tone: 'success', text: r.message });
      reset();
    } catch (e) {
      const msg = applyServerErrors(e, setError, ['current_password', 'new_password']);
      if (msg) setStatus({ tone: 'error', text: msg });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-5">
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        revealable
        error={formState.errors.current_password?.message}
        {...register('current_password')}
      />
      <div className="flex flex-col gap-3">
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          revealable
          error={formState.errors.new_password?.message}
          {...register('new_password')}
        />
        <PasswordStrength password={watch('new_password')} />
      </div>
      <p className="text-muted text-sm">Changing your password signs you out on every other device.</p>
      <Button type="submit" variant="secondary" loading={formState.isSubmitting} className="self-start">
        Update password
      </Button>
    </form>
  );
}
