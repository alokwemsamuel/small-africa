import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { useAddresses } from '@/features/account/hooks';
import { useMe } from '@/features/auth/hooks';
import { cart, useCart } from '@/features/cart/cart';
import { useSite } from '@/features/menu/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { useLoyalty } from '@/features/rewards/api';
import { checkoutApi, type CheckoutRequest, type Order } from './api';
import { formatTime, scheduleOptions } from './schedule';
import { usePaymentPopup } from './usePaymentPopup';

const phone = /^(\+?234|0)[789][01]\d{8}$|^\+[1-9]\d{7,14}$/;
const contactSchema = z.object({
  name: z.string().trim().min(1, { error: 'Your name is required.' }).max(160),
  email: z.email({ error: 'Enter a valid email address.' }),
  phone: z
    .string()
    .trim()
    .refine((v) => phone.test(v.replace(/[\s\-()]/g, '')), { error: 'Enter a valid phone number.' }),
  line1: z.string().trim().max(160),
  line2: z.string().trim().max(160),
  landmark: z.string().trim().max(160),
  notes: z.string().trim().max(500),
});
type Contact = z.infer<typeof contactSchema>;

export function CheckoutPage() {
  useSeo({ title: 'Checkout' });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { items, count } = useCart();
  const { data: user } = useMe();
  const { data: site } = useSite();
  const { data: addresses } = useAddresses(!!user);
  const { data: loyalty } = useLoyalty(!!user);
  const vouchers = loyalty?.vouchers.filter((v) => !v.dineInOnly) ?? [];

  const [fulfilment, setFulfilment] = useState<'delivery' | 'pickup'>('delivery');
  const [zone, setZone] = useState('');
  const [addressId, setAddressId] = useState<number | 'new'>('new');
  const [when, setWhen] = useState<'asap' | 'later'>('asap');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [confirmAge, setConfirmAge] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [voucher, setVoucher] = useState('');
  const payment = usePaymentPopup();
  const idem = useRef<{ sig: string; key: string } | null>(null);

  const form = useForm<Contact>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', phone: '', line1: '', line2: '', landmark: '', notes: '' },
  });
  useEffect(() => {
    if (user) {
      form.reset({
        ...form.getValues(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone ?? '',
      });
    }
  }, [user, form]);
  // Pre-select the default saved address.
  useEffect(() => {
    const def = addresses?.find((a) => a.isDefault) ?? addresses?.[0];
    if (def && addressId === 'new') {
      setAddressId(def.id);
      if (def.zone) setZone(def.zone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses]);

  const schedule = useMemo(() => scheduleOptions(site?.openingHours ?? []), [site?.openingHours]);
  const scheduledFor = when === 'later' && schedDate && schedTime ? `${schedDate} ${schedTime}` : null;
  // Email only matters to the quote for per-guest coupon limits, so re-quote once typing pauses
  // and the address looks complete, not on every keystroke.
  const typedEmail = form.watch('email');
  const [email, setEmail] = useState('');
  useEffect(() => {
    const next = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(typedEmail) ? typedEmail : '';
    const t = setTimeout(() => setEmail(next), 600);
    return () => clearTimeout(t);
  }, [typedEmail]);

  const baseReq: CheckoutRequest = {
    fulfilment,
    zone: fulfilment === 'delivery' ? zone || null : null,
    scheduled_for: scheduledFor,
    coupon_code: coupon,
    voucher_code: voucher || null,
    use_wallet: !!user && useWallet,
    confirm_age: confirmAge,
    email: email || null,
  };
  const quoteReady = count > 0 && (fulfilment === 'pickup' || !!zone) && (when === 'asap' || !!scheduledFor);
  const quote = useQuery({
    queryKey: ['checkout', 'quote', items, baseReq],
    queryFn: ({ signal }) => checkoutApi.quote(items, baseReq, signal),
    enabled: quoteReady,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const quoteError = quote.error instanceof ApiError ? quote.error : null;
  const needsAge = !!quoteError?.fields.confirm_age;

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError(null);
    try {
      await checkoutApi.quote(items, { ...baseReq, coupon_code: code });
      setCoupon(code);
    } catch (e) {
      setCouponError(e instanceof ApiError ? (e.fields.coupon_code ?? e.message) : 'Please try again.');
    }
  };

  const pay = form.handleSubmit(async (c) => {
    setPayError(null);
    const saved = addresses?.find((a) => a.id === addressId);
    if (fulfilment === 'delivery' && addressId === 'new' && !c.line1) {
      form.setError('line1', { message: 'Enter your street address.' });
      return;
    }
    const req: CheckoutRequest = {
      ...baseReq,
      name: c.name,
      email: c.email,
      phone: c.phone,
      notes: c.notes || null,
      save_address: !!user && addressId === 'new' && saveAddress,
      address:
        fulfilment === 'delivery'
          ? saved
            ? {
                line1: saved.line1,
                line2: saved.line2,
                landmark: saved.landmark,
                area: saved.zoneName,
                label: saved.label,
              }
            : {
                line1: c.line1,
                line2: c.line2 || null,
                landmark: c.landmark || null,
                area: site?.deliveryZones.find((z) => z.slug === zone)?.name ?? null,
              }
          : undefined,
    };
    const sig = JSON.stringify([items, req]);
    if (idem.current?.sig !== sig) idem.current = { sig, key: crypto.randomUUID() };

    setPaying(true);
    try {
      const placed = await checkoutApi.place(items, req, idem.current.key);
      let order: Order = placed.order;
      if (placed.payment) {
        const result = await payment.open(placed.payment, {
          amountKobo: placed.order.totalKobo,
          email: c.email,
          reference: placed.order.reference,
        });
        order =
          result.kind === 'simulated'
            ? await checkoutApi.simulate(placed.order.reference, result.outcome)
            : await checkoutApi.verify(placed.order.reference);
      }
      if (order.paymentStatus === 'paid') {
        cart.clear();
        void qc.invalidateQueries({ queryKey: ['account'] });
        navigate(`/orders/${order.reference}?t=${encodeURIComponent(placed.trackingToken)}&new=1`, {
          replace: true,
        });
        return;
      }
      setPayError(
        order.paymentStatus === 'failed'
          ? 'Your payment was declined. No money was taken. Please try again or use another card.'
          : 'Payment wasn’t completed. Your order is saved: press Pay again whenever you’re ready.',
      );
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) {
        setPayError(Object.values(e.fields)[0] ?? e.message);
      } else {
        setPayError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setPaying(false);
    }
  });

  if (count === 0) {
    return (
      <>
        <PageHeader eyebrow="Checkout" title="Your order is empty" />
        <div className="container-luxe pb-24">
          <ButtonLink to="/menu">Browse the menu</ButtonLink>
        </div>
      </>
    );
  }

  const q = quote.data;
  const e = form.formState.errors;
  return (
    <>
      <PageHeader eyebrow="Checkout" title="Almost at the table" />
      <form onSubmit={pay} noValidate className="container-luxe grid gap-10 pb-24 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-8">
          <Section n={1} title="Delivery or pickup">
            <div role="radiogroup" aria-label="Delivery or pickup" className="grid gap-3 sm:grid-cols-2">
              {(['delivery', 'pickup'] as const).map((f) => (
                <Choice
                  key={f}
                  checked={fulfilment === f}
                  onChange={() => setFulfilment(f)}
                  name="fulfilment"
                  title={f === 'delivery' ? 'Delivery' : 'Pickup'}
                >
                  {f === 'delivery' ? 'Across Lagos, from ₦2,000' : 'Collect from Victoria Island, free'}
                </Choice>
              ))}
            </div>
          </Section>

          {fulfilment === 'delivery' && (
            <Section n={2} title="Where should we deliver?">
              {addresses && addresses.length > 0 && (
                <div role="radiogroup" aria-label="Saved addresses" className="mb-5 grid gap-3">
                  {addresses.map((a) => (
                    <Choice
                      key={a.id}
                      name="address"
                      checked={addressId === a.id}
                      onChange={() => {
                        setAddressId(a.id);
                        if (a.zone) setZone(a.zone);
                      }}
                      title={a.label}
                    >
                      {a.line1}
                      {a.zoneName && ` · ${a.zoneName}`}
                    </Choice>
                  ))}
                  <Choice
                    name="address"
                    checked={addressId === 'new'}
                    onChange={() => setAddressId('new')}
                    title="A new address"
                  >
                    Enter it below
                  </Choice>
                </div>
              )}
              <label className="flex flex-col gap-2">
                <span className="eyebrow text-muted">Delivery area</span>
                <select
                  value={zone}
                  onChange={(ev) => setZone(ev.target.value)}
                  disabled={addressId !== 'new' && !!addresses?.find((a) => a.id === addressId)?.zone}
                  className="border-input bg-surface-inset text-primary focus:border-accent min-h-12 rounded-sm border px-4 focus:outline-none"
                >
                  <option value="">Choose your area</option>
                  {site?.deliveryZones.map((z) => (
                    <option key={z.slug} value={z.slug}>
                      {z.name}: {formatNaira(z.feeKobo)} · about {z.etaMinutes} min
                    </option>
                  ))}
                </select>
              </label>
              {addressId === 'new' && (
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <TextField
                    className="sm:col-span-2"
                    label="Street address"
                    autoComplete="address-line1"
                    error={e.line1?.message}
                    {...form.register('line1')}
                  />
                  <TextField
                    label="Apartment, floor (optional)"
                    autoComplete="address-line2"
                    {...form.register('line2')}
                  />
                  <TextField
                    label="Landmark (optional)"
                    placeholder="e.g. opposite the bank"
                    {...form.register('landmark')}
                  />
                  {user && (
                    <label className="text-secondary flex items-center gap-3 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(ev) => setSaveAddress(ev.target.checked)}
                        className="accent-accent-fill size-5"
                      />
                      Save this address to my account
                    </label>
                  )}
                </div>
              )}
            </Section>
          )}

          <Section n={fulfilment === 'delivery' ? 3 : 2} title="When?">
            <div role="radiogroup" aria-label="When" className="grid gap-3 sm:grid-cols-2">
              <Choice
                name="when"
                checked={when === 'asap'}
                onChange={() => setWhen('asap')}
                title="As soon as possible"
              >
                {fulfilment === 'delivery'
                  ? 'Cooked to order, then straight to you'
                  : 'Ready in about 30 minutes'}
              </Choice>
              <Choice
                name="when"
                checked={when === 'later'}
                onChange={() => setWhen('later')}
                title="Schedule for later"
              >
                Up to 7 days ahead
              </Choice>
            </div>
            {when === 'later' && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="eyebrow text-muted">Day</span>
                  <select
                    value={schedDate}
                    onChange={(ev) => {
                      setSchedDate(ev.target.value);
                      setSchedTime('');
                    }}
                    className="border-input bg-surface-inset text-primary focus:border-accent min-h-12 rounded-sm border px-4 focus:outline-none"
                  >
                    <option value="">Choose a day</option>
                    {schedule.map((d) => (
                      <option key={d.date} value={d.date}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="eyebrow text-muted">Time</span>
                  <select
                    value={schedTime}
                    onChange={(ev) => setSchedTime(ev.target.value)}
                    disabled={!schedDate}
                    className="border-input bg-surface-inset text-primary focus:border-accent min-h-12 rounded-sm border px-4 focus:outline-none disabled:opacity-60"
                  >
                    <option value="">Choose a time</option>
                    {schedule
                      .find((d) => d.date === schedDate)
                      ?.times.map((t) => (
                        <option key={t} value={t}>
                          {formatTime(t)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}
          </Section>

          <Section n={fulfilment === 'delivery' ? 4 : 3} title="Your details">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Full name"
                autoComplete="name"
                error={e.name?.message}
                {...form.register('name')}
              />
              <TextField
                label="Phone"
                type="tel"
                autoComplete="tel"
                hint="For your rider and order updates."
                error={e.phone?.message}
                {...form.register('phone')}
              />
              <TextField
                className="sm:col-span-2"
                label="Email"
                type="email"
                autoComplete="email"
                hint="We’ll send your receipt and tracking link here."
                error={e.email?.message}
                {...form.register('email')}
              />
              <label className="flex flex-col gap-2 sm:col-span-2">
                <span className="eyebrow text-muted">Notes for the kitchen or rider (optional)</span>
                <textarea
                  rows={3}
                  className="border-input bg-surface-inset text-primary focus:border-accent rounded-sm border px-4 py-3 focus:outline-none"
                  placeholder="Allergies, spice preference, gate code…"
                  {...form.register('notes')}
                />
              </label>
            </div>
            {!user && (
              <p className="text-muted mt-4 text-sm">
                <Link to="/login" state={{ from: '/checkout' }} className="text-accent underline">
                  Sign in
                </Link>{' '}
                to earn points on this order and save your address.
              </p>
            )}
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-line bg-surface-raised flex flex-col gap-5 rounded-md border p-6">
            <h2 className="text-3xl">Your order</h2>
            <ul className="flex flex-col gap-3 text-sm">
              {(
                q?.lines ??
                items.map((l) => ({
                  ...l,
                  lineTotalKobo: l.unitPriceKobo * l.quantity,
                  portion: l.portionName ? { name: l.portionName } : null,
                  addons: l.addonNames.map((n) => ({ name: n })),
                }))
              ).map((l, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>
                    {l.quantity} × {l.name}
                    {(l.portion || l.addons.length > 0) && (
                      <span className="text-muted block text-xs">
                        {[l.portion?.name, ...l.addons.map((a) => a.name)].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {l.containsPork && (
                      <span className="text-accent block text-xs font-semibold">Contains pork</span>
                    )}
                  </span>
                  <span className="shrink-0">{formatNaira(l.lineTotalKobo)}</span>
                </li>
              ))}
            </ul>
            <Link to="/cart" className="text-accent self-start text-sm underline">
              Edit order
            </Link>

            <div className="border-line border-t pt-5">
              <label htmlFor="coupon" className="eyebrow text-muted">
                Coupon code
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="coupon"
                  value={couponInput}
                  onChange={(ev) => setCouponInput(ev.target.value)}
                  placeholder="e.g. WELCOME10"
                  aria-invalid={couponError ? true : undefined}
                  aria-describedby={couponError ? 'coupon-error' : undefined}
                  className="border-input bg-surface-inset text-primary focus:border-accent min-h-11 flex-1 rounded-sm border px-4 uppercase placeholder:normal-case focus:outline-none"
                />
                {coupon ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setCoupon(null);
                      setCouponInput('');
                    }}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={applyCoupon} disabled={!quoteReady}>
                    Apply
                  </Button>
                )}
              </div>
              {couponError && (
                <p id="coupon-error" role="alert" className="text-danger mt-2 text-sm">
                  {couponError}
                </p>
              )}
              {q?.coupon && <p className="text-success mt-2 text-sm">{q.coupon.description}</p>}
            </div>

            {user && vouchers.length > 0 && (
              <label className="flex flex-col gap-2">
                <span className="eyebrow text-muted">Reward voucher</span>
                <select
                  value={voucher}
                  onChange={(ev) => setVoucher(ev.target.value)}
                  className="border-input bg-surface-inset text-primary focus:border-accent min-h-11 rounded-sm border px-4 focus:outline-none"
                >
                  <option value="">Don’t use a voucher</option>
                  {vouchers.map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.title} ({v.code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {user && loyalty && loyalty.wallet.balanceKobo > 0 && (
              <label className="border-accent/40 bg-accent-fill/5 grid grid-cols-[auto_1fr] items-start gap-x-3 rounded-md border p-4 text-sm">
                <input
                  type="checkbox"
                  checked={useWallet}
                  onChange={(ev) => setUseWallet(ev.target.checked)}
                  className="accent-accent-fill mt-0.5 size-5"
                />
                <span className="font-semibold">Use my dining credit</span>
                <span className="text-secondary col-start-2">
                  {formatNaira(loyalty.wallet.balanceKobo)} available in your Interest Account
                </span>
              </label>
            )}

            {needsAge && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmAge}
                  onChange={(ev) => setConfirmAge(ev.target.checked)}
                  className="accent-accent-fill mt-0.5 size-5"
                />
                I confirm I am 18 or over. ID may be checked on delivery.
              </label>
            )}

            <dl className="border-line grid grid-cols-[1fr_auto] gap-y-2 border-t pt-5 text-sm">
              {q ? (
                <>
                  <dt className="text-secondary">Subtotal</dt>
                  <dd>{formatNaira(q.subtotalKobo)}</dd>
                  {q.discountKobo > 0 && (
                    <>
                      <dt className="text-success">Discount ({q.coupon?.code})</dt>
                      <dd className="text-success">−{formatNaira(q.discountKobo)}</dd>
                    </>
                  )}
                  {q.voucher && (
                    <>
                      <dt className="text-success">{q.voucher.title}</dt>
                      <dd className="text-success">−{formatNaira(q.voucherDiscountKobo)}</dd>
                    </>
                  )}
                  {q.fulfilment === 'delivery' && (
                    <>
                      <dt className="text-secondary">Delivery · {q.zone?.name}</dt>
                      <dd className={q.freeDeliveryPerk ? 'text-success' : undefined}>
                        {q.freeDeliveryPerk ? 'Free (member perk)' : formatNaira(q.deliveryFeeKobo)}
                      </dd>
                    </>
                  )}
                  <dt className="text-secondary">Packaging</dt>
                  <dd>{formatNaira(q.packagingFeeKobo)}</dd>
                  <dt className="mt-2 text-lg font-semibold">Total</dt>
                  <dd className="text-accent mt-2 text-lg font-semibold">{formatNaira(q.totalKobo)}</dd>
                  <dt className="text-muted col-span-2 text-xs">
                    Includes VAT of {formatNaira(q.vatIncludedKobo)}
                  </dt>
                  {q.walletAppliedKobo > 0 && (
                    <>
                      <dt className="text-secondary mt-2">Dining credit</dt>
                      <dd className="mt-2">−{formatNaira(q.walletAppliedKobo)}</dd>
                      <dt className="font-semibold">To pay by card</dt>
                      <dd className="text-accent font-semibold">{formatNaira(q.payableKobo)}</dd>
                    </>
                  )}
                </>
              ) : (
                <dd className="text-muted col-span-2">
                  {quote.isFetching ? (
                    <Spinner label="Updating totals" />
                  ) : fulfilment === 'delivery' && !zone ? (
                    'Choose your delivery area to see the total.'
                  ) : (
                    'Choose a time to see the total.'
                  )}
                </dd>
              )}
            </dl>
            {quoteError && !quoteError.fields.confirm_age && (
              <Alert tone="error">{Object.values(quoteError.fields)[0] ?? quoteError.message}</Alert>
            )}
            {payError && <Alert tone="error">{payError}</Alert>}
            <Button type="submit" size="lg" loading={paying} disabled={!q || !!quoteError || paying}>
              {!q
                ? 'Pay'
                : q.payableKobo === 0
                  ? 'Place order with dining credit'
                  : `Pay ${formatNaira(q.payableKobo)}`}
            </Button>
            <p className="text-muted text-center text-xs">
              Secure payment by Paystack. We never see your card details.
            </p>
          </div>
        </aside>
      </form>
      {payment.popup}
    </>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section
      aria-labelledby={`step-${n}`}
      className="border-line bg-surface-raised rounded-md border p-6 sm:p-8"
    >
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-2xl">
        <span className="border-accent text-accent grid size-8 place-items-center rounded-full border font-sans text-sm font-semibold">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Choice({
  name,
  checked,
  onChange,
  title,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        'grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 rounded-md border p-4 transition-colors',
        'has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
        checked ? 'border-accent bg-accent-fill/10' : 'border-line hover:border-input',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="accent-accent-fill mt-1 size-4"
      />
      <span className="font-semibold">{title}</span>
      <span className="text-secondary col-start-2 text-sm">{children}</span>
    </label>
  );
}
