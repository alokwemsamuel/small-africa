import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/toast';
import { useMe } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { useLoyalty, useLoyaltyHistory, useRedeem } from '@/hooks/useInterestAccount';
import { MembershipCard } from '@/components/rewards/MembershipCard';
import { TopUp } from './TopUp';

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const longDate = (iso) =>
  new Date(iso.replace(' ', 'T')).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
const shortDate = (iso) =>
  new Date(iso.replace(' ', 'T')).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const pct = (bp) => `${bp / 100}%`;

export function InterestAccountPanel() {
  const { data: user } = useMe();
  const { data: account, error } = useLoyalty();
  if (error)
    return (
      <Alert tone="error">{error instanceof Error ? error.message : 'Could not load your account.'}</Alert>
    );
  if (!account || !user) return <Spinner label="Loading your Interest Account" />;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <MembershipCard account={account} />
        <TierProgress account={account} />
      </div>

      {account.offers.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Your offers">
          {account.offers.map((o) => (
            <li key={o.id} className="border-accent/50 bg-accent-fill/10 rounded-md border p-5">
              <p className="font-serif text-xl">{o.headline}</p>
              <p className="text-secondary mt-1 text-sm">{o.message}</p>
              {o.couponCode && (
                <p className="mt-3 text-sm">
                  Code <CopyCode code={o.couponCode} />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Card title="Dining wallet" id="wallet">
          <p className="font-serif text-4xl">{formatNaira(account.wallet.balanceKobo)}</p>
          <Interest account={account} />
          <TopUp account={account} email={user.email} verified={user.emailVerified} />
        </Card>

        <Card title="Points" id="points">
          <p className="font-serif text-4xl">
            {account.points.balance.toLocaleString('en-NG')}{' '}
            <span className="text-secondary font-sans text-base">
              worth {formatNaira(account.points.valueKobo)}
            </span>
          </p>
          <ul className="text-secondary flex list-disc flex-col gap-1 pl-5 text-sm">
            <li>
              {account.points.earnPer1000Naira} points per ₦1,000 on completed orders, ×{' '}
              {account.tier.multiplier} as {account.tier.name}.
            </li>
            {account.points.doublePointsWeekdays.length > 0 && (
              <li>
                Double points on {account.points.doublePointsWeekdays.map((d) => WEEKDAYS[d]).join(' and ')}{' '}
                and on featured dishes.
              </li>
            )}
            {account.member.birthdayWeek && (
              <li className="text-accent font-semibold">It’s your birthday week: double points!</li>
            )}
            <li>Boosts don’t stack: each item earns at the single highest multiplier that applies.</li>
            {account.points.expiresAt && (
              <li>
                Points expire on {longDate(account.points.expiresAt)} unless you order or visit before then.
              </li>
            )}
          </ul>
          <RewardsMenu account={account} />
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card title="Stamp card" id="stamps">
          <StampCard account={account} />
          <Streak account={account} />
        </Card>
        <Card title="Invite friends" id="referral">
          <Referral account={account} />
        </Card>
      </div>

      {account.vouchers.length > 0 && (
        <Card title="Your vouchers" id="vouchers">
          <ul className="grid gap-3 sm:grid-cols-2">
            {account.vouchers.map((v) => (
              <li
                key={v.code}
                className="border-line flex flex-col gap-1 rounded-md border border-dashed p-4"
              >
                <p className="font-semibold">{v.title}</p>
                <p className="text-sm">
                  <CopyCode code={v.code} />
                </p>
                <p className="text-muted text-xs">
                  {v.dineInOnly ? 'Show this code to your server.' : 'Choose it at checkout.'} Valid until{' '}
                  {longDate(v.expiresAt)}.
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <History />

      <p className="text-muted text-sm">
        The wallet holds dining credit only: it isn’t a bank account, can’t be withdrawn or transferred, and
        is spent only at Small Africa. See the{' '}
        <Link to="/rewards-terms" className="text-accent underline">
          Rewards Terms
        </Link>
        .
      </p>
    </div>
  );
}

function Card({ title, id, children }) {
  return (
    <section
      aria-labelledby={`ia-${id}`}
      className="border-line bg-surface-raised flex flex-col gap-5 rounded-md border p-6 sm:p-8"
    >
      <h2 id={`ia-${id}`} className="text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TierProgress({ account }) {
  const next = account.tier.next;
  return (
    <section
      aria-labelledby="ia-tier"
      className="border-line bg-surface-raised flex flex-col gap-5 rounded-md border p-6 sm:p-8"
    >
      <div>
        <p className="eyebrow text-accent">Your tier</p>
        <h2 id="ia-tier" className="mt-1 text-3xl">
          {account.tier.name}
        </h2>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Your perks">
        {account.tier.perks.map((p) => (
          <li key={p} className="border-accent/40 text-primary rounded-full border px-3 py-1 text-sm">
            {p}
          </li>
        ))}
      </ul>
      {next ? (
        <div>
          <div
            role="progressbar"
            aria-label={`Progress to ${next.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(next.progress * 100)}
            className="bg-surface-inset h-3 overflow-hidden rounded-full"
          >
            <div
              className="bg-accent-fill h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.max(2, next.progress * 100)}%` }}
            />
          </div>
          <p className="mt-3 text-sm">
            <strong>{formatNaira(next.remainingKobo)}</strong> more to reach {next.name}.
          </p>
        </div>
      ) : (
        <p className="text-sm">You’re at our highest tier. Thank you for being part of the table.</p>
      )}
      <p className="text-muted text-xs">
        Tiers follow what you spent with us in the last 12 months ({formatNaira(account.tier.spend12mKobo)}).
      </p>
    </section>
  );
}

function Interest({ account }) {
  const i = account.wallet.interest;
  const eligible = i.lowestThisMonthKobo >= i.minBalanceKobo;
  return (
    <div className="bg-surface-inset flex flex-col gap-2 rounded-md p-4 text-sm">
      <p>
        Keep <strong>{formatNaira(i.minBalanceKobo)}</strong> or more in your wallet for a whole month and
        earn <strong>{pct(i.rateBp)}</strong> interest as dining credit (up to {formatNaira(i.capKobo)} a
        month), paid on the 1st.
      </p>
      <p className={eligible ? 'text-success' : 'text-secondary'}>
        {eligible
          ? `On track: about ${formatNaira(i.projectedKobo)} this month if your balance stays at ${formatNaira(i.lowestThisMonthKobo)} or more.`
          : `Your lowest balance this month is ${formatNaira(i.lowestThisMonthKobo)}, so no interest this month. Keep ${formatNaira(i.minBalanceKobo)}+ all next month to qualify.`}
      </p>
      {i.last && (
        <p className="text-muted">
          Last interest: {formatNaira(i.last.amountKobo)} on {longDate(i.last.at)}.
        </p>
      )}
    </div>
  );
}

function RewardsMenu({ account }) {
  const redeem = useRedeem();
  const [confirming, setConfirming] = useState(null);
  const [error, setError] = useState(null);

  const go = async (r) => {
    setError(null);
    try {
      const res = await redeem.mutateAsync(r.slug);
      toast(
        res.result.voucher
          ? `${r.name}: your code is ${res.result.voucher.code}`
          : `${r.name} added to your wallet`,
      );
      setConfirming(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Please try again.');
    }
  };

  return (
    <div>
      <h3 className="eyebrow text-muted">Rewards menu</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {account.rewards.map((r) => (
          <li key={r.slug} className="border-line flex flex-wrap items-center gap-3 rounded-md border p-4">
            <div className="mr-auto min-w-0">
              <p className="font-semibold">{r.name}</p>
              <p className="text-secondary text-sm">{r.description}</p>
            </div>
            <span className="text-accent text-sm font-semibold">
              {r.pointsCost.toLocaleString('en-NG')} pts
            </span>
            {confirming === r.slug ? (
              <span className="flex gap-2">
                <Button size="sm" loading={redeem.isPending} onClick={() => go(r)}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={!r.affordable}
                onClick={() => setConfirming(r.slug)}
                aria-label={`Redeem ${r.name} for ${r.pointsCost} points`}
              >
                Redeem
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </div>
  );
}

function StampCard({ account }) {
  const { stamps, size, rewards, next } = account.stampCard;
  return (
    <div>
      <ol className="grid max-w-sm grid-cols-5 gap-3" aria-label={`${stamps} of ${size} stamps`}>
        {Array.from({ length: size }, (_, i) => {
          const n = i + 1;
          const reward = rewards.find((r) => r.stamp === n);
          const filled = n <= stamps;
          return (
            <li
              key={n}
              className={cn(
                'grid aspect-square place-items-center rounded-full border-2 text-xs font-semibold',
                filled ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-line text-muted',
                reward && !filled && 'border-accent text-accent border-dashed',
              )}
            >
              <span aria-hidden="true">{filled ? '✓' : reward ? '★' : n}</span>
              <span className="sr-only">
                Stamp {n}
                {filled ? ', collected' : ''}
                {reward ? `: ${reward.reward}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm">
        {next
          ? `${next.remaining} more ${next.remaining === 1 ? 'visit or order' : 'visits or orders'} for a ${next.reward.toLowerCase()}.`
          : 'Card complete!'}{' '}
        <span className="text-muted">
          {rewards.map((r) => `${r.stamp}th: ${r.reward.toLowerCase()}`).join(' · ')}
        </span>
      </p>
    </div>
  );
}

function Streak({ account }) {
  const { count, target, bonusPoints } = account.streak;
  const left = Math.max(0, target - count);
  return (
    <div className="bg-surface-inset rounded-md p-4 text-sm">
      <p className="font-semibold">
        Monthly streak: {Math.min(count, target)} of {target}
      </p>
      <p className="text-secondary">
        {left === 0
          ? `Streak complete: +${bonusPoints} points earned this month.`
          : `${left} more ${left === 1 ? 'visit' : 'visits'} this month for +${bonusPoints} bonus points.`}
      </p>
    </div>
  );
}

function Referral({ account }) {
  const { code, link, creditKobo, rewarded, pending } = account.referral;
  if (!code || !link) return <p className="text-secondary">Your referral code will appear here.</p>;
  const message = `Join me at Small Africa: Nigerian, Polish and Continental cooking in Lagos. Sign up with my code ${code} and we both get ${formatNaira(creditKobo)} dining credit after your first order: ${link}`;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-secondary">
        Share your code. When a friend completes their first order, you both get{' '}
        <strong className="text-primary">{formatNaira(creditKobo)}</strong> of dining credit.
      </p>
      <p className="text-lg">
        Your code: <CopyCode code={code} />
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(link).then(
              () => toast('Invitation link copied'),
              () => toast(link),
            )
          }
        >
          Copy link
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-accent text-accent hover:bg-accent-fill/10 tracking-button inline-flex min-h-9 items-center rounded-full border px-4 text-xs font-semibold uppercase"
        >
          Share on WhatsApp
        </a>
      </div>
      <p className="text-muted text-sm">
        {rewarded} {rewarded === 1 ? 'friend has' : 'friends have'} joined and dined
        {pending > 0 && `, ${pending} waiting for a first order`}. One reward per new, verified guest.
      </p>
    </div>
  );
}

function CopyCode({ code }) {
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(code).then(
          () => toast(`${code} copied`),
          () => undefined,
        )
      }
      className="text-accent font-mono font-semibold tracking-wider underline decoration-dotted underline-offset-4"
      aria-label={`${code}, copy to clipboard`}
    >
      {code}
    </button>
  );
}

function History() {
  const [kind, setKind] = useState('wallet');
  const [pages, setPages] = useState([null]);
  return (
    <section
      aria-labelledby="ia-history"
      className="border-line bg-surface-raised rounded-md border p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="ia-history" className="text-3xl">
          Statement
        </h2>
        <div role="group" aria-label="Statement type" className="border-line flex rounded-full border p-1">
          {['wallet', 'points'].map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setPages([null]);
              }}
              className={cn(
                'tracking-button min-h-9 rounded-full px-4 text-xs font-semibold uppercase',
                kind === k ? 'bg-accent-fill text-on-accent' : 'text-secondary',
              )}
            >
              {k === 'wallet' ? 'Dining credit' : 'Points'}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted eyebrow">
            <tr className="border-line border-b">
              <th scope="col" className="py-2 pr-4 font-normal">
                Date
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Details
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                Amount
              </th>
              <th scope="col" className="hidden py-2 text-right font-normal sm:table-cell">
                Balance
              </th>
            </tr>
          </thead>
          {pages.map((before, i) => (
            <HistoryPage
              key={`${kind}-${before ?? 'first'}`}
              kind={kind}
              before={before}
              onMore={i === pages.length - 1 ? (next) => setPages((p) => [...p, next]) : undefined}
            />
          ))}
        </table>
      </div>
    </section>
  );
}

function HistoryPage({ kind, before, onMore }) {
  const { data } = useLoyaltyHistory(kind, before);
  const fmt = (n) => (kind === 'wallet' ? formatNaira(n) : n.toLocaleString('en-NG'));
  if (!data) {
    return (
      <tbody>
        <tr>
          <td colSpan={4} className="py-4">
            <Spinner label="Loading statement" />
          </td>
        </tr>
      </tbody>
    );
  }
  return (
    <tbody>
      {data.entries.length === 0 && before === null && (
        <tr>
          <td colSpan={4} className="text-secondary py-4">
            Nothing here yet.
          </td>
        </tr>
      )}
      {data.entries.map((e) => (
        <tr key={e.id} className="border-line border-b">
          <td className="text-secondary py-3 pr-4 whitespace-nowrap">{shortDate(e.at)}</td>
          <td className="py-3 pr-4">{e.description}</td>
          <td
            className={cn(
              'py-3 pr-4 text-right whitespace-nowrap',
              e.direction === 'credit' ? 'text-success' : 'text-primary',
            )}
          >
            {e.direction === 'credit' ? '+' : '−'}
            {fmt(e.amount)}
          </td>
          <td className="hidden py-3 text-right whitespace-nowrap sm:table-cell">{fmt(e.balanceAfter)}</td>
        </tr>
      ))}
      {onMore && data.nextBefore && (
        <tr>
          <td colSpan={4} className="pt-4">
            <Button size="sm" variant="ghost" onClick={() => onMore(data.nextBefore)}>
              Show older entries
            </Button>
          </td>
        </tr>
      )}
    </tbody>
  );
}
