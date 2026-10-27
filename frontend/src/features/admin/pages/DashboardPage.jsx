import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatNaira } from '@/lib/format';
import { cn } from '@/lib/cn';
import { adminApi, can, useAdminMe } from '../api';
import { BarList, ColumnChart } from '../charts';
import { AdminHeader, Empty, Loading, Panel, StatusPill, StatTile } from '../ui';
import { fmt } from '../format';

const dayLabel = (iso, long) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(
    'en-NG',
    long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric' },
  );

/** "+12% vs yesterday" — up is good for every figure on this page. */
function delta(now, before, unit = 'vs yesterday') {
  if (before === 0)
    return now === 0
      ? { text: `No change ${unit}`, good: null }
      : { text: `New ${unit.replace('vs ', 'since ')}`, good: true };
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}% ${unit}`, good: pct === 0 ? null : pct > 0 };
}

export function DashboardPage() {
  const { data: me } = useAdminMe();
  const [days, setDays] = useState(7);
  const { data, error, isFetching } = useQuery({
    queryKey: ['admin', 'dashboard', days],
    queryFn: ({ signal }) => adminApi.dashboard(days, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  if (!data) return <Loading error={error} label="Loading dashboard" />;

  const t = data.today;
  const y = data.yesterday;
  const revenue = data.series.map((s) => ({
    key: s.date,
    label: dayLabel(s.date, false),
    fullLabel: dayLabel(s.date, true),
    value: s.revenueKobo,
    display: formatNaira(s.revenueKobo),
  }));
  const orders = data.series.map((s) => ({
    key: s.date,
    label: dayLabel(s.date, false),
    fullLabel: dayLabel(s.date, true),
    value: s.orders,
    display: `${s.orders} ${s.orders === 1 ? 'order' : 'orders'}`,
  }));

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader
        title="Dashboard"
        intro={`Today in Lagos. Updated ${fmt.time(data.generatedAt)}; refreshes every 30 seconds.`}
        actions={
          <div role="group" aria-label="Period" className="border-line flex rounded-full border p-1">
            {[7, 30].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={cn(
                  'min-h-9 rounded-full px-4 text-xs font-semibold',
                  days === d ? 'bg-accent-fill text-on-accent' : 'text-secondary',
                )}
              >
                Last {d} days
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Revenue today"
          value={formatNaira(t.revenueKobo)}
          delta={delta(t.revenueKobo, y.revenueKobo)}
        />
        <StatTile label="Orders today" value={fmt.number(t.orders)} delta={delta(t.orders, y.orders)} />
        <StatTile
          label="Reservations today"
          value={fmt.number(t.reservations)}
          delta={{ text: `${t.covers} guests expected`, good: null }}
        />
        <StatTile
          label="Average order today"
          value={formatNaira(t.averageOrderKobo)}
          delta={delta(t.averageOrderKobo, y.averageOrderKobo)}
        />
      </div>

      <div className={cn('grid gap-6 transition-opacity lg:grid-cols-2', isFetching && 'opacity-70')}>
        <Panel>
          <ColumnChart
            title={`Revenue per day, last ${days} days (${formatNaira(data.period.revenueKobo)} in total)`}
            data={revenue}
            tickFormat={fmt.compactNaira}
          />
        </Panel>
        <Panel>
          <ColumnChart
            title={`Orders per day, last ${days} days (${data.period.orders} in total)`}
            data={orders}
            tickFormat={(v) => fmt.number(v)}
            integer
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Live orders"
          actions={
            <Link
              to="/admin/orders?status=received,preparing,ready,out_for_delivery"
              className="text-accent text-sm underline"
            >
              All active orders
            </Link>
          }
        >
          {data.live.length === 0 ? (
            <Empty>No orders in the kitchen right now.</Empty>
          ) : (
            <ul className="flex flex-col" aria-live="polite">
              {data.live.map((o) => (
                <li
                  key={o.reference}
                  className="border-line flex flex-wrap items-center gap-3 border-t py-3 first:border-t-0"
                >
                  <Link
                    to={`/admin/orders/${o.reference}`}
                    className="hover:text-accent font-mono text-sm font-semibold"
                  >
                    {o.reference}
                  </Link>
                  <StatusPill status={o.status} />
                  <span className="text-secondary text-sm">
                    {o.customerName} · {o.items} {o.items === 1 ? 'item' : 'items'} ·{' '}
                    {o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
                  </span>
                  <span className="text-muted ml-auto text-xs">
                    {o.scheduledFor
                      ? `For ${fmt.dateTime(o.scheduledFor)}`
                      : `Placed ${fmt.time(o.placedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel>
            <BarList
              title={`Top dishes, last ${days} days`}
              items={data.topDishes.map((d) => ({
                label: d.name,
                value: d.quantity,
                display: `${d.quantity} sold`,
                detail: formatNaira(d.revenueKobo),
              }))}
            />
          </Panel>
          <Panel>
            <BarList
              title={`Revenue by kitchen, last ${days} days`}
              items={data.byKitchen.map((k) => ({
                label: k.kitchen,
                value: k.revenueKobo,
                display: formatNaira(k.revenueKobo),
              }))}
            />
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {can(me, 'reviews.moderate') && (
          <Shortcut to="/admin/reviews" label="Reviews to moderate" value={data.pending.reviews} />
        )}
        {can(me, 'enquiries.manage') && (
          <Shortcut to="/admin/enquiries" label="New event enquiries" value={data.pending.enquiries} />
        )}
        {can(me, 'enquiries.manage') && (
          <Shortcut to="/admin/enquiries?tab=messages" label="New messages" value={data.pending.messages} />
        )}
        {can(me, 'loyalty.manage') && (
          <Shortcut
            to="/admin/rewards"
            label="Interest Account members"
            value={data.loyalty.members}
            detail={`${formatNaira(data.loyalty.walletKobo)} dining credit held`}
          />
        )}
      </div>
    </div>
  );
}

function Shortcut({ to, label, value, detail }) {
  return (
    <Link
      to={to}
      className="border-line bg-surface-raised hover:border-accent block rounded-md border p-5 transition-colors"
    >
      <p className="text-secondary text-sm">{label}</p>
      <p className="mt-1 font-sans text-2xl font-semibold">{fmt.number(value)}</p>
      {detail && <p className="text-muted mt-1 text-xs">{detail}</p>}
    </Link>
  );
}
