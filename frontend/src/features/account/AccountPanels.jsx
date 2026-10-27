import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/toast';
import { cart } from '@/features/cart/cart';
import { formatTime } from '@/features/checkout/schedule';
import { useSite } from '@/features/menu/hooks';
import { longDate } from '@/features/reservations/api';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import {
  useAddresses,
  useCreateReview,
  useDeleteAddress,
  useMyOrders,
  useMyReservations,
  useMyReviews,
  useSaveAddress,
} from './hooks';

const ORDER_STATUS = {
  pending_payment: 'Awaiting payment',
  received: 'Received',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Collected',
  cancelled: 'Cancelled',
};

const shortDate = (iso) =>
  new Date(iso.replace(' ', 'T') + '+01:00').toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

function Empty({ children, action }) {
  return (
    <div className="border-line flex flex-col items-start gap-5 rounded-md border border-dashed p-8">
      <p className="text-secondary">{children}</p>
      {action}
    </div>
  );
}

function Loading({ error }) {
  return error ? (
    <Alert tone="error">{error instanceof Error ? error.message : 'Could not load.'}</Alert>
  ) : (
    <Spinner />
  );
}

/* ---------------------------------------------------------------- Orders */

export function OrdersPanel() {
  const { data: orders, error } = useMyOrders();
  if (!orders) return <Loading error={error} />;
  if (orders.length === 0) {
    return (
      <Empty action={<ButtonLink to="/menu">Browse the menu</ButtonLink>}>
        You haven’t ordered yet. Three kitchens are waiting.
      </Empty>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {orders.map((o) => (
        <OrderRow key={o.reference} order={o} />
      ))}
    </ul>
  );
}

function OrderRow({ order: o }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const reorder = async () => {
    setBusy(true);
    try {
      const r = await api(`/account/orders/${o.reference}/reorder`, {
        method: 'POST',
      });
      r.lines.forEach(({ quantity, ...line }) => cart.add(line, quantity));
      if (r.unavailable.length) toast(`Not available today: ${r.unavailable.join(', ')}`);
      navigate('/cart');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not reorder.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="border-line bg-surface-raised rounded-md border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link
            to={`/orders/${o.reference}`}
            className="hover:text-accent font-mono font-semibold tracking-wider"
          >
            {o.reference}
          </Link>
          <span className="text-muted ml-3 text-sm">
            {shortDate(o.placedAt ?? o.createdAt)} · {o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
          </span>
        </div>
        <span
          className={cn('text-sm font-semibold', o.status === 'cancelled' ? 'text-danger' : 'text-accent')}
        >
          {ORDER_STATUS[o.status]}
        </span>
      </div>
      <p className="text-secondary mt-2 text-sm">
        {o.items?.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="mr-auto font-semibold">{formatNaira(o.totalKobo)}</span>
        {o.reviewable && !reviewing && (
          <Button size="sm" variant="ghost" onClick={() => setReviewing(true)}>
            Write a review
          </Button>
        )}
        <Button size="sm" variant="secondary" loading={busy} onClick={reorder}>
          Reorder
        </Button>
      </div>
      {reviewing && <ReviewForm order={o} onDone={() => setReviewing(false)} />}
    </li>
  );
}

function ReviewForm({ order, onDone }) {
  const dishes = (order.items ?? []).filter((i) => i.dishId !== null);
  const create = useCreateReview();
  const [rating, setRating] = useState(5);
  const form = useForm({ defaultValues: { dish_id: String(dishes[0]?.dishId ?? ''), title: '', body: '' } });
  const [error, setError] = useState(null);

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    if (v.body.trim().length < 10) {
      form.setError('body', { message: 'Tell us a little more (at least 10 characters).' });
      return;
    }
    try {
      const r = await create.mutateAsync({
        order_reference: order.reference,
        dish_id: Number(v.dish_id),
        rating,
        title: v.title || undefined,
        body: v.body,
      });
      toast(r.message);
      onDone();
    } catch (e) {
      setError(applyServerErrors(e, form.setError, ['title', 'body']));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="border-line mt-5 flex flex-col gap-4 border-t pt-5">
      <label className="flex flex-col gap-2">
        <span className="eyebrow text-muted">Dish</span>
        <select
          {...form.register('dish_id')}
          className="border-input bg-surface-raised text-primary min-h-12 rounded-sm border px-4"
        >
          {dishes.map((d) => (
            <option key={d.dishId} value={d.dishId ?? ''}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="eyebrow text-muted">Rating</legend>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className={cn(
                'grid size-10 place-items-center text-2xl',
                n <= rating ? 'text-accent' : 'text-muted',
              )}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <TextField label="Headline (optional)" maxLength={120} {...form.register('title')} />
      <label className="flex flex-col gap-2">
        <span className="eyebrow text-muted">Your review</span>
        <textarea
          rows={4}
          maxLength={1500}
          aria-invalid={form.formState.errors.body ? true : undefined}
          className="border-input bg-surface-raised text-primary rounded-sm border px-4 py-3"
          {...form.register('body')}
        />
        {form.formState.errors.body && (
          <span role="alert" className="text-danger text-sm">
            {form.formState.errors.body.message}
          </span>
        )}
      </label>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" size="sm" loading={create.isPending}>
          Submit review
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------- Reservations */

export function ReservationsPanel() {
  const { data, error } = useMyReservations();
  if (!data) return <Loading error={error} />;
  if (data.length === 0) {
    return (
      <Empty action={<ButtonLink to="/reservations">Book a table</ButtonLink>}>No reservations yet.</Empty>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {data.map((r) => (
        <li
          key={r.code}
          className="border-line bg-surface-raised flex flex-wrap items-center gap-4 rounded-md border p-5"
        >
          <div className="mr-auto">
            <p className="font-serif text-xl">
              {longDate(r.date)} · {formatTime(r.time)}
            </p>
            <p className="text-secondary text-sm">
              {r.partySize} {r.partySize === 1 ? 'guest' : 'guests'} · {r.area?.name} ·{' '}
              <span className="font-mono">{r.code}</span>
            </p>
          </div>
          <span
            className={cn(
              'text-sm font-semibold capitalize',
              r.status === 'cancelled' ? 'text-danger' : 'text-accent',
            )}
          >
            {r.status.replace('_', ' ')}
          </span>
          <ButtonLink to={`/reservations/${r.code}`} size="sm" variant="secondary">
            View
          </ButtonLink>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- Addresses */

export function AddressesPanel() {
  const { data, error } = useAddresses();
  const remove = useDeleteAddress();
  const [editing, setEditing] = useState(null);
  if (!data) return <Loading error={error} />;

  return (
    <div className="flex flex-col gap-5">
      {data.length === 0 && !editing && <Empty>Save an address to check out faster.</Empty>}
      <ul className="grid gap-4 md:grid-cols-2">
        {data.map((a) => (
          <li key={a.id} className="border-line bg-surface-raised flex flex-col gap-2 rounded-md border p-5">
            <p className="flex items-center gap-3 font-semibold">
              {a.label}
              {a.isDefault && <Badge>Default</Badge>}
            </p>
            <p className="text-secondary text-sm">
              {[a.line1, a.line2, a.landmark, a.zoneName].filter(Boolean).join(', ')}
            </p>
            <div className="mt-2 flex gap-3">
              <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="hover:text-danger"
                loading={remove.isPending && remove.variables === a.id}
                onClick={() => remove.mutate(a.id)}
                aria-label={`Delete ${a.label}`}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <AddressEditor
          key={editing === 'new' ? 'new' : editing.id}
          address={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        data.length < 10 && (
          <Button variant="secondary" className="self-start" onClick={() => setEditing('new')}>
            Add an address
          </Button>
        )
      )}
    </div>
  );
}

function AddressEditor({ address, onDone }) {
  const save = useSaveAddress();
  const { data: site } = useSite();
  const [error, setError] = useState(null);
  const form = useForm({
    defaultValues: {
      label: address?.label ?? 'Home',
      line1: address?.line1 ?? '',
      line2: address?.line2 ?? '',
      landmark: address?.landmark ?? '',
      zone: address?.zone ?? '',
      phone: address?.phone ?? '',
      is_default: address?.isDefault ?? false,
    },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await save.mutateAsync({
        id: address?.id,
        ...v,
        line2: v.line2 || null,
        landmark: v.landmark || null,
        phone: v.phone || null,
      });
      onDone();
    } catch (err) {
      setError(
        applyServerErrors(err, form.setError, ['label', 'line1', 'line2', 'landmark', 'zone', 'phone']),
      );
    }
  });
  return (
    <form
      onSubmit={submit}
      noValidate
      className="border-line bg-surface-raised grid gap-5 rounded-md border p-6 sm:grid-cols-2"
    >
      <h3 className="text-2xl sm:col-span-2">{address ? 'Edit address' : 'New address'}</h3>
      <TextField
        label="Label"
        placeholder="Home, Office…"
        error={e.label?.message}
        {...form.register('label', { required: 'Give it a name.' })}
      />
      <label className="flex flex-col gap-2">
        <span className="eyebrow text-muted">Delivery area</span>
        <select
          {...form.register('zone', { required: 'Choose an area.' })}
          aria-invalid={e.zone ? true : undefined}
          className="border-input bg-surface-raised text-primary min-h-12 rounded-sm border px-4"
        >
          <option value="">Choose your area</option>
          {site?.deliveryZones.map((z) => (
            <option key={z.slug} value={z.slug}>
              {z.name}
            </option>
          ))}
        </select>
        {e.zone && (
          <span role="alert" className="text-danger text-sm">
            {e.zone.message}
          </span>
        )}
      </label>
      <TextField
        className="sm:col-span-2"
        label="Street address"
        autoComplete="address-line1"
        error={e.line1?.message}
        {...form.register('line1', { required: 'Enter the street address.' })}
      />
      <TextField
        label="Apartment, floor (optional)"
        autoComplete="address-line2"
        {...form.register('line2')}
      />
      <TextField label="Landmark (optional)" {...form.register('landmark')} />
      <TextField
        label="Phone for this address (optional)"
        type="tel"
        error={e.phone?.message}
        {...form.register('phone')}
      />
      <label className="text-secondary flex items-center gap-3 self-end text-sm">
        <input type="checkbox" className="accent-accent-fill size-5" {...form.register('is_default')} />
        Use as my default
      </label>
      {error && (
        <Alert tone="error" className="sm:col-span-2">
          {error}
        </Alert>
      )}
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" loading={save.isPending}>
          Save address
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- Reviews */

export function ReviewsPanel() {
  const { data, error } = useMyReviews();
  if (!data) return <Loading error={error} />;
  if (data.length === 0) {
    return <Empty>After a delivered order, you can review each dish from the Orders tab.</Empty>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {data.map((r) => (
        <li key={r.id} className="border-line bg-surface-raised rounded-md border p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-semibold">
              {r.dishSlug ? (
                <Link to={`/menu/${r.dishSlug}`} className="hover:text-accent">
                  {r.dish}
                </Link>
              ) : (
                r.dish
              )}
              <span className="text-accent ml-3" aria-label={`${r.rating} out of 5`}>
                {'★'.repeat(r.rating)}
              </span>
            </p>
            <span className="text-muted text-sm">
              {r.status === 'pending'
                ? 'Awaiting moderation'
                : r.status === 'approved'
                  ? 'Published'
                  : 'Hidden'}
            </span>
          </div>
          {r.title && <p className="mt-2 font-serif text-lg">{r.title}</p>}
          <p className="text-secondary mt-1 text-sm">{r.body}</p>
          {r.reply && (
            <p className="border-accent text-secondary mt-3 border-l-2 pl-4 text-sm">
              <span className="text-primary font-semibold">Small Africa replied:</span> {r.reply}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
