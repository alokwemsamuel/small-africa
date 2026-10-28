import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { ProviderIcon } from '@/components/auth/ProviderIcon';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { useCompleteWelcome, useMe } from '@/hooks/useAuth';
import { welcomeSchema } from '@/lib/authSchemas';
import { deviceId } from '@/lib/device';
import { applyServerErrors } from '@/lib/forms';
import { isStaff } from '@/lib/roles';
import { useSeo } from '@/lib/seo';
import { PROVIDERS } from '@/lib/socialProviders';

const FIELDS = ['email', 'phone', 'birthday_day', 'birthday_month', 'referral_code', 'accept_terms'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const selectClass =
  'border-input bg-surface-inset text-primary focus:border-accent min-h-12 w-full min-w-0 rounded-sm border px-3 focus:outline-none';

/**
 * Shown once, after someone's first sign-up with Google, Apple or Facebook: the account exists,
 * and this asks for what the provider can't tell us (a phone number) plus the optional extras.
 */
export function WelcomePage() {
  useSeo({ title: 'Almost there' });
  const { data: user, isPending } = useMe();

  if (isPending) {
    return (
      <div className="text-accent grid min-h-[60vh] place-items-center">
        <Spinner label="Loading" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Only for people who have just signed up with a provider and haven't finished.
  if (!user.welcome) return <Navigate to={isStaff(user) ? '/admin' : '/account'} replace />;
  return <WelcomeSteps user={user} />;
}

function WelcomeSteps({ user }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const complete = useCompleteWelcome();
  const [formError, setFormError] = useState(null);
  const { provider, needsEmail } = user.welcome;
  const providerName = PROVIDERS.find((p) => p.id === provider)?.name ?? 'your account';
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  const schema = useMemo(() => welcomeSchema({ needsEmail }), [needsEmail]);
  const { register, handleSubmit, setError, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      phone: user.phone ?? '',
      birthday_day: '',
      birthday_month: '',
      referral_code: (params.get('ref') ?? '').toUpperCase().slice(0, 20),
      accept_terms: false,
    },
  });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await complete.mutateAsync({
        ...(needsEmail ? { email: v.email } : {}),
        phone: v.phone,
        birthday_day: v.birthday_day ? Number(v.birthday_day) : null,
        birthday_month: v.birthday_month ? Number(v.birthday_month) : null,
        referral_code: v.referral_code || null,
        device_id: v.referral_code ? deviceId() : null,
        accept_terms: true,
      });
      navigate('/account?welcome=1', { replace: true });
    } catch (e) {
      setFormError(applyServerErrors(e, setError, [...FIELDS]));
    }
  });

  return (
    <AuthLayout
      eyebrow="Almost there"
      title="Welcome to the table"
      intro="One last step. We need your phone number for delivery calls and reservation reminders."
    >
      <div className="border-line bg-surface-raised mb-8 flex items-center gap-4 rounded-md border p-4">
        <span
          className="border-accent text-accent grid size-14 shrink-0 place-items-center rounded-full border font-serif text-xl"
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="font-serif text-2xl leading-tight break-words">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-secondary mt-1 flex items-center gap-2 text-sm">
            <ProviderIcon provider={provider} className="size-4" />
            <span className="sr-only">Signed in with {providerName}: </span>
            <span className="min-w-0 break-all">
              {needsEmail ? `Signed in with ${providerName}` : user.email}
            </span>
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {formError && <Alert tone="error">{formError}</Alert>}
        {needsEmail && (
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            hint={`${providerName} didn’t share your email. We’ll send a link to confirm it.`}
            error={errors.email?.message}
            {...register('email')}
          />
        )}
        <TextField
          label="Phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="0803 123 4567"
          hint="A Nigerian mobile number. Used for deliveries and table reminders."
          error={errors.phone?.message}
          {...register('phone')}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-muted eyebrow mb-2">Birthday (optional)</legend>
          <div className="grid grid-cols-[1fr_1.6fr] gap-3">
            <select aria-label="Birthday: day" className={selectClass} {...register('birthday_day')}>
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
            <select aria-label="Birthday: month" className={selectClass} {...register('birthday_month')}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <p className="text-muted text-sm">Day and month only. We’ll treat you around your birthday.</p>
          {errors.birthday_day?.message && (
            <p className="text-danger text-sm" role="alert">
              {errors.birthday_day.message}
            </p>
          )}
        </fieldset>
        <TextField
          label="Referral code (optional)"
          autoComplete="off"
          hint="Got a code from a friend? You both get ₦2,000 dining credit after your first order."
          error={errors.referral_code?.message}
          {...register('referral_code')}
        />
        <Checkbox
          label={
            <>
              I agree to the{' '}
              <Link to="/terms" className="text-accent underline">
                Terms
              </Link>
              ,{' '}
              <Link to="/privacy" className="text-accent underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link to="/rewards-terms" className="text-accent underline">
                Rewards Terms
              </Link>
              .
            </>
          }
          error={errors.accept_terms?.message}
          {...register('accept_terms')}
        />
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          Finish and start earning
        </Button>
        <p className="text-muted -mt-2 text-center text-sm">
          Your Bronze membership card is ready. Points start adding up from your first order.
        </p>
      </form>
    </AuthLayout>
  );
}
