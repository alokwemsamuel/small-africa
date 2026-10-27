import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { MembershipCard } from '@/components/rewards/MembershipCard';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { adminApi, can, useAdminMe } from '../api';
import { AdminHeader, Empty, InputField, Loading, Panel, SelectField, StatusPill } from '../ui';
import { fmt, tdClass, thClass } from '../format';

export function CustomerPage() {
  const id = Number(useParams().id);
  const { data: me } = useAdminMe();
  const { data, error } = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: ({ signal }) => adminApi.customer(id, signal),
  });
  if (!data) return <Loading error={error} />;
  const c = data.customer;
  const l = data.loyalty;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/customers" className="text-accent self-start text-sm underline">
        ← All customers
      </Link>
      <AdminHeader
        title={c.name}
        intro={
          <>
            {c.email}
            {c.phone && ` · ${c.phone}`} · joined {fmt.date(c.joinedAt)}
            {!c.emailVerified && ' · email not confirmed'}
            {c.marketingOptIn ? ' · receives offers' : ' · no marketing emails'}
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[24rem_1fr]">
        <MembershipCard account={l} />
        <Panel title="Interest Account">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Stat
              label="Tier"
              value={l.tier.name}
              detail={
                l.tier.next ? `${formatNaira(l.tier.next.remainingKobo)} to ${l.tier.next.name}` : 'Top tier'
              }
            />
            <Stat label="12-month spend" value={formatNaira(l.tier.spend12mKobo)} />
            <Stat
              label="Dining credit"
              value={formatNaira(l.wallet.balanceKobo)}
              detail={`Interest this month: about ${formatNaira(l.wallet.interest.projectedKobo)}`}
            />
            <Stat
              label="Points"
              value={fmt.number(l.points.balance)}
              detail={l.points.expiresAt ? `Expire ${fmt.date(l.points.expiresAt)}` : undefined}
            />
            <Stat
              label="Stamps"
              value={`${l.stampCard.stamps} of ${l.stampCard.size}`}
              detail={`${l.stampCard.lifetime} visits in total`}
            />
            <Stat
              label="Referrals"
              value={`${l.referral.rewarded}`}
              detail={`Code ${l.referral.code ?? '—'}`}
            />
          </dl>
          {l.vouchers.length > 0 && (
            <p className="text-secondary mt-4 text-sm">
              Vouchers: {l.vouchers.map((v) => `${v.title} (${v.code})`).join(', ')}
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {can(me, 'customers.visits') && <RecordVisit id={id} />}
        {data.canAdjust && <Adjust id={id} />}
      </div>

      <Statement id={id} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent orders">
          {data.orders.length === 0 ? (
            <Empty>No orders yet.</Empty>
          ) : (
            <ul className="flex flex-col text-sm">
              {data.orders.map((o) => (
                <li
                  key={o.reference}
                  className="border-line flex flex-wrap items-center gap-3 border-t py-2 first:border-t-0"
                >
                  <Link
                    to={`/admin/orders/${o.reference}`}
                    className="hover:text-accent font-mono font-semibold"
                  >
                    {o.reference}
                  </Link>
                  <StatusPill status={o.status} />
                  <span className="text-muted">{fmt.date(o.placedAt)}</span>
                  <span className="ml-auto tabular-nums">{formatNaira(o.totalKobo)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Visits and reservations">
          {data.visits.length === 0 && data.reservations.length === 0 ? (
            <Empty>No visits recorded yet.</Empty>
          ) : (
            <ul className="flex flex-col text-sm">
              {data.visits.map((v) => (
                <li
                  key={v.reference}
                  className="border-line flex flex-wrap gap-3 border-t py-2 first:border-t-0"
                >
                  <span className="font-semibold">Dine-in</span>
                  <span className="text-muted">{fmt.dateTime(v.at)}</span>
                  <span className="ml-auto tabular-nums">
                    {formatNaira(v.amountKobo)} · +{v.points} pts
                  </span>
                </li>
              ))}
              {data.reservations.map((r) => (
                <li
                  key={r.code}
                  className="border-line flex flex-wrap items-center gap-3 border-t py-2 first:border-t-0"
                >
                  <span className="font-mono">{r.code}</span>
                  <StatusPill status={r.status} />
                  <span className="text-muted">
                    {fmt.date(r.date)} {r.time} · {r.partySize} guests
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, detail }) {
  return (
    <div>
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="mt-1 font-sans text-lg font-semibold">{value}</dd>
      {detail && <dd className="text-muted text-xs">{detail}</dd>}
    </div>
  );
}

function RecordVisit({ id }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <Panel title="Record a dine-in bill">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await adminApi.recordVisit(id, Number(amount), note);
            toast(`Recorded ${r.visit.reference}: +${r.visit.points} points and a stamp`);
            setAmount('');
            setNote('');
            void qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
          } catch (err) {
            setError(
              err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Please try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-secondary text-sm">
          Food and drink on the bill, before the service charge. The guest earns points, a stamp and tier
          spend.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <InputField
            label="Bill (₦)"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            className="w-40"
          />
          <InputField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={255}
            className="min-w-48 flex-1"
            placeholder="Table 12, birthday dinner"
          />
          <Button type="submit" loading={busy} disabled={Number(amount) < 1000}>
            Record visit
          </Button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Panel>
  );
}

function Adjust({ id }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState('wallet');
  const [direction, setDirection] = useState('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(null);
  const label = `${direction === 'credit' ? 'Add' : 'Remove'} ${kind === 'wallet' ? formatNaira(Number(amount) * 100) + ' dining credit' : `${fmt.number(Number(amount))} points`}`;
  return (
    <Panel title="Manual adjustment (Super Admin)">
      <div className="flex flex-col gap-3">
        <p className="text-secondary text-sm">
          For corrections and goodwill only. A reason is required and the change is recorded in the ledger and
          audit log.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="What"
            value={kind}
            onChange={(v) => setKind(v)}
            options={[
              ['wallet', 'Dining credit (₦)'],
              ['points', 'Points'],
            ]}
            className="w-44"
          />
          <SelectField
            label="Direction"
            value={direction}
            onChange={(v) => setDirection(v)}
            options={[
              ['credit', 'Add'],
              ['debit', 'Remove'],
            ]}
            className="w-32"
          />
          <InputField
            label={kind === 'wallet' ? 'Amount (₦)' : 'Points'}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            className="w-32"
          />
        </div>
        <InputField
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="e.g. Goodwill for a late delivery"
        />
        {error && <Alert tone="error">{error}</Alert>}
        {confirm ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{label}?</span>
            <Button
              size="sm"
              variant={direction === 'debit' ? 'danger' : 'primary'}
              onClick={async () => {
                setError(null);
                try {
                  await adminApi.adjust(id, { kind, direction, amount: Number(amount), reason });
                  toast('Adjustment recorded');
                  setAmount('');
                  setReason('');
                  setConfirm(false);
                  void qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
                  void qc.invalidateQueries({ queryKey: ['admin', 'customer-history', id] });
                } catch (e) {
                  setError(
                    e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Please try again.',
                  );
                  setConfirm(false);
                }
              }}
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={!amount || reason.trim().length < 5}
            onClick={() => setConfirm(true)}
          >
            Review adjustment
          </Button>
        )}
      </div>
    </Panel>
  );
}

function Statement({ id }) {
  const [kind, setKind] = useState('wallet');
  const [before, setBefore] = useState(null);
  const { data, error } = useQuery({
    queryKey: ['admin', 'customer-history', id, kind, before],
    queryFn: ({ signal }) => adminApi.customerHistory(id, kind, before, signal),
  });
  const show = (n) => (kind === 'wallet' ? formatNaira(n) : fmt.number(n));
  return (
    <Panel
      title="Statement"
      actions={
        <div role="group" aria-label="Statement type" className="border-line flex rounded-full border p-1">
          {['wallet', 'points'].map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setBefore(null);
              }}
              className={cn(
                'min-h-8 rounded-full px-3 text-xs font-semibold',
                kind === k ? 'bg-accent-fill text-on-accent' : 'text-secondary',
              )}
            >
              {k === 'wallet' ? 'Dining credit' : 'Points'}
            </button>
          ))}
        </div>
      }
    >
      {!data ? (
        <Loading error={error} />
      ) : data.entries.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem]">
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  Date
                </th>
                <th scope="col" className={thClass}>
                  Details
                </th>
                <th scope="col" className={thClass}>
                  Type
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Amount
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className={`${tdClass} whitespace-nowrap`}>{fmt.dateTime(e.at)}</td>
                  <td className={tdClass}>{e.description}</td>
                  <td className={tdClass}>{fmt.label(e.type)}</td>
                  <td
                    className={cn(
                      tdClass,
                      'text-right tabular-nums',
                      e.direction === 'credit' && 'text-success',
                    )}
                  >
                    {e.direction === 'credit' ? '+' : '−'}
                    {show(e.amount)}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>{show(e.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {before !== null && (
          <Button size="sm" variant="ghost" onClick={() => setBefore(null)}>
            Newest
          </Button>
        )}
        {data?.nextBefore && (
          <Button size="sm" variant="ghost" onClick={() => setBefore(data.nextBefore)}>
            Older entries
          </Button>
        )}
      </div>
    </Panel>
  );
}
