import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { lagosNow } from '@/lib/lagosTime';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { adminApi, can, useAdminMe } from '../api';
import { BarList } from '../charts';
import {
  AdminHeader,
  CheckField,
  Empty,
  InputField,
  Loading,
  Modal,
  Pager,
  Panel,
  SearchBox,
  SelectField,
  StatTile,
  StatusPill,
} from '../ui';
import { fmt, tdClass, thClass } from '../format';

const TABS = [
  ['overview', 'Overview'],
  ['rules', 'Rules'],
  ['rewards', 'Rewards menu'],
  ['ledger', 'Ledger'],
  ['interest', 'Interest runs'],
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RewardsManagerPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find(([t]) => t === params.get('tab'))?.[0] ?? 'overview';
  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Interest Account"
        intro="The loyalty programme: health, rules, rewards and every movement of credit and points."
      />
      <div
        role="tablist"
        aria-label="Interest Account sections"
        className="border-line relative flex gap-1 overflow-x-auto border-b"
      >
        {TABS.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setParams({ tab: t }, { replace: true })}
            className={cn(
              '-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold',
              tab === t ? 'border-accent text-accent' : 'text-secondary border-transparent',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'overview' && <Overview />}
        {tab === 'rules' && <Rules />}
        {tab === 'rewards' && <RewardsMenu />}
        {tab === 'ledger' && <Ledger />}
        {tab === 'interest' && <InterestRuns />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- overview */

function Overview() {
  const { data: a, error } = useQuery({
    queryKey: ['admin', 'loyalty', 'analytics'],
    queryFn: ({ signal }) => adminApi.loyaltyAnalytics(signal),
  });
  if (!a) return <Loading error={error} />;
  const issued = a.last30d.creditIssuedKobo;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Members"
          value={fmt.number(a.members)}
          delta={{ text: `${fmt.number(a.activeMembers90d)} active in the last 90 days`, good: null }}
        />
        <StatTile
          label="Repeat-visit rate (90 days)"
          value={`${Math.round(a.repeatRate90d * 100)}%`}
          delta={{ text: 'Members with 2+ orders or visits', good: null }}
        />
        <StatTile
          label="Dining credit held"
          value={formatNaira(a.outstanding.walletKobo)}
          delta={{ text: 'Owed to members as credit', good: null }}
        />
        <StatTile
          label="Points outstanding"
          value={fmt.number(a.outstanding.points)}
          delta={{ text: 'Not yet redeemed', good: null }}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <BarList
            title="Dining credit added, last 30 days"
            items={[
              ['Top-ups', issued.topups],
              ['Top-up bonuses', issued.bonuses],
              ['Monthly interest', issued.interest],
              ['Referrals', issued.referrals],
              ['Points and rewards', issued.rewards],
            ].map(([label, v]) => ({
              label: label,
              value: v,
              display: formatNaira(v),
            }))}
          />
          <p className="text-secondary border-line mt-4 border-t pt-3 text-sm">
            Spent at Small Africa in the same period:{' '}
            <strong className="text-primary">{formatNaira(a.last30d.creditSpentKobo)}</strong>
            {issued.adjustments !== 0 && <> · manual adjustments {formatNaira(issued.adjustments)}</>}
          </p>
        </Panel>
        <Panel>
          <BarList
            title="Members by tier"
            items={a.tiers.map((t) => ({
              label: fmt.label(t.key),
              value: t.members,
              display: fmt.number(t.members),
            }))}
          />
          <p className="text-secondary border-line mt-4 border-t pt-3 text-sm">
            Points, last 30 days: {fmt.number(a.last30d.pointsIssued)} earned ·{' '}
            {fmt.number(a.last30d.pointsRedeemed)} redeemed · {fmt.number(a.last30d.pointsExpired)} expired
          </p>
        </Panel>
      </div>
      <Panel title="Top members (12-month spend)">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[36rem]">
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  Member
                </th>
                <th scope="col" className={thClass}>
                  Tier
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Spend
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Credit
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {a.topMembers.map((m) => (
                <tr key={m.id}>
                  <td className={tdClass}>
                    <Link
                      to={`/admin/customers/${m.id}`}
                      className="hover:text-accent underline-offset-4 hover:underline"
                    >
                      {m.name}
                    </Link>
                  </td>
                  <td className={tdClass}>{fmt.label(m.tier)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{formatNaira(m.spend12mKobo)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{formatNaira(m.walletKobo)}</td>
                  <td className={`${tdClass} text-right tabular-nums`}>{fmt.number(m.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------- rules */

function Rules() {
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ['admin', 'loyalty', 'settings'],
    queryFn: ({ signal }) => adminApi.loyaltySettings(signal),
  });
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading error={error} />;
  const s = draft ?? data.settings;
  const up = (patch) => setDraft({ ...s, ...patch });
  const num = (k, label, opts = {}) => (
    <InputField
      label={`${label}${opts.suffix ? ` (${opts.suffix})` : ''}`}
      type="number"
      step={opts.step ?? '1'}
      value={String(s[k])}
      onChange={(e) => up({ [k]: e.target.value === '' ? '' : Number(e.target.value) })}
      error={errors[k]}
    />
  );
  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const r = await adminApi.saveLoyaltySettings(s);
      qc.setQueryData(['admin', 'loyalty', 'settings'], r);
      setDraft(null);
      toast('Interest Account rules saved');
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fields);
      toast(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-6"
    >
      {Object.keys(errors).length > 0 && (
        <Alert tone="error">Please check the highlighted fields: {Object.values(errors).join(' ')}</Alert>
      )}
      <Panel title="Points">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num('earn_points_per_1000_naira', 'Points per ₦1,000')}
          {num('redeem_points_per_1000_naira', 'Points for ₦1,000 credit')}
          {num('min_points_to_redeem', 'Minimum to redeem')}
          {num('featured_dish_points_multiplier', 'Featured dish multiplier', { suffix: '×', step: '0.25' })}
          {num('birthday_points_multiplier', 'Birthday week multiplier', { suffix: '×', step: '0.25' })}
          {num('points_expiry_months', 'Expire after no activity', { suffix: 'months' })}
          {num('points_expiry_warning_days', 'Warn before expiry', { suffix: 'days' })}
        </div>
        <fieldset className="mt-4">
          <legend className="eyebrow text-muted">Double-points days</legend>
          <div className="flex flex-wrap gap-x-4">
            {WEEKDAYS.map((d, i) => (
              <CheckField
                key={d}
                label={d}
                checked={s.double_points_weekdays.includes(i)}
                onChange={(v) =>
                  up({
                    double_points_weekdays: v
                      ? [...s.double_points_weekdays, i]
                      : s.double_points_weekdays.filter((x) => x !== i),
                  })
                }
              />
            ))}
          </div>
        </fieldset>
        <p className="text-secondary mt-3 text-sm">
          Multipliers never stack: each item earns at the single highest multiplier that applies (tier,
          double-points day, featured dish or birthday week). Members currently get about{' '}
          {Math.round((s.earn_points_per_1000_naira / s.redeem_points_per_1000_naira) * 1000) / 10}% back
          before multipliers.
        </p>
      </Panel>

      <Panel title="Dining wallet and interest">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num('topup_min_naira', 'Minimum top-up', { suffix: '₦' })}
          {num('topup_max_naira', 'Maximum top-up', { suffix: '₦' })}
          <InputField
            label="Monthly interest (%)"
            type="number"
            step="0.1"
            value={String(s.interest_rate_bp / 100)}
            onChange={(e) => up({ interest_rate_bp: Math.round(Number(e.target.value) * 100) })}
            error={errors.interest_rate_bp}
          />
          {num('interest_cap_naira', 'Interest cap per month', { suffix: '₦' })}
          {num('interest_min_balance_naira', 'Minimum balance all month', { suffix: '₦' })}
          <InputField
            label="Preset top-ups (₦, comma-separated)"
            value={s.topup_presets_naira.join(', ')}
            onChange={(e) =>
              up({
                topup_presets_naira: e.target.value
                  .split(',')
                  .map((x) => Number(x.replace(/\D/g, '')))
                  .filter(Boolean),
              })
            }
            error={errors.topup_presets_naira}
            className="sm:col-span-2"
          />
        </div>
        <h3 className="eyebrow text-muted mt-5">Top-up bonus levels</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {s.topup_bonus_tiers.map((b, i) => (
            <li key={i} className="flex flex-wrap items-end gap-3">
              <InputField
                label="From (₦)"
                hideLabel={i > 0}
                type="number"
                value={String(b.min_naira)}
                onChange={(e) =>
                  up({
                    topup_bonus_tiers: s.topup_bonus_tiers.map((x, j) =>
                      j === i ? { ...x, min_naira: Number(e.target.value) } : x,
                    ),
                  })
                }
                className="w-40"
              />
              <InputField
                label="Bonus (%)"
                hideLabel={i > 0}
                type="number"
                step="0.5"
                value={String(b.bonus_bp / 100)}
                onChange={(e) =>
                  up({
                    topup_bonus_tiers: s.topup_bonus_tiers.map((x, j) =>
                      j === i ? { ...x, bonus_bp: Math.round(Number(e.target.value) * 100) } : x,
                    ),
                  })
                }
                className="w-32"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => up({ topup_bonus_tiers: s.topup_bonus_tiers.filter((_, j) => j !== i) })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {s.topup_bonus_tiers.length < 5 && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() =>
              up({ topup_bonus_tiers: [...s.topup_bonus_tiers, { min_naira: 200000, bonus_bp: 1500 }] })
            }
          >
            + Add a bonus level
          </Button>
        )}
        {errors.topup_bonus_tiers && <p className="text-danger text-sm">{errors.topup_bonus_tiers}</p>}
      </Panel>

      <Panel title="Membership tiers">
        <ul className="flex flex-col gap-4">
          {s.tiers.map((t, i) => (
            <li
              key={t.key}
              className="border-line grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_10rem_8rem]"
            >
              <InputField
                label="Name"
                value={t.name}
                onChange={(e) =>
                  up({ tiers: s.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                }
                maxLength={40}
              />
              <InputField
                label="From 12-month spend (₦)"
                type="number"
                disabled={i === 0}
                value={String(t.min_spend_naira)}
                onChange={(e) =>
                  up({
                    tiers: s.tiers.map((x, j) =>
                      j === i ? { ...x, min_spend_naira: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
              <InputField
                label="Points ×"
                type="number"
                step="0.05"
                value={String(t.multiplier)}
                onChange={(e) =>
                  up({
                    tiers: s.tiers.map((x, j) =>
                      j === i ? { ...x, multiplier: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
              <InputField
                label="Perks (comma-separated)"
                value={t.perks.join(', ')}
                onChange={(e) =>
                  up({
                    tiers: s.tiers.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            perks: e.target.value
                              .split(',')
                              .map((p) => p.trim())
                              .filter(Boolean),
                          }
                        : x,
                    ),
                  })
                }
                className="sm:col-span-3"
              />
            </li>
          ))}
        </ul>
        {errors.tiers && <p className="text-danger mt-2 text-sm">{errors.tiers}</p>}
        <fieldset className="mt-4">
          <legend className="eyebrow text-muted">Free delivery for</legend>
          <div className="flex flex-wrap gap-x-4">
            {s.tiers.map((t) => (
              <CheckField
                key={t.key}
                label={t.name}
                checked={s.free_delivery_tiers.includes(t.key)}
                onChange={(v) =>
                  up({
                    free_delivery_tiers: v
                      ? [...s.free_delivery_tiers, t.key]
                      : s.free_delivery_tiers.filter((x) => x !== t.key),
                  })
                }
              />
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel title="Stamp card, streaks and special moments">
        <ul className="flex flex-col gap-2">
          {s.stamp_rewards.map((r, i) => (
            <li key={i} className="flex flex-wrap items-end gap-3">
              <InputField
                label="Stamp"
                hideLabel={i > 0}
                type="number"
                min={1}
                max={10}
                value={String(r.stamp)}
                onChange={(e) =>
                  up({
                    stamp_rewards: s.stamp_rewards.map((x, j) =>
                      j === i ? { ...x, stamp: Number(e.target.value) } : x,
                    ),
                  })
                }
                className="w-24"
              />
              <InputField
                label="Reward"
                hideLabel={i > 0}
                value={r.reward}
                onChange={(e) =>
                  up({
                    stamp_rewards: s.stamp_rewards.map((x, j) =>
                      j === i ? { ...x, reward: e.target.value } : x,
                    ),
                  })
                }
                className="min-w-48 flex-1"
              />
              <SelectField
                label="From section"
                hideLabel={i > 0}
                value={r.category}
                onChange={(v) =>
                  up({ stamp_rewards: s.stamp_rewards.map((x, j) => (j === i ? { ...x, category: v } : x)) })
                }
                options={data.categories.map((c) => [c.slug, c.name])}
                className="w-44"
              />
            </li>
          ))}
        </ul>
        {errors.stamp_rewards && <p className="text-danger text-sm">{errors.stamp_rewards}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num('streak_visits_per_month', 'Visits for streak bonus')}
          {num('streak_bonus_points', 'Streak bonus', { suffix: 'points' })}
          {num('anniversary_points', 'Anniversary bonus', { suffix: 'points' })}
          {num('referral_credit_naira', 'Referral credit each', { suffix: '₦' })}
          {num('referral_max_per_month', 'Referral rewards per member a month')}
          {num('winback_after_days', '“We miss you” after', { suffix: 'days' })}
          {num('winback_offer_percent', 'Win-back discount', { suffix: '%' })}
        </div>
      </Panel>

      <div className="bg-surface/95 border-line sticky bottom-0 flex flex-wrap items-center gap-3 border-t py-4">
        <Button type="submit" loading={busy} disabled={!draft}>
          Save rules
        </Button>
        {draft && (
          <Button variant="ghost" onClick={() => setDraft(null)}>
            Discard changes
          </Button>
        )}
        <p className="text-muted text-xs">
          Changes apply from now on; past credit and points are never recalculated. Every change is
          audit-logged.
        </p>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------- rewards menu */

function RewardsMenu() {
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ['admin', 'loyalty', 'settings'],
    queryFn: ({ signal }) => adminApi.loyaltySettings(signal),
  });
  const [editing, setEditing] = useState(null);
  if (!data) return <Loading error={error} />;
  return (
    <Panel
      title="Rewards menu"
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          Add a reward
        </Button>
      }
    >
      <ul className="flex flex-col">
        {data.rewards.map((r) => (
          <li
            key={r.id}
            className="border-line flex flex-wrap items-center gap-3 border-t py-3 first:border-t-0"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {r.name} {!r.isActive && <StatusPill status="hidden" label="Hidden" />}
              </p>
              <p className="text-secondary text-sm">
                {r.description} · {fmt.number(r.pointsCost)} points
                {r.creditKobo ? ` · ${formatNaira(r.creditKobo)} credit` : ''}
                {r.dineInOnly ? ' · in the restaurant' : ''} · redeemed {r.redeemed}×
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
      {editing && (
        <RewardEditor
          reward={editing === 'new' ? null : editing}
          categories={data.categories}
          onClose={() => setEditing(null)}
          onSaved={(rewards) => qc.setQueryData(['admin', 'loyalty', 'settings'], { ...data, rewards })}
        />
      )}
    </Panel>
  );
}

function RewardEditor({ reward, categories, onSaved, onClose }) {
  const [r, setR] = useState({
    name: reward?.name ?? '',
    description: reward?.description ?? '',
    points_cost: String(reward?.pointsCost ?? 500),
    reward_type: reward?.type ?? 'item',
    credit_naira: reward?.creditKobo ? String(reward.creditKobo / 100) : '',
    category_slug: reward?.categorySlug ?? '',
    dine_in_only: reward?.dineInOnly ?? false,
    is_active: reward?.isActive ?? true,
  });
  const [error, setError] = useState(null);
  return (
    <Modal title={reward ? `Edit ${reward.name}` : 'Add a reward'} onClose={onClose}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const body = {
              ...r,
              points_cost: Number(r.points_cost),
              credit_naira: r.reward_type === 'credit' ? Number(r.credit_naira) || null : null,
              category_slug: r.reward_type === 'item' ? r.category_slug || null : null,
            };
            onSaved((await adminApi.saveReward(body, reward?.id)).rewards);
            toast('Reward saved');
            onClose();
          } catch (err) {
            setError(
              err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Please try again.',
            );
          }
        }}
      >
        <InputField
          label="Name"
          value={r.name}
          onChange={(e) => setR({ ...r, name: e.target.value })}
          maxLength={120}
        />
        <InputField
          label="Description"
          value={r.description}
          onChange={(e) => setR({ ...r, description: e.target.value })}
          maxLength={255}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            label="Points"
            type="number"
            value={r.points_cost}
            onChange={(e) => setR({ ...r, points_cost: e.target.value })}
          />
          <SelectField
            label="Type"
            value={r.reward_type}
            onChange={(v) => setR({ ...r, reward_type: v })}
            options={[
              ['credit', 'Dining credit'],
              ['item', 'Free item'],
              ['upgrade', 'Upgrade'],
            ]}
          />
          {r.reward_type === 'credit' && (
            <InputField
              label="Credit (₦)"
              type="number"
              value={r.credit_naira}
              onChange={(e) => setR({ ...r, credit_naira: e.target.value })}
            />
          )}
          {r.reward_type === 'item' && (
            <SelectField
              label="Any item from"
              value={r.category_slug}
              onChange={(v) => setR({ ...r, category_slug: v })}
              options={[
                ['', 'A specific dish (set by developer)'],
                ...categories.map((c) => [c.slug, c.name]),
              ]}
            />
          )}
        </div>
        <CheckField
          label="Only in the restaurant (shown to the server)"
          checked={r.dine_in_only}
          onChange={(v) => setR({ ...r, dine_in_only: v })}
        />
        <CheckField
          label="Show on the Rewards Menu"
          checked={r.is_active}
          onChange={(v) => setR({ ...r, is_active: v })}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit">Save reward</Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ ledger */

function Ledger() {
  const [kind, setKind] = useState('wallet');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({
    queryKey: ['admin', 'loyalty', 'ledger', kind, type, q, page],
    queryFn: ({ signal }) => adminApi.loyaltyLedger({ kind, type, q, page }, signal),
    placeholderData: keepPreviousData,
  });
  const types =
    kind === 'wallet'
      ? [
          'topup',
          'topup_bonus',
          'interest',
          'payment',
          'refund',
          'referral_bonus',
          'reward_redemption',
          'adjustment',
        ]
      : ['earn', 'bonus', 'streak', 'redeem', 'expire', 'adjustment'];
  const show = (n) => (kind === 'wallet' ? formatNaira(n) : fmt.number(n));
  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SelectField
          label="Ledger"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setType('');
            setPage(1);
          }}
          options={[
            ['wallet', 'Dining credit'],
            ['points', 'Points'],
          ]}
          className="w-44"
        />
        <SelectField
          label="Type"
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={[['', 'All types'], ...types.map((t) => [t, fmt.label(t)])]}
          className="w-48"
        />
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Member, email or reference"
        />
      </div>
      <p className="text-muted mb-3 text-xs">
        Append-only: entries can never be edited or deleted. Corrections are new adjustment entries.
      </p>
      {!data ? (
        <Loading error={error} />
      ) : data.items.length === 0 ? (
        <Empty>No entries.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[52rem]">
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  Date
                </th>
                <th scope="col" className={thClass}>
                  Member
                </th>
                <th scope="col" className={thClass}>
                  Details
                </th>
                <th scope="col" className={thClass}>
                  By
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
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td className={`${tdClass} whitespace-nowrap`}>{fmt.dateTime(e.at)}</td>
                  <td className={tdClass}>
                    <Link to={`/admin/customers/${e.member.id}`} className="hover:text-accent">
                      {e.member.name}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    {e.description}
                    <span className="text-muted block text-xs">
                      {fmt.label(e.type)}
                      {e.reference && ` · ${e.reference}`}
                    </span>
                  </td>
                  <td className={tdClass}>{e.by ?? <span className="text-muted">System</span>}</td>
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
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </Panel>
  );
}

/* --------------------------------------------------------- interest runs */

function InterestRuns() {
  const qc = useQueryClient();
  const { data: me } = useAdminMe();
  const { data, error } = useQuery({
    queryKey: ['admin', 'loyalty', 'analytics'],
    queryFn: ({ signal }) => adminApi.loyaltyAnalytics(signal),
  });
  const now = lagosNow();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [period, setPeriod] = useState(
    `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  if (!data) return <Loading error={error} />;

  const run = async (fn) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fn();
      setMessage({
        tone: 'success',
        text: `Interest for ${r.result.period}: ${formatNaira(r.result.totalKobo)} paid to ${r.result.accountsCredited} members.`,
      });
      void qc.invalidateQueries({ queryKey: ['admin', 'loyalty'] });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Could not run.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Monthly interest">
        <p className="text-secondary text-sm">
          The daily job pays last month’s interest automatically on the 1st. Each month can only ever be paid
          once; a run that stopped halfway can be run again safely and only pays the members it missed.
        </p>
        {can(me, 'loyalty.interest') && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <InputField
              label="Month"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-48"
            />
            <Button loading={busy} onClick={() => run(() => adminApi.runInterest(period))}>
              Pay interest for this month
            </Button>
            {me?.demoTools && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => run(() => adminApi.simulateInterest())}
              >
                Simulate month-end interest (demo)
              </Button>
            )}
          </div>
        )}
        {message && (
          <Alert tone={message.tone} className="mt-4">
            {message.text}
          </Alert>
        )}
      </Panel>
      <Panel title="Run history">
        {data.interestRuns.length === 0 ? (
          <Empty>No interest has been paid yet.</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[36rem]">
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    Month
                  </th>
                  <th scope="col" className={thClass}>
                    Status
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Members
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Paid
                  </th>
                  <th scope="col" className={thClass}>
                    Run
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.interestRuns.map((r) => (
                  <tr key={r.period}>
                    <td className={tdClass}>
                      {new Date(`${r.period}-01T12:00:00`).toLocaleDateString('en-NG', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </td>
                    <td className={tdClass}>
                      <StatusPill status={r.status} />
                      {r.error && <span className="text-danger block text-xs">{r.error}</span>}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{r.accounts}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{formatNaira(r.totalKobo)}</td>
                    <td className={tdClass}>
                      {fmt.label(r.trigger)} · {fmt.dateTime(r.finishedAt ?? r.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
