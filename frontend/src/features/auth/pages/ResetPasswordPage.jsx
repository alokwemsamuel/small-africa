import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { TextField } from '@/components/ui/TextField';
import { applyServerErrors } from '@/lib/forms';
import { useResetPassword } from '@/hooks/useAuth';
import { resetSchema } from '@/lib/authSchemas';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState(null);
  const { register, handleSubmit, setError, watch, formState } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await reset.mutateAsync({ token, password });
      setDone(true);
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['password']));
    }
  });

  if (!token) {
    return (
      <AuthLayout eyebrow="Account help" title="Link incomplete">
        <Alert tone="error">
          This reset link is missing its token. Please use the full link from your email.
        </Alert>
        <Link to="/forgot-password" className="text-accent mt-6 inline-block text-sm underline">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Account help" title="Choose a new password">
      {done ? (
        <div className="flex flex-col gap-6">
          <Alert tone="success" title="Password changed">
            For your security, you’ve been signed out everywhere. Sign in with your new password.
          </Alert>
          <ButtonLink to="/login" size="lg">
            Sign in
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          {formError && (
            <Alert tone="error">
              {formError}{' '}
              <Link to="/forgot-password" className="underline">
                Request a new link
              </Link>
            </Alert>
          )}
          <div className="flex flex-col gap-3">
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              revealable
              error={formState.errors.password?.message}
              {...register('password')}
            />
            <PasswordStrength password={watch('password')} />
          </div>
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={formState.errors.confirm?.message}
            {...register('confirm')}
          />
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Save new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
