import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import { useMe, useVerifyEmail } from '@/hooks/useAuth';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useVerifyEmail();
  const { data: user } = useMe();
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode mounts twice in development; the token is single-use, so submit once.
    if (token && !started.current) {
      started.current = true;
      verify.mutate(token);
    }
  }, [token, verify]);

  return (
    <AuthLayout eyebrow="Account" title="Confirm your email">
      {!token && (
        <Alert tone="error">This link is incomplete. Please use the full link from your email.</Alert>
      )}
      {verify.isPending && (
        <div className="text-accent flex items-center gap-3">
          <Spinner label="" /> Confirming…
        </div>
      )}
      {verify.isSuccess && (
        <div className="flex flex-col gap-6">
          <Alert tone="success" title="Email confirmed">
            Thank you. Your account and Interest Account are fully active.
          </Alert>
          <ButtonLink to={user ? '/account' : '/login'} size="lg">
            {user ? 'Go to my account' : 'Sign in'}
          </ButtonLink>
        </div>
      )}
      {verify.isError && (
        <div className="flex flex-col gap-6">
          <Alert tone="error">
            {verify.error instanceof ApiError
              ? verify.error.message
              : 'We couldn’t confirm your email. Please try again.'}
          </Alert>
          <ButtonLink to={user ? '/account' : '/login'} variant="secondary">
            {user ? 'Resend from my account' : 'Sign in to resend'}
          </ButtonLink>
        </div>
      )}
    </AuthLayout>
  );
}
