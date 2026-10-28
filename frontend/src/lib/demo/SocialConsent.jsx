import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { PROVIDERS } from '@/lib/socialProviders';
import { DEMO_PEOPLE } from './services/social';

/**
 * The demo's stand-in for the Google / Apple / Facebook consent screen: clearly a simulation,
 * with no real login. Part of the demo bundle only (it is imported through `@/lib/demo`, which
 * is an empty stub in every other build).
 * @param {{ provider: 'google' | 'apple' | 'facebook', onCancel: () => void, onDone: (user: object) => void }} props
 */
export function SocialConsent({ provider, onCancel, onDone }) {
  const dialog = useRef(null);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const person = DEMO_PEOPLE[provider];
  const name = PROVIDERS.find((p) => p.id === provider)?.name ?? provider;

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);

  const continueAs = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/social/demo', { method: 'POST', body: { provider } });
      qc.setQueryData(['auth', 'me'], r.user);
      onDone(r.user);
    } catch (e) {
      setError(e.message ?? 'Something went wrong in the demo.');
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="demo-consent-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="bg-surface-raised text-primary border-accent/30 m-auto w-[min(26rem,calc(100%-2rem))] rounded-md border p-6 shadow-2xl backdrop:bg-black/70"
    >
      <p className="text-accent eyebrow">Demo · simulated sign-in</p>
      <h2 id="demo-consent-title" className="mt-3 font-serif text-3xl leading-tight">
        Demo: Continue as {person.firstName} {person.lastName} with {name}?
      </h2>
      <div className="border-line bg-surface-inset mt-5 flex items-center gap-3 rounded-md border p-3">
        <span
          className="border-accent text-accent grid size-11 shrink-0 place-items-center rounded-full border font-serif text-lg"
          aria-hidden="true"
        >
          {person.firstName[0]}
          {person.lastName[0]}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">
            {person.firstName} {person.lastName}
          </p>
          <p className="text-secondary text-sm break-all">{person.email}</p>
        </div>
      </div>
      <p className="text-secondary mt-4 text-sm leading-relaxed">
        This is a simulation: no real {name} account is used and nothing leaves your browser. On the live
        site, {name} would ask for your permission here.
      </p>
      {error && (
        <p className="text-danger mt-3 text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button onClick={continueAs} loading={busy}>
          Continue
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </dialog>
  );
}
