import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { lagosNow } from '@/lib/lagosTime';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { adminApi, can, useAdminMe } from '../api';
import {
  AdminHeader,
  Empty,
  InputField,
  Loading,
  Modal,
  Panel,
  SearchBox,
  SelectField,
  StatusPill,
} from '../ui';
import { fmt } from '../format';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const dayHeading = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });

const ACTION = {
  confirmed: 'Confirm',
  seated: 'Seat',
  completed: 'Complete',
  no_show: 'No-show',
};

export function ReservationsAdminPage() {
  const { data: me } = useAdminMe();
  const today = ymd(lagosNow());
  const [from, setFrom] = useState(today);
  const [status, setStatus] = useState('pending,confirmed,seated');
  const [q, setQ] = useState('');
  const [capacityDate, setCapacityDate] = useState(null);
  const to = addDays(from, 6);
  const { data, error, isFetching } = useQuery({
    queryKey: ['admin', 'reservations', from, to, status, q],
    queryFn: ({ signal }) => adminApi.reservations({ from, to, status, q }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const byDay = new Map();
  for (let i = 0; i < 7; i++) byDay.set(addDays(from, i), []);
  data?.reservations.forEach((r) => byDay.get(r.date)?.push(r));

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Reservations"
        intro="Seven days at a time. Guests are emailed automatically when you cancel."
        actions={
          can(me, 'reservations.capacity') && (
            <Button variant="secondary" size="sm" onClick={() => setCapacityDate(from)}>
              Capacity
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Week" className="flex items-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFrom(addDays(from, -7))}
            aria-label="Previous week"
          >
            ←
          </Button>
          <InputField
            label="From"
            type="date"
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="w-44"
          />
          <Button size="sm" variant="ghost" onClick={() => setFrom(addDays(from, 7))} aria-label="Next week">
            →
          </Button>
          {from !== today && (
            <Button size="sm" variant="ghost" onClick={() => setFrom(today)}>
              Today
            </Button>
          )}
        </div>
        <SelectField
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ['pending,confirmed,seated', 'Upcoming and seated'],
            ['', 'All'],
            ['completed', 'Completed'],
            ['cancelled,no_show', 'Cancelled and no-shows'],
          ]}
          className="w-52"
        />
        <SearchBox value={q} onChange={setQ} placeholder="Code, name, email or phone" />
      </div>

      {!data ? (
        <Loading error={error} />
      ) : (
        <div className={cn('flex flex-col gap-6 transition-opacity', isFetching && 'opacity-70')}>
          {[...byDay.entries()].map(([day, list]) => (
            <Panel
              key={day}
              title={`${dayHeading(day)}${day === today ? ' (today)' : ''}`}
              actions={
                <span className="text-secondary text-sm">
                  {list.filter((r) => !['cancelled', 'no_show'].includes(r.status)).length} bookings ·{' '}
                  {list
                    .filter((r) => !['cancelled', 'no_show'].includes(r.status))
                    .reduce((n, r) => n + r.partySize, 0)}{' '}
                  guests
                </span>
              }
            >
              {list.length === 0 ? (
                <Empty>No bookings.</Empty>
              ) : (
                <ul className="flex flex-col">
                  {list.map((r) => (
                    <BookingRow key={r.code} r={r} areas={data.areas} />
                  ))}
                </ul>
              )}
            </Panel>
          ))}
        </div>
      )}

      {capacityDate && (
        <CapacityModal date={capacityDate} onDate={setCapacityDate} onClose={() => setCapacityDate(null)} />
      )}
    </div>
  );
}

function BookingRow({ r, areas }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [table, setTable] = useState(r.tableLabel ?? '');
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const save = async (body, key) => {
    setErr(null);
    setBusy(key);
    try {
      await adminApi.updateReservation(r.code, body);
      await qc.invalidateQueries({ queryKey: ['admin', 'reservations'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      toast(`${r.guest.name}: updated`);
      setCancel(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="border-line grid gap-3 border-t py-4 first:border-t-0 md:grid-cols-[5rem_1fr_auto]">
      <p className="font-sans text-lg font-semibold tabular-nums">
        {fmt.time(`${r.date}T${r.time}:00+01:00`)}
      </p>
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{r.guest.name}</span>
          <StatusPill status={r.status} />
          {r.guest.tier && r.guest.tier !== 'bronze' && (
            <span className="text-accent text-xs font-semibold">{fmt.label(r.guest.tier)} member</span>
          )}
          {r.occasion !== 'none' && <span className="text-accent text-xs">{fmt.label(r.occasion)}</span>}
        </p>
        <p className="text-secondary">
          {r.partySize} {r.partySize === 1 ? 'guest' : 'guests'} · {r.area.name}
          {r.tableLabel && ` · Table ${r.tableLabel}`} · <span className="font-mono">{r.code}</span>
        </p>
        <p className="text-secondary">
          <a href={`tel:${r.guest.phone}`} className="text-accent underline">
            {r.guest.phone}
          </a>{' '}
          · {r.guest.email}
        </p>
        {r.notes && <p className="text-primary mt-1">Note: {r.notes}</p>}
        {r.cancelledReason && <p className="text-muted mt-1">Cancelled: {r.cancelledReason}</p>}
        {err && (
          <Alert tone="error" className="mt-2">
            {err}
          </Alert>
        )}
        {cancel && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <InputField
              label="Reason (emailed to the guest)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-w-64 flex-1"
              maxLength={255}
            />
            <Button
              size="sm"
              variant="danger"
              loading={busy === 'cancelled'}
              onClick={() => save({ status: 'cancelled', reason: reason || null }, 'cancelled')}
            >
              Cancel booking
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCancel(false)}>
              Keep
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2 md:justify-end">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ table_label: table.trim() || null }, 'table');
          }}
        >
          <InputField
            label="Table"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            maxLength={20}
            className="w-20"
          />
          {table !== (r.tableLabel ?? '') && (
            <Button size="sm" type="submit" variant="secondary" loading={busy === 'table'}>
              Save
            </Button>
          )}
        </form>
        {['pending', 'confirmed'].includes(r.status) && (
          <SelectField
            label="Area"
            value={r.area.slug}
            onChange={(v) => v !== r.area.slug && void save({ area: v }, 'area')}
            options={areas.map((a) => [a.slug, a.name])}
            className="w-40"
          />
        )}
        {r.nextStatuses
          .filter((s) => s !== 'cancelled')
          .map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === 'no_show' ? 'ghost' : 'primary'}
              loading={busy === s}
              onClick={() => save({ status: s }, s)}
            >
              {ACTION[s] ?? fmt.label(s)}
            </Button>
          ))}
        {r.nextStatuses.includes('cancelled') && !cancel && (
          <Button size="sm" variant="ghost" onClick={() => setCancel(true)}>
            Cancel…
          </Button>
        )}
      </div>
    </li>
  );
}

function CapacityModal({ date, onDate, onClose }) {
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ['admin', 'capacity', date],
    queryFn: ({ signal }) => adminApi.capacity(date, signal),
  });
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const apply = (c) => {
    qc.setQueryData(['admin', 'capacity', date], c);
    void qc.invalidateQueries({ queryKey: ['admin', 'reservations'] });
  };
  const submit = async () => {
    if (!edit) return;
    setErr(null);
    try {
      apply(
        await adminApi.setCapacity({
          date,
          area: edit.area,
          time: edit.time,
          covers: Number(edit.covers),
          reason: edit.reason || null,
        }),
      );
      setEdit(null);
    } catch (e) {
      setErr(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Please try again.');
    }
  };

  return (
    <Modal title="Capacity" onClose={onClose} wide>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <InputField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDate(e.target.value)}
            className="w-48"
          />
          <p className="text-secondary text-sm">
            Seats per time slot. Set 0 to close a slot (or a whole day) for a private event or maintenance.
          </p>
        </div>
        {err && <Alert tone="error">{err}</Alert>}
        {!data ? (
          <Loading error={error} />
        ) : (
          data.areas.map((a) => (
            <div key={a.slug}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">
                  {a.name}{' '}
                  <span className="text-muted text-sm font-normal">
                    · {a.defaultCovers} seats per slot normally
                  </span>
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEdit({ area: a.slug, time: null, covers: '0', reason: '' })}
                >
                  Set for the whole day
                </Button>
              </div>
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                {a.slots.map((s) => (
                  <li key={s.time}>
                    <button
                      type="button"
                      onClick={() =>
                        setEdit({
                          area: a.slug,
                          time: s.time,
                          covers: String(s.covers),
                          reason: s.override?.reason ?? '',
                        })
                      }
                      className={cn(
                        'w-full rounded-sm border p-2 text-left text-xs transition-colors',
                        s.covers === 0
                          ? 'border-danger/50 bg-danger/10'
                          : s.override
                            ? 'border-accent bg-accent-fill/10'
                            : 'border-line hover:border-accent',
                      )}
                      aria-label={`${a.name} ${s.time}: ${s.booked} of ${s.covers} seats booked${s.override ? ', changed for this date' : ''}`}
                    >
                      <span className="block font-semibold">{s.time}</span>
                      <span className="tabular-nums">
                        {s.booked}/{s.covers}
                      </span>
                      {s.covers === 0 && <span className="text-danger block">Closed</span>}
                    </button>
                    {s.override && !s.override.wholeDay && (
                      <button
                        type="button"
                        onClick={async () => apply(await adminApi.clearCapacity(s.override.id))}
                        className="text-accent mt-1 text-[11px] underline"
                      >
                        Reset
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {a.slots[0]?.override?.wholeDay && (
                <p className="text-sm">
                  Whole day set to {a.slots[0].covers} seats
                  {a.slots[0].override.reason && ` (${a.slots[0].override.reason})`}.{' '}
                  <button
                    type="button"
                    onClick={async () => apply(await adminApi.clearCapacity(a.slots[0].override.id))}
                    className="text-accent underline"
                  >
                    Reset day
                  </button>
                </p>
              )}
            </div>
          ))
        )}
        {edit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="border-accent/50 flex flex-wrap items-end gap-3 rounded-md border p-4"
          >
            <p className="w-full text-sm font-semibold">
              {data?.areas.find((a) => a.slug === edit.area)?.name}, {edit.time ?? 'whole day'}
            </p>
            <InputField
              label="Seats"
              type="number"
              min={0}
              max={500}
              value={edit.covers}
              onChange={(e) => setEdit({ ...edit, covers: e.target.value })}
              className="w-28"
            />
            <InputField
              label="Reason (optional)"
              value={edit.reason}
              onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
              className="min-w-56 flex-1"
              maxLength={160}
            />
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}
