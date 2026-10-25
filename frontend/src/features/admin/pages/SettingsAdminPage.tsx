import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { ThemeSegmented } from '@/features/theme/ThemeSwitcher';
import { ApiError } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { adminApi, type AdminSettings } from '../api';
import { AdminHeader, CheckField, InputField, Loading, Panel } from '../ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const key = ['admin', 'settings'];

export function SettingsAdminPage() {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: key, queryFn: ({ signal }) => adminApi.settings(signal) });
  if (!data) return <Loading error={error} />;
  const saved = (s: AdminSettings) => {
    qc.setQueryData(key, s);
    void qc.invalidateQueries({ queryKey: ['public'] });
    toast('Settings saved');
  };
  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Settings"
        intro="Contact details, charges, ordering, reservations, hours and delivery areas. Changes show on the website straight away."
      />
      <Restaurant data={data} onSaved={saved} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Pricing data={data} onSaved={saved} />
        <Ordering data={data} onSaved={saved} />
      </div>
      <Hours data={data} onSaved={saved} />
      <Zones data={data} onSaved={saved} />
      <Seating data={data} onSaved={saved} />
      <Panel title="Admin appearance">
        <ThemeSegmented legend="Admin appearance" />
      </Panel>
    </div>
  );
}

function useSave(onSaved: (s: AdminSettings) => void) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<AdminSettings>) => {
    setBusy(true);
    setErrors({});
    try {
      onSaved(await fn());
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...e.fields, _: e.message } : { _: 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };
  return { errors, busy, run };
}

function Errors({ errors }: { errors: Record<string, string> }) {
  const list = Object.entries(errors).filter(([k]) => k !== '_');
  if (!errors._ && list.length === 0) return null;
  return <Alert tone="error">{list.length ? list.map(([, v]) => v).join(' ') : errors._}</Alert>;
}

function Restaurant({ data, onSaved }: { data: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const [r, setR] = useState({ ...data.groups.restaurant });
  const { errors, busy, run } = useSave(onSaved);
  const field = (
    k: string,
    label: string,
    extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {},
  ) => (
    <InputField
      label={label}
      value={r[k] ?? ''}
      onChange={(e) => setR({ ...r, [k]: e.target.value })}
      error={errors[k]}
      {...extra}
    />
  );
  return (
    <Panel title="Restaurant & contact">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => adminApi.saveSettingsGroup('restaurant', r));
        }}
      >
        {field('name', 'Name')}
        {field('tagline', 'Tagline')}
        {field('address', 'Address', { className: 'sm:col-span-2' })}
        {field('phone', 'Phone (as shown)')}
        {field('whatsapp', 'WhatsApp number (digits, with country code)')}
        {field('email', 'Email', { type: 'email' })}
        {field('map_embed_query', 'Map search text')}
        {field('instagram', 'Instagram URL')}
        {field('tiktok', 'TikTok URL')}
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Errors errors={errors} />
          <Button type="submit" loading={busy} className="self-start">
            Save contact details
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Pricing({ data, onSaved }: { data: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const p = data.groups.pricing;
  const [f, setF] = useState({
    vat: String(p.vat_rate_bp / 100),
    dineIn: String(p.service_charge_dine_in_bp / 100),
    online: String(p.service_charge_online_bp / 100),
    packaging: String(p.packaging_fee_kobo / 100),
    includes: p.prices_include_vat,
  });
  const { errors, busy, run } = useSave(onSaved);
  return (
    <Panel title="Tax & charges">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            adminApi.saveSettingsGroup('pricing', {
              prices_include_vat: f.includes,
              vat_rate_bp: Math.round(Number(f.vat) * 100),
              service_charge_dine_in_bp: Math.round(Number(f.dineIn) * 100),
              service_charge_online_bp: Math.round(Number(f.online) * 100),
              packaging_fee_kobo: Math.round(Number(f.packaging) * 100),
            }),
          );
        }}
      >
        <InputField
          label="VAT (%)"
          type="number"
          step="0.1"
          value={f.vat}
          onChange={(e) => setF({ ...f, vat: e.target.value })}
        />
        <InputField
          label="Packaging per order (₦)"
          type="number"
          value={f.packaging}
          onChange={(e) => setF({ ...f, packaging: e.target.value })}
        />
        <InputField
          label="Service charge, dine-in (%)"
          type="number"
          step="0.5"
          value={f.dineIn}
          onChange={(e) => setF({ ...f, dineIn: e.target.value })}
        />
        <InputField
          label="Service charge, online (%)"
          type="number"
          step="0.5"
          value={f.online}
          onChange={(e) => setF({ ...f, online: e.target.value })}
        />
        <CheckField
          label="Menu prices include VAT"
          checked={f.includes}
          onChange={(v) => setF({ ...f, includes: v })}
          className="sm:col-span-2"
        />
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Errors errors={errors} />
          <Button type="submit" loading={busy} className="self-start">
            Save charges
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Ordering({ data, onSaved }: { data: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const [o, setO] = useState({ ...data.groups.ordering });
  const [r, setR] = useState({ ...data.groups.reservations });
  const { errors, busy, run } = useSave(onSaved);
  return (
    <Panel title="Online orders & reservations">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await adminApi.saveSettingsGroup('ordering', o);
            return adminApi.saveSettingsGroup('reservations', r);
          });
        }}
      >
        <CheckField
          label="Taking online orders"
          checked={o.accepting_orders}
          onChange={(v) => setO({ ...o, accepting_orders: v })}
          className="sm:col-span-2"
        />
        <InputField
          label="Preparation time (minutes)"
          type="number"
          value={String(o.min_lead_minutes)}
          onChange={(e) => setO({ ...o, min_lead_minutes: Number(e.target.value) })}
          error={errors.min_lead_minutes}
        />
        <InputField
          label="Schedule up to (days ahead)"
          type="number"
          value={String(o.max_schedule_days)}
          onChange={(e) => setO({ ...o, max_schedule_days: Number(e.target.value) })}
        />
        <InputField
          label="Book tables up to (days ahead)"
          type="number"
          value={String(r.max_days_ahead)}
          onChange={(e) => setR({ ...r, max_days_ahead: Number(e.target.value) })}
        />
        <InputField
          label="Largest party online"
          type="number"
          value={String(r.max_party_online)}
          onChange={(e) => setR({ ...r, max_party_online: Number(e.target.value) })}
        />
        <InputField
          label="Table time (minutes)"
          type="number"
          value={String(r.dining_duration_minutes)}
          onChange={(e) => setR({ ...r, dining_duration_minutes: Number(e.target.value) })}
        />
        <InputField
          label="Book at least (minutes ahead)"
          type="number"
          value={String(r.min_advance_minutes)}
          onChange={(e) => setR({ ...r, min_advance_minutes: Number(e.target.value) })}
        />
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Errors errors={errors} />
          <Button type="submit" loading={busy} className="self-start">
            Save
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Hours({ data, onSaved }: { data: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const [h, setH] = useState(data.hours.map((d) => ({ ...d })));
  const { errors, busy, run } = useSave(onSaved);
  return (
    <Panel title="Opening hours">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            adminApi.saveHours(
              h.map((d) => ({
                day_of_week: d.dayOfWeek,
                opens_at: d.isClosed ? null : d.opensAt,
                closes_at: d.isClosed ? null : d.closesAt,
                is_closed: d.isClosed,
              })),
            ),
          );
        }}
      >
        <ul className="flex flex-col gap-2">
          {h.map((d, i) => (
            <li key={d.dayOfWeek} className="flex flex-wrap items-end gap-3">
              <span className="w-28 pb-3 text-sm font-semibold">{DAYS[d.dayOfWeek]}</span>
              <InputField
                label="Opens"
                hideLabel
                type="time"
                value={d.opensAt ?? ''}
                disabled={d.isClosed}
                onChange={(e) => setH(h.map((x, j) => (j === i ? { ...x, opensAt: e.target.value } : x)))}
                className="w-32"
                aria-label={`${DAYS[d.dayOfWeek]} opens`}
              />
              <InputField
                label="Closes"
                hideLabel
                type="time"
                value={d.closesAt ?? ''}
                disabled={d.isClosed}
                onChange={(e) => setH(h.map((x, j) => (j === i ? { ...x, closesAt: e.target.value } : x)))}
                className="w-32"
                aria-label={`${DAYS[d.dayOfWeek]} closes`}
              />
              <CheckField
                label="Closed"
                checked={d.isClosed}
                onChange={(v) =>
                  setH(
                    h.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            isClosed: v,
                            opensAt: x.opensAt ?? '12:00',
                            closesAt: x.closesAt ?? '22:00',
                          }
                        : x,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-3">
          <Errors errors={errors} />
          <Button type="submit" loading={busy} className="self-start">
            Save hours
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Zones({ data, onSaved }: { data: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const { errors, run } = useSave(onSaved);
  const [adding, setAdding] = useState({ name: '', fee: '', min: '15000', eta: '45' });
  return (
    <Panel title="Delivery areas">
      <ul className="flex flex-col gap-2">
        {data.zones.map((z) => (
          <ZoneRow key={z.id} zone={z} onSave={(body) => run(() => adminApi.saveZone(body, z.id))} />
        ))}
      </ul>
      <form
        className="border-line mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            adminApi.saveZone({
              name: adding.name,
              fee_naira: Number(adding.fee),
              min_order_naira: Number(adding.min),
              eta_minutes: Number(adding.eta),
            }),
          ).then(() => setAdding({ name: '', fee: '', min: '15000', eta: '45' }));
        }}
      >
        <InputField
          label="New area"
          value={adding.name}
          onChange={(e) => setAdding({ ...adding, name: e.target.value })}
          className="min-w-48 flex-1"
        />
        <InputField
          label="Fee (₦)"
          type="number"
          value={adding.fee}
          onChange={(e) => setAdding({ ...adding, fee: e.target.value })}
          className="w-28"
        />
        <InputField
          label="Minimum (₦)"
          type="number"
          value={adding.min}
          onChange={(e) => setAdding({ ...adding, min: e.target.value })}
          className="w-32"
        />
        <InputField
          label="Minutes"
          type="number"
          value={adding.eta}
          onChange={(e) => setAdding({ ...adding, eta: e.target.value })}
          className="w-24"
        />
        <Button size="sm" type="submit" variant="secondary" disabled={!adding.name || !adding.fee}>
          Add area
        </Button>
      </form>
      <div className="mt-3">
        <Errors errors={errors} />
      </div>
    </Panel>
  );
}

function ZoneRow({
  zone,
  onSave,
}: {
  zone: AdminSettings['zones'][number];
  onSave: (b: Record<string, unknown>) => void;
}) {
  const [z, setZ] = useState({
    fee: String(zone.feeKobo / 100),
    min: String(zone.minOrderKobo / 100),
    eta: String(zone.etaMinutes),
    active: zone.isActive,
  });
  const dirty =
    z.fee !== String(zone.feeKobo / 100) ||
    z.min !== String(zone.minOrderKobo / 100) ||
    z.eta !== String(zone.etaMinutes) ||
    z.active !== zone.isActive;
  return (
    <li className="flex flex-wrap items-end gap-3">
      <span className="w-40 pb-3 text-sm font-semibold">{zone.name}</span>
      <InputField
        label="Fee (₦)"
        type="number"
        value={z.fee}
        onChange={(e) => setZ({ ...z, fee: e.target.value })}
        className="w-28"
        aria-label={`${zone.name} fee`}
      />
      <InputField
        label="Minimum (₦)"
        type="number"
        value={z.min}
        onChange={(e) => setZ({ ...z, min: e.target.value })}
        className="w-32"
        aria-label={`${zone.name} minimum order`}
      />
      <InputField
        label="Minutes"
        type="number"
        value={z.eta}
        onChange={(e) => setZ({ ...z, eta: e.target.value })}
        className="w-24"
        aria-label={`${zone.name} delivery minutes`}
      />
      <CheckField label="Delivering" checked={z.active} onChange={(v) => setZ({ ...z, active: v })} />
      {dirty ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onSave({
              fee_naira: Number(z.fee),
              min_order_naira: Number(z.min),
              eta_minutes: Number(z.eta),
              is_active: z.active,
            })
          }
        >
          Save
        </Button>
      ) : (
        <span className="text-muted pb-3 text-xs">{formatNaira(zone.feeKobo)}</span>
      )}
    </li>
  );
}

function Seating({ data, onSaved }: { data: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const { errors, run } = useSave(onSaved);
  return (
    <Panel title="Seating areas">
      <p className="text-secondary mb-3 text-sm">
        Seats available per reservation slot. For one-off changes (a private event, a closed terrace), use
        Reservations → Capacity.
      </p>
      <ul className="flex flex-col gap-2">
        {data.seating.map((a) => (
          <SeatingRow key={a.id} area={a} onSave={(b) => run(() => adminApi.saveSeating(a.id, b))} />
        ))}
      </ul>
      <div className="mt-3">
        <Errors errors={errors} />
      </div>
    </Panel>
  );
}

function SeatingRow({
  area,
  onSave,
}: {
  area: AdminSettings['seating'][number];
  onSave: (b: Record<string, unknown>) => void;
}) {
  const [s, setS] = useState({
    covers: String(area.coversPerSlot),
    min: String(area.minParty),
    max: String(area.maxParty),
    active: area.isActive,
  });
  return (
    <li className="flex flex-wrap items-end gap-3">
      <span className="w-40 pb-3 text-sm font-semibold">{area.name}</span>
      <InputField
        label="Seats per slot"
        type="number"
        value={s.covers}
        onChange={(e) => setS({ ...s, covers: e.target.value })}
        className="w-32"
        aria-label={`${area.name} seats per slot`}
      />
      <InputField
        label="Party from"
        type="number"
        value={s.min}
        onChange={(e) => setS({ ...s, min: e.target.value })}
        className="w-28"
        aria-label={`${area.name} smallest party`}
      />
      <InputField
        label="Party up to"
        type="number"
        value={s.max}
        onChange={(e) => setS({ ...s, max: e.target.value })}
        className="w-28"
        aria-label={`${area.name} largest party`}
      />
      <CheckField label="Open for bookings" checked={s.active} onChange={(v) => setS({ ...s, active: v })} />
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          onSave({
            covers_per_slot: Number(s.covers),
            min_party: Number(s.min),
            max_party: Number(s.max),
            is_active: s.active,
          })
        }
      >
        Save
      </Button>
    </li>
  );
}
