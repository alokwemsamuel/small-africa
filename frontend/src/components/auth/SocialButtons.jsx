import { Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { useAuthProviders } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { DemoConsent } from '@/lib/demoConsent';
import { redirectTo } from '@/lib/redirect';
import { oauthStartUrl, PROVIDERS } from '@/lib/socialProviders';
import { ProviderIcon } from './ProviderIcon';

// Each provider's button follows its own brand guidelines. Apple's is white with a black logo on
// the dark theme and black with a white logo on the light one (tokens in styles/theme.css).
const LOOK = {
  google: 'border border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f2f2f2]',
  apple:
    'border border-[var(--sa-apple-border)] bg-[var(--sa-apple-bg)] text-[var(--sa-apple-fg)] hover:opacity-90',
  facebook: 'border border-[#1877F2] bg-[#1877F2] text-white hover:bg-[#166fe0]',
};

/**
 * "Continue with Google / Apple / Facebook", for the sign-up and sign-in pages. Only the providers
 * the server has keys for are shown (so there is never a button that can't work), and nothing is
 * drawn until that is known.
 * @param {object} props
 * @param {'sign-up' | 'sign-in'} props.mode
 * @param {string} [props.referralCode] carried through to the welcome step
 * @param {string} [props.returnTo] where to go afterwards (a path on this site)
 */
export function SocialButtons({ mode, referralCode, returnTo }) {
  const { data: enabled } = useAuthProviders();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [consent, setConsent] = useState(null);
  const providers = PROVIDERS.filter((p) => enabled?.includes(p.id));
  if (providers.length === 0) return null;

  const start = (id) => {
    if (DemoConsent) {
      setConsent(id);
      return;
    }
    setBusy(id);
    redirectTo(oauthStartUrl(id, { mode, returnTo, referralCode }));
  };

  const demoDone = (user) => {
    setConsent(null);
    const ref = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : '';
    navigate(user.welcome ? `/welcome${ref}` : (returnTo ?? '/account'), { replace: true });
  };

  return (
    <div className="flex flex-col gap-6">
      {consent && DemoConsent && (
        <Suspense fallback={null}>
          <DemoConsent provider={consent} onCancel={() => setConsent(null)} onDone={demoDone} />
        </Suspense>
      )}
      <div className="flex flex-col gap-3" role="group" aria-label="Continue with a social account">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => start(p.id)}
            disabled={busy !== null}
            aria-busy={busy === p.id || undefined}
            className={cn(
              'inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full px-5 font-sans text-sm font-semibold transition duration-300 select-none disabled:cursor-not-allowed disabled:opacity-70',
              LOOK[p.id],
            )}
          >
            {busy === p.id ? (
              <Spinner className="size-5" label={`Opening ${p.name}`} />
            ) : (
              <ProviderIcon provider={p.id} />
            )}
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <div className="text-muted flex items-center gap-4 text-sm" role="separator">
        <span className="bg-line h-px flex-1" aria-hidden="true" />
        <span>{mode === 'sign-up' ? 'or sign up with email' : 'or sign in with email'}</span>
        <span className="bg-line h-px flex-1" aria-hidden="true" />
      </div>
    </div>
  );
}
