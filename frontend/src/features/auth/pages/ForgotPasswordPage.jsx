import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { applyServerErrors } from '@/lib/forms';
import { useForgotPassword } from '../hooks';
import { forgotSchema } from '../schemas';

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [sent, setSent] = useState(null);
  const [formError, setFormError] = useState(null);
  const { register, handleSubmit, setError, formState } = useForm({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      setSent((await forgot.mutateAsync(email)).message);
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ['email']));
    }
  });

  return (
    <AuthLayout
      eyebrow="Account help"
      title="Reset your password"
      intro="Enter the email you signed up with and we’ll send you a secure link."
    >
      {sent ? (
        <div className="flex flex-col gap-6">
          <Alert tone="success" title="Check your inbox">
            {sent} The link expires in 60 minutes.
          </Alert>
          <Link to="/login" className="text-accent text-sm underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={formState.errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Send reset link
          </Button>
          <Link to="/login" className="text-accent text-center text-sm underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
