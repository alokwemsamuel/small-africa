import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { usePaymentPopup } from '@/hooks/usePaymentPopup';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { bonusFor, loyaltyApi, loyaltyKey } from '@/hooks/useInterestAccount';

/** Wallet top-up: presets or a custom amount, bonus preview, then Paystack (or the demo popup). */
export function TopUp({ account, email, verified }) {
  const qc = useQueryClient();
  const { topup } = account.wallet;
  const [amount, setAmount] = useState(topup.presetsKobo[2] ?? topup.presetsKobo[0] ?? 0);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [params, setParams] = useSearchParams();
  const payment = usePaymentPopup();
  const idem = useRef(null);

  const kobo = custom ? Math.round(Number(custom.replace(/[^\d]/g, '')) * 100) : amount;
  const valid = kobo >= topup.minKobo && kobo <= topup.maxKobo;
  const bonus = valid ? bonusFor(kobo, topup.bonusBands) : 0;
  const nextBand = [...topup.bonusBands].sort((a, b) => a.minKobo - b.minKobo).find((b) => b.minKobo > kobo);

  const finish = (t) => {
    void qc.invalidateQueries({ queryKey: loyaltyKey });
    void qc.invalidateQueries({ queryKey: ['account', 'notifications'] });
    if (t.status === 'paid') {
      toast(`${formatNaira(t.amountKobo + t.bonusKobo)} added to your wallet`);
      idem.current = null;
      setCustom('');
    } else {
      setError(
        t.status === 'failed'
          ? 'Your payment was declined. No money was taken.'
          : 'The top-up wasn’t completed. Nothing was charged.',
      );
    }
  };

  // Back from Paystack's redirect page (when the popup couldn't open): confirm with the server.
  useEffect(() => {
    const ref = params.get('topup');
    if (!ref || !/^TU-[A-Z0-9]{6}$/.test(ref)) return;
    setParams(
      (p) => {
        p.delete('topup');
        return p;
      },
      { replace: true },
    );
    loyaltyApi.verifyTopup(ref).then(finish, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError(null);
    if (!valid) {
      setError(`Choose an amount between ${formatNaira(topup.minKobo)} and ${formatNaira(topup.maxKobo)}.`);
      return;
    }
    if (idem.current?.amount !== kobo) idem.current = { amount: kobo, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const started = await loyaltyApi.startTopup(kobo / 100, idem.current.key);
      if (!started.payment) {
        finish(started.topup);
        return;
      }
      const result = await payment.open(started.payment, {
        amountKobo: started.topup.amountKobo,
        email,
        reference: started.topup.reference,
      });
      finish(
        result.kind === 'simulated'
          ? await loyaltyApi.simulateTopup(started.topup.reference, result.outcome)
          : await loyaltyApi.verifyTopup(started.topup.reference),
      );
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!verified) {
    return <Alert tone="info">Confirm your email address to start topping up your dining wallet.</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Top-up amount" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {topup.presetsKobo.map((p) => {
          const selected = !custom && amount === p;
          const b = bonusFor(p, topup.bonusBands);
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setAmount(p);
                setCustom('');
              }}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center rounded-md border px-2 py-2 transition-colors',
                selected ? 'border-accent bg-accent-fill/10' : 'border-line hover:border-accent',
              )}
            >
              <span className="font-semibold">{formatNaira(p)}</span>
              {b > 0 && <span className="text-success text-xs">+{formatNaira(b)} bonus</span>}
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-2">
        <span className="eyebrow text-muted">Or another amount (₦)</span>
        <input
          inputMode="numeric"
          value={custom}
          onChange={(ev) => setCustom(ev.target.value.replace(/[^\d]/g, '').slice(0, 7))}
          placeholder={`${(topup.minKobo / 100).toLocaleString('en-NG')} to ${(topup.maxKobo / 100).toLocaleString('en-NG')}`}
          className="border-input bg-surface-inset text-primary focus:border-accent min-h-12 rounded-sm border px-4 focus:outline-none"
        />
      </label>
      <p className="text-secondary text-sm" aria-live="polite">
        {valid ? (
          <>
            You’ll get <strong className="text-primary">{formatNaira(kobo + bonus)}</strong> of dining credit
            {bonus > 0 && <> (including a {formatNaira(bonus)} bonus)</>}.
            {nextBand && (
              <>
                {' '}
                Top up {formatNaira(nextBand.minKobo)} or more for a {nextBand.bonusBp / 100}% bonus.
              </>
            )}
          </>
        ) : (
          `Top-ups are between ${formatNaira(topup.minKobo)} and ${formatNaira(topup.maxKobo)}.`
        )}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <Button onClick={start} loading={busy} disabled={!valid} className="self-start">
        Top up {valid ? formatNaira(kobo) : ''}
      </Button>
      <p className="text-muted text-xs">
        Dining credit can only be spent at Small Africa. It isn’t cash and can’t be withdrawn or transferred.
      </p>
      {payment.popup}
    </div>
  );
}
