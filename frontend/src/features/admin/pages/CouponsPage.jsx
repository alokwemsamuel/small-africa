import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { adminApi } from '../api';
import {
  AdminHeader,
  CheckField,
  Empty,
  InputField,
  Loading,
  Modal,
  Panel,
  SelectField,
  StatusPill,
} from '../ui';
import { fmt, tdClass, thClass } from '../format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const key = ['admin', 'coupons'];

const describe = (c) =>
  `${c.discountType === 'percent' ? `${c.discountValue}%` : formatNaira(c.discountValue)} off` +
  (c.maxDiscountKobo ? ` (up to ${formatNaira(c.maxDiscountKobo)})` : '') +
  (c.minOrderKobo ? ` · min ${formatNaira(c.minOrderKobo)}` : '') +
  (c.validWeekdays ? ` · ${c.validWeekdays.map((d) => WEEKDAYS[d]).join(', ')}` : '') +
  (c.firstOrderOnly ? ' · first order' : '');

export function CouponsPage() {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: key, queryFn: ({ signal }) => adminApi.coupons(signal) });
  const { data: menu } = useQuery({
    queryKey: ['admin', 'menu'],
    queryFn: ({ signal }) => adminApi.menu(signal),
  });
  const [editing, setEditing] = useState(null);
  const [showPersonal, setShowPersonal] = useState(false);
  if (!data) return <Loading error={error} />;
  const list = data.filter((c) => showPersonal || !c.personal);
  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Coupons & promotions"
        intro="Codes guests enter at checkout. Personal “We miss you” codes are created automatically by the Interest Account."
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            Create a coupon
          </Button>
        }
      />
      <CheckField label="Show personal win-back codes" checked={showPersonal} onChange={setShowPersonal} />
      <Panel>
        {list.length === 0 ? (
          <Empty>No coupons yet.</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[48rem]">
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    Code
                  </th>
                  <th scope="col" className={thClass}>
                    Offer
                  </th>
                  <th scope="col" className={thClass}>
                    Valid
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Used
                  </th>
                  <th scope="col" className={thClass}>
                    Status
                  </th>
                  <th scope="col" className={thClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className={`${tdClass} font-mono font-semibold`}>{c.code}</td>
                    <td className={tdClass}>
                      {c.description}
                      <span className="text-muted block text-xs">{describe(c)}</span>
                    </td>
                    <td className={tdClass}>
                      {c.startsAt ? fmt.date(c.startsAt) : 'Now'} – {c.endsAt ? fmt.date(c.endsAt) : 'no end'}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {c.timesUsed}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                    </td>
                    <td className={tdClass}>
                      <StatusPill status={c.live ? 'live' : 'ended'} label={c.live ? 'Live' : 'Not live'} />
                    </td>
                    <td className={`${tdClass} text-right whitespace-nowrap`}>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      {c.live && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            qc.setQueryData(key, await adminApi.expireCoupon(c.id));
                            toast(`${c.code} ended`);
                          }}
                        >
                          End now
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && (
        <CouponEditor
          coupon={editing === 'new' ? null : editing}
          kitchens={menu?.kitchens ?? []}
          onSaved={(c) => qc.setQueryData(key, c)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CouponEditor({ coupon, kitchens, onSaved, onClose }) {
  const [c, setC] = useState({
    code: coupon?.code ?? '',
    description: coupon?.description ?? '',
    discount_type: coupon?.discountType ?? 'percent',
    discount_value: coupon
      ? String(coupon.discountType === 'fixed' ? coupon.discountValue / 100 : coupon.discountValue)
      : '10',
    min_order_naira: coupon?.minOrderKobo ? String(coupon.minOrderKobo / 100) : '',
    max_discount_naira: coupon?.maxDiscountKobo ? String(coupon.maxDiscountKobo / 100) : '',
    kitchen_id: coupon?.kitchenId ? String(coupon.kitchenId) : '',
    starts_at: coupon?.startsAt?.slice(0, 10) ?? '',
    ends_at: coupon?.endsAt?.slice(0, 10) ?? '',
    usage_limit: coupon?.usageLimit ? String(coupon.usageLimit) : '',
    per_user_limit: coupon?.perUserLimit ? String(coupon.perUserLimit) : '',
    first_order_only: coupon?.firstOrderOnly ?? false,
    is_active: coupon?.isActive ?? true,
    valid_weekdays: coupon?.validWeekdays ?? [],
  });
  const [errors, setErrors] = useState({});
  const n = (v) => (v === '' ? null : Number(v));
  return (
    <Modal title={coupon ? `Edit ${coupon.code}` : 'Create a coupon'} onClose={onClose} wide>
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setErrors({});
          try {
            onSaved(
              await adminApi.saveCoupon(
                {
                  ...c,
                  code: c.code.toUpperCase(),
                  discount_value: Number(c.discount_value),
                  min_order_naira: n(c.min_order_naira),
                  max_discount_naira: n(c.max_discount_naira),
                  kitchen_id: n(c.kitchen_id),
                  usage_limit: n(c.usage_limit),
                  per_user_limit: n(c.per_user_limit),
                  starts_at: c.starts_at || null,
                  ends_at: c.ends_at || null,
                },
                coupon?.id,
              ),
            );
            toast('Coupon saved');
            onClose();
          } catch (err) {
            setErrors(
              err instanceof ApiError ? { ...err.fields, _: err.message } : { _: 'Please try again.' },
            );
          }
        }}
      >
        <InputField
          label="Code"
          value={c.code}
          onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })}
          error={errors.code}
          maxLength={30}
        />
        <InputField
          label="Description (shown to guests)"
          value={c.description}
          onChange={(e) => setC({ ...c, description: e.target.value })}
          error={errors.description}
          maxLength={255}
        />
        <SelectField
          label="Discount"
          value={c.discount_type}
          onChange={(v) => setC({ ...c, discount_type: v })}
          options={[
            ['percent', 'Percentage'],
            ['fixed', 'Fixed amount (₦)'],
          ]}
        />
        <InputField
          label={c.discount_type === 'percent' ? 'Percent off' : 'Naira off'}
          type="number"
          value={c.discount_value}
          onChange={(e) => setC({ ...c, discount_value: e.target.value })}
          error={errors.discount_value}
        />
        <InputField
          label="Minimum order (₦, optional)"
          type="number"
          value={c.min_order_naira}
          onChange={(e) => setC({ ...c, min_order_naira: e.target.value })}
        />
        <InputField
          label="Maximum discount (₦, optional)"
          type="number"
          value={c.max_discount_naira}
          onChange={(e) => setC({ ...c, max_discount_naira: e.target.value })}
        />
        <SelectField
          label="Only on"
          value={c.kitchen_id}
          onChange={(v) => setC({ ...c, kitchen_id: v })}
          options={[['', 'Every kitchen'], ...kitchens.map((k) => [String(k.id), k.name])]}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label="Total uses"
            type="number"
            value={c.usage_limit}
            onChange={(e) => setC({ ...c, usage_limit: e.target.value })}
            placeholder="No limit"
          />
          <InputField
            label="Per guest"
            type="number"
            value={c.per_user_limit}
            onChange={(e) => setC({ ...c, per_user_limit: e.target.value })}
            placeholder="No limit"
          />
        </div>
        <InputField
          label="Starts"
          type="date"
          value={c.starts_at}
          onChange={(e) => setC({ ...c, starts_at: e.target.value })}
        />
        <InputField
          label="Ends"
          type="date"
          value={c.ends_at}
          onChange={(e) => setC({ ...c, ends_at: e.target.value })}
          error={errors.ends_at}
        />
        <fieldset className="sm:col-span-2">
          <legend className="eyebrow text-muted">Days (none ticked = every day)</legend>
          <div className="flex flex-wrap gap-x-4">
            {WEEKDAYS.map((d, i) => (
              <CheckField
                key={d}
                label={d}
                checked={c.valid_weekdays.includes(i)}
                onChange={(v) =>
                  setC({
                    ...c,
                    valid_weekdays: v ? [...c.valid_weekdays, i] : c.valid_weekdays.filter((x) => x !== i),
                  })
                }
              />
            ))}
          </div>
        </fieldset>
        <CheckField
          label="First online order only"
          checked={c.first_order_only}
          onChange={(v) => setC({ ...c, first_order_only: v })}
        />
        <CheckField label="Active" checked={c.is_active} onChange={(v) => setC({ ...c, is_active: v })} />
        {errors._ && (
          <Alert tone="error" className="sm:col-span-2">
            {errors._}
          </Alert>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit">Save coupon</Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
