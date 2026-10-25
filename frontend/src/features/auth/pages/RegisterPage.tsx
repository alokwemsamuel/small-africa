import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { TextField } from '@/components/ui/TextField';
import { applyServerErrors } from '@/lib/forms';
import { useRegister } from '../hooks';
import { registerSchema, type RegisterValues } from '../schemas';

const FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'password',
  'referral_code',
  'accept_terms',
] as const;

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const registerUser = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, watch, formState } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      password: '',
      referral_code: (params.get('ref') ?? '').toUpperCase().slice(0, 20),
      marketing_opt_in: false,
      accept_terms: false,
    },
  });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerUser.mutateAsync({
        ...values,
        phone: values.phone || null,
        referral_code: values.referral_code || null,
      });
      navigate('/account?welcome=1', { replace: true });
    } catch (e) {
      setFormError(applyServerErrors(e, setError, [...FIELDS]));
    }
  });

  return (
    <AuthLayout
      eyebrow="Join Small Africa"
      title="Create your account"
      intro={
        <>
          Your Interest Account starts at Bronze: earn points on every order, get a birthday dessert, and top
          up for bonus dining credit. Already a member?{' '}
          <Link to="/login" className="text-gold underline-offset-4 hover:underline">
            Sign in
          </Link>
          .
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            label="First name"
            autoComplete="given-name"
            error={errors.first_name?.message}
            {...register('first_name')}
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            error={errors.last_name?.message}
            {...register('last_name')}
          />
        </div>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="0803 123 4567"
          hint="For order updates and table confirmations."
          error={errors.phone?.message}
          {...register('phone')}
        />
        <div className="flex flex-col gap-3">
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            revealable
            hint="At least 10 characters, mixing upper and lower case, numbers or symbols."
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrength password={watch('password') ?? ''} />
        </div>
        <TextField
          label="Referral code (optional)"
          autoComplete="off"
          hint="Got a code from a friend? You both get ₦2,000 dining credit after your first order."
          error={errors.referral_code?.message}
          {...register('referral_code')}
        />
        <div className="flex flex-col gap-4">
          <Checkbox
            label="Send me menus, events and member offers. You can unsubscribe at any time."
            {...register('marketing_opt_in')}
          />
          <Checkbox
            label={
              <>
                I agree to the{' '}
                <Link to="/terms" className="text-gold underline">
                  Terms
                </Link>
                ,{' '}
                <Link to="/rewards-terms" className="text-gold underline">
                  Rewards Terms
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-gold underline">
                  Privacy Policy
                </Link>
                .
              </>
            }
            error={errors.accept_terms?.message}
            {...register('accept_terms')}
          />
        </div>
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
