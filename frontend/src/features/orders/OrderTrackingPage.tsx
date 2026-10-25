import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { checkoutApi, type OrderStatus } from '@/features/checkout/api';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { steps } from './steps';

const FINISHED: OrderStatus[] = ['delivered', 'completed', 'cancelled'];

const lagosTime = (iso: string) =>
  new Date(iso.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? '' : '+01:00')).toLocaleString(
    'en-NG',
    {
      timeZone: 'Africa/Lagos',
      hour: 'numeric',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    },
  );

export function OrderTrackingPage() {
  const { reference = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const isNew = params.get('new') === '1';
  useSeo({ title: `Order ${reference.toUpperCase()}` });

  const {
    data: order,
    error,
    isPending,
  } = useQuery({
    queryKey: ['order', reference, token],
    queryFn: ({ signal }) => checkoutApi.track(reference, token, signal),
    // Live updates while the order is moving through the kitchen.
    refetchInterval: (q) => (q.state.data && FINISHED.includes(q.state.data.status) ? false : 20_000),
    refetchIntervalInBackground: false,
  });

  if (isPending) {
    return (
      <div className="container-luxe grid min-h-[50vh] place-items-center">
        <Spinner label="Loading your order" />
      </div>
    );
  }
  if (error || !order) {
    return (
      <>
        <PageHeader eyebrow="Order tracking" title="We couldn’t find that order" />
        <div className="container-luxe flex flex-col items-start gap-6 pb-24">
          <p className="text-secondary max-w-prose">
            {error instanceof ApiError && error.status === 404
              ? 'Check the link in your confirmation email, or sign in to see your orders.'
              : 'Something went wrong loading your order. Please refresh the page.'}
          </p>
          <ButtonLink to="/account">My orders</ButtonLink>
        </div>
      </>
    );
  }

  const flow = steps(order);
  const reached = new Map(order.history?.map((h) => [h.status, h.at]));
  const current = flow.findIndex((s) => s.status === order.status);
  const cancelled = order.status === 'cancelled';
  const awaitingPayment = order.status === 'pending_payment';

  return (
    <>
      <PageHeader
        eyebrow={`Order ${order.reference}`}
        title={isNew ? `Thank you, ${order.customerName.split(' ')[0]}` : 'Your order'}
        intro={
          isNew
            ? 'Your order is confirmed and a receipt is on its way to your inbox. This page updates as the kitchen works.'
            : undefined
        }
      />
      <div className="container-luxe grid gap-10 pb-24 lg:grid-cols-[1.3fr_1fr]">
        <section
          aria-labelledby="progress"
          className="border-line bg-surface-raised rounded-md border p-6 sm:p-8"
        >
          <h2 id="progress" className="text-2xl">
            Progress
          </h2>
          {cancelled && (
            <Alert tone="error" className="mt-6">
              This order was cancelled. If you were charged, your refund is on its way to the original card.
            </Alert>
          )}
          {awaitingPayment && (
            <Alert tone="info" className="mt-6">
              We’re waiting for payment confirmation. This usually takes a few seconds.
            </Alert>
          )}
          {!cancelled && (
            <ol className="mt-6 flex flex-col" aria-live="polite">
              {flow.map((s, i) => {
                const done = current >= i;
                const at = reached.get(s.status);
                return (
                  <li
                    key={s.status}
                    className="relative flex gap-4 pb-8 last:pb-0"
                    aria-current={i === current ? 'step' : undefined}
                  >
                    {i < flow.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5',
                          current > i ? 'bg-accent-fill' : 'bg-line',
                        )}
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold',
                        done ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-line text-muted',
                        i === current && !FINISHED.includes(order.status) && 'ring-accent-fill/30 ring-4',
                      )}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <div>
                      <p className={cn('font-semibold', !done && 'text-muted')}>
                        {s.label}
                        <span className="sr-only">{done ? ' (done)' : ' (not yet)'}</span>
                      </p>
                      <p className="text-secondary text-sm">{at ? lagosTime(at) : s.hint}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <dl className="border-line mt-8 grid gap-3 border-t pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="eyebrow text-muted">
                {order.fulfilment === 'delivery' ? 'Delivering to' : 'Pickup from'}
              </dt>
              <dd className="mt-1">
                {order.fulfilment === 'delivery'
                  ? (order.deliveryArea ?? order.zone?.name)
                  : 'Small Africa, Victoria Island'}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-muted">{order.scheduledFor ? 'Scheduled for' : 'Estimated'}</dt>
              <dd className="mt-1">
                {order.scheduledFor
                  ? lagosTime(order.scheduledFor)
                  : order.fulfilment === 'delivery'
                    ? `About ${order.zone?.etaMinutes ?? 45} minutes after preparing`
                    : 'About 30 minutes'}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="border-line bg-surface-raised flex h-fit flex-col gap-4 rounded-md border p-6">
          <h2 className="text-2xl">Receipt</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {order.items?.map((l, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>
                  {l.quantity} ×{' '}
                  {l.slug ? (
                    <Link to={`/menu/${l.slug}`} className="hover:text-accent">
                      {l.name}
                    </Link>
                  ) : (
                    l.name
                  )}
                  {(l.portion || l.addons.length > 0) && (
                    <span className="text-muted block text-xs">
                      {[l.portion?.name, ...l.addons.map((a) => a.name)].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="shrink-0">{formatNaira(l.lineTotalKobo)}</span>
              </li>
            ))}
          </ul>
          <dl className="border-line grid grid-cols-[1fr_auto] gap-y-2 border-t pt-4 text-sm">
            <dt className="text-secondary">Subtotal</dt>
            <dd>{formatNaira(order.subtotalKobo)}</dd>
            {order.discountKobo > 0 && (
              <>
                <dt className="text-success">Discount</dt>
                <dd className="text-success">−{formatNaira(order.discountKobo)}</dd>
              </>
            )}
            {order.voucherDiscountKobo > 0 && (
              <>
                <dt className="text-success">Reward voucher</dt>
                <dd className="text-success">−{formatNaira(order.voucherDiscountKobo)}</dd>
              </>
            )}
            {order.deliveryFeeKobo > 0 && (
              <>
                <dt className="text-secondary">
                  {order.fulfilment === 'delivery' ? 'Delivery & packaging' : 'Packaging'}
                </dt>
                <dd>{formatNaira(order.deliveryFeeKobo)}</dd>
              </>
            )}
            {order.walletAppliedKobo > 0 && (
              <>
                <dt className="text-secondary">Paid with dining credit</dt>
                <dd>{formatNaira(order.walletAppliedKobo)}</dd>
              </>
            )}
            <dt className="mt-2 font-semibold">
              {order.walletAppliedKobo > 0 ? 'Paid by card' : 'Total paid'}
            </dt>
            <dd className="text-accent mt-2 font-semibold">{formatNaira(order.totalKobo)}</dd>
            <dt className="text-muted col-span-2 text-xs">
              Includes VAT of {formatNaira(order.vatIncludedKobo)}
            </dt>
          </dl>
          {order.pointsEarned > 0 && (
            <p className="text-accent text-sm font-semibold">
              +{order.pointsEarned.toLocaleString('en-NG')} Interest Account points earned
            </p>
          )}
          <p className="text-muted text-xs">
            Questions? Call or WhatsApp us with your order number{' '}
            <strong className="text-primary">{order.reference}</strong>.
          </p>
          <ButtonLink to="/menu" variant="secondary">
            Order something else
          </ButtonLink>
        </aside>
      </div>
    </>
  );
}
