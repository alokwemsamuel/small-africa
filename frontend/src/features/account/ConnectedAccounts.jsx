import { useQueryClient } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProviderIcon } from '@/components/auth/ProviderIcon';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useDisconnectIdentity, useIdentities } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { DemoConsent } from '@/lib/demoConsent';
import { redirectTo } from '@/lib/redirect';
import { oauthStartUrl, PROVIDERS } from '@/lib/socialProviders';
import { socialErrorMessage } from '@/lib/socialErrors';

/**
 * "Connected accounts" in Settings: connect or disconnect Google, Apple and Facebook. The last way
 * to sign in can't be disconnected (the server refuses): the person sets a password first.
 */
export function ConnectedAccounts() {
  const { data, isPending, isError } = useIdentities();
  const disconnect = useDisconnectIdentity();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(null);
  const [consent, setConsent] = useState(null);
  const [problem, setProblem] = useState(null);

  if (isPending) {
    return (
      <div className="text-accent py-6">
        <Spinner label="Loading connected accounts" />
      </div>
    );
  }
  // An older server, or nothing to connect: leave the section out rather than show an empty box.
  if (isError || !data) return null;

  const connected = new Map(data.identities.map((i) => [i.provider, i]));
  const rows = PROVIDERS.filter((p) => data.available.includes(p.id) || connected.has(p.id));
  if (rows.length === 0) return null;

  const justConnected = PROVIDERS.find((p) => p.id === params.get('connected'));
  const urlError = socialErrorMessage(params.get('error'));

  const connect = (id) => {
    setProblem(null);
    if (DemoConsent) {
      setConsent(id);
      return;
    }
    setBusy(id);
    redirectTo(oauthStartUrl(id, { mode: 'link' }));
  };

  const remove = async (id) => {
    setProblem(null);
    setBusy(id);
    try {
      await disconnect.mutateAsync(id);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'We couldn’t disconnect that. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-labelledby="connected-h"
      className="border-accent/15 bg-surface-raised mt-12 rounded-md border p-6 sm:p-8"
    >
      <h2 id="connected-h" className="text-3xl">
        Connected accounts
      </h2>
      <p className="text-muted mt-2 text-sm">
        Sign in faster with Google, Apple or Facebook. Connect or disconnect them whenever you like.
      </p>
      {justConnected && (
        <Alert tone="success" className="mt-5">
          {justConnected.name} is now connected.
        </Alert>
      )}
      {(urlError || problem) && (
        <Alert tone="error" className="mt-5">
          {problem ?? urlError}
        </Alert>
      )}
      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((p) => {
          const identity = connected.get(p.id);
          return (
            <li
              key={p.id}
              className="border-line bg-surface-inset flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-md border p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black">
                  <ProviderIcon provider={p.id} className="size-5 text-black" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-secondary text-sm break-all">
                    {identity ? `Connected${identity.email ? ` · ${identity.email}` : ''}` : 'Not connected'}
                  </p>
                </div>
              </div>
              {identity ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === p.id}
                  onClick={() => remove(p.id)}
                  aria-label={`Disconnect ${p.name}`}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  loading={busy === p.id}
                  onClick={() => connect(p.id)}
                  aria-label={`Connect ${p.name}`}
                >
                  Connect
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {!data.hasPassword && (
        <p className="text-muted mt-5 text-sm">
          You don’t have a password yet. Add one in the Password section above to be able to disconnect your
          last connected account.
        </p>
      )}
      {consent && DemoConsent && (
        <Suspense fallback={null}>
          <DemoConsent
            provider={consent}
            mode="connect"
            onCancel={() => setConsent(null)}
            onDone={() => {
              setConsent(null);
              qc.invalidateQueries({ queryKey: ['account', 'identities'] });
            }}
          />
        </Suspense>
      )}
    </section>
  );
}
