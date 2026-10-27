import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { adminApi, can, useAdminMe } from '../api';
import {
  AdminHeader,
  Empty,
  InputField,
  Loading,
  Modal,
  Pager,
  Panel,
  SearchBox,
  SelectField,
  StatusPill,
  TextAreaField,
} from '../ui';
import { fmt, tdClass, thClass } from '../format';

const STATUS_FILTERS = [
  ['received,preparing,ready,out_for_delivery', 'Active'],
  ['', 'All'],
  ['received', 'Received'],
  ['preparing', 'Preparing'],
  ['ready', 'Ready'],
  ['out_for_delivery', 'Out for delivery'],
  ['delivered,completed', 'Done'],
  ['cancelled', 'Cancelled'],
];

const ACTION_LABEL = {
  preparing: 'Start preparing',
  ready: 'Mark ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Mark delivered',
  completed: 'Mark collected',
  cancelled: 'Cancel order',
};

export function OrdersPage() {
  const { reference } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get('status') ?? 'received,preparing,ready,out_for_delivery';
  const page = Number(params.get('page') ?? 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const set = (k, v) =>
    setParams(
      (p) => {
        if (v) p.set(k, v);
        else p.delete(k);
        if (k !== 'page') p.delete('page');
        return p;
      },
      { replace: true },
    );

  const filters = {
    status,
    q: params.get('q'),
    date: params.get('date'),
    fulfilment: params.get('fulfilment'),
    refund: params.get('refund') === '1',
    page,
  };
  const list = useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: ({ signal }) => adminApi.orders(filters, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader title="Orders" intro="Paid online orders. Active orders refresh every 30 seconds." />
      <div className="flex flex-wrap items-end gap-3">
        <form
          className="flex min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set('q', q.trim());
          }}
        >
          <SearchBox value={q} onChange={setQ} placeholder="Reference, name, email or phone" />
        </form>
        <SelectField
          label="Status"
          value={status}
          onChange={(v) => set('status', v)}
          options={STATUS_FILTERS}
          className="w-44"
        />
        <SelectField
          label="Type"
          value={params.get('fulfilment') ?? ''}
          onChange={(v) => set('fulfilment', v)}
          options={[
            ['', 'Delivery and pickup'],
            ['delivery', 'Delivery'],
            ['pickup', 'Pickup'],
          ]}
          className="w-44"
        />
        <InputField
          label="Day"
          type="date"
          value={params.get('date') ?? ''}
          onChange={(e) => set('date', e.target.value)}
          className="w-44"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.refund}
            onChange={(e) => set('refund', e.target.checked ? '1' : '')}
            className="accent-accent-fill size-4"
          />
          Refund flagged
        </label>
      </div>

      <Panel>
        {!list.data ? (
          <Loading error={list.error} />
        ) : list.data.items.length === 0 ? (
          <Empty>No orders match these filters.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem]">
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    Order
                  </th>
                  <th scope="col" className={thClass}>
                    Status
                  </th>
                  <th scope="col" className={thClass}>
                    Customer
                  </th>
                  <th scope="col" className={thClass}>
                    Type
                  </th>
                  <th scope="col" className={thClass}>
                    Placed
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((o) => (
                  <tr
                    key={o.reference}
                    className={o.reference === reference ? 'bg-accent-fill/10' : undefined}
                  >
                    <td className={tdClass}>
                      <Link
                        to={`/admin/orders/${o.reference}?${params.toString()}`}
                        className="hover:text-accent font-mono font-semibold"
                      >
                        {o.reference}
                      </Link>
                      {o.refundFlag && <span className="text-danger ml-2 text-xs font-semibold">Refund</span>}
                    </td>
                    <td className={tdClass}>
                      <StatusPill status={o.status} />
                    </td>
                    <td className={tdClass}>
                      {o.customerName}
                      <span className="text-muted block text-xs">
                        {o.items} {o.items === 1 ? 'item' : 'items'}
                      </span>
                    </td>
                    <td className={tdClass}>{o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</td>
                    <td className={tdClass}>
                      {fmt.dateTime(o.placedAt)}
                      {o.scheduledFor && (
                        <span className="text-accent block text-xs">For {fmt.dateTime(o.scheduledFor)}</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>{formatNaira(o.totalKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && (
          <Pager page={list.data.page} pages={list.data.pages} onPage={(p) => set('page', String(p))} />
        )}
      </Panel>

      {reference && (
        <OrderDetail reference={reference} onClose={() => navigate(`/admin/orders?${params.toString()}`)} />
      )}
    </div>
  );
}

function OrderDetail({ reference, onClose }) {
  const qc = useQueryClient();
  const { data: me } = useAdminMe();
  const { data: order, error } = useQuery({
    queryKey: ['admin', 'order', reference],
    queryFn: ({ signal }) => adminApi.order(reference, signal),
  });
  const [busy, setBusy] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [refund, setRefund] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);

  const update = (o) => {
    qc.setQueryData(['admin', 'order', reference], o);
    void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };
  const move = async (to, reason) => {
    setErr(null);
    setBusy(to);
    try {
      update(await adminApi.setOrderStatus(reference, to, reason));
      toast(`${reference}: ${fmt.label(to).toLowerCase()}`);
      setCancelling(false);
      setNote('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };
  const flag = async (value) => {
    setErr(null);
    try {
      update(await adminApi.refundFlag(reference, value, note));
      setRefund(false);
      setNote('');
    } catch (e) {
      setErr(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Please try again.');
    }
  };

  return (
    <Modal title={`Order ${reference}`} onClose={onClose} wide>
      {!order ? (
        <Loading error={error} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={order.status} />
            <StatusPill
              status={order.paymentStatus === 'paid' ? 'active' : 'failed'}
              label={`Payment: ${fmt.label(order.paymentStatus)}`}
            />
            {order.refundFlag && <StatusPill status="cancelled" label="Refund flagged" />}
            <Link
              to={`/admin/orders/${reference}/ticket`}
              target="_blank"
              rel="noopener"
              className="text-accent ml-auto text-sm underline"
            >
              Print kitchen ticket
            </Link>
          </div>

          {err && <Alert tone="error">{err}</Alert>}
          {can(me, 'orders.status') && order.nextStatuses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {order.nextStatuses
                .filter((s) => s !== 'cancelled')
                .map((s) => (
                  <Button key={s} size="sm" loading={busy === s} onClick={() => move(s)}>
                    {ACTION_LABEL[s] ?? fmt.label(s)}
                  </Button>
                ))}
              {order.nextStatuses.includes('cancelled') && !cancelling && (
                <Button size="sm" variant="danger" onClick={() => setCancelling(true)}>
                  Cancel order
                </Button>
              )}
            </div>
          )}
          {cancelling && (
            <div className="border-danger/50 flex flex-col gap-3 rounded-md border p-4">
              <TextAreaField
                label="Reason (shown in the order history)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={255}
              />
              <p className="text-secondary text-xs">
                Any dining credit or voucher used is returned automatically. Card payments must be refunded in
                Paystack; flag the refund below.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy === 'cancelled'}
                  disabled={note.trim().length < 3}
                  onClick={() => move('cancelled', note)}
                >
                  Confirm cancellation
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>
                  Keep order
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="eyebrow text-muted">Items</h3>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {order.items?.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3">
                    <span>
                      <strong>{i.quantity} ×</strong> {i.name}
                      {(i.portion || i.addons.length > 0) && (
                        <span className="text-muted block text-xs">
                          {[i.portion?.name, ...i.addons.map((a) => a.name)].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {i.containsPork && (
                        <span className="text-accent block text-xs font-semibold">Contains pork</span>
                      )}
                      {i.note && <span className="text-accent block text-xs">Note: {i.note}</span>}
                    </span>
                    <span className="tabular-nums">{formatNaira(i.lineTotalKobo)}</span>
                  </li>
                ))}
              </ul>
              <dl className="border-line mt-3 grid grid-cols-[1fr_auto] gap-y-1 border-t pt-3 text-sm">
                <dt className="text-secondary">Subtotal</dt>
                <dd className="tabular-nums">{formatNaira(order.subtotalKobo)}</dd>
                {order.discountKobo > 0 && (
                  <>
                    <dt className="text-secondary">Coupon {order.coupon}</dt>
                    <dd className="tabular-nums">−{formatNaira(order.discountKobo)}</dd>
                  </>
                )}
                {order.voucherDiscountKobo > 0 && (
                  <>
                    <dt className="text-secondary">Reward voucher</dt>
                    <dd className="tabular-nums">−{formatNaira(order.voucherDiscountKobo)}</dd>
                  </>
                )}
                <dt className="text-secondary">Delivery & packaging</dt>
                <dd className="tabular-nums">{formatNaira(order.deliveryFeeKobo)}</dd>
                {order.walletAppliedKobo > 0 && (
                  <>
                    <dt className="text-secondary">Dining credit</dt>
                    <dd className="tabular-nums">{formatNaira(order.walletAppliedKobo)}</dd>
                  </>
                )}
                <dt className="font-semibold">Paid by card</dt>
                <dd className="font-semibold tabular-nums">{formatNaira(order.totalKobo)}</dd>
              </dl>
              {order.notes && (
                <Alert tone="info" className="mt-3">
                  Customer note: {order.notes}
                </Alert>
              )}
            </div>
            <div className="flex flex-col gap-4 text-sm">
              <div>
                <h3 className="eyebrow text-muted">Customer</h3>
                <p className="mt-2 font-semibold">
                  {order.customer.userId && can(me, 'customers.view') ? (
                    <Link
                      to={`/admin/customers/${order.customer.userId}`}
                      className="hover:text-accent underline"
                    >
                      {order.customer.name}
                    </Link>
                  ) : (
                    order.customer.name
                  )}
                  {order.customer.tier && (
                    <span className="text-accent ml-2 text-xs">{fmt.label(order.customer.tier)} member</span>
                  )}
                </p>
                <p>
                  <a href={`tel:${order.customer.phone}`} className="text-accent underline">
                    {order.customer.phone}
                  </a>{' '}
                  · {order.customer.email}
                </p>
              </div>
              <div>
                <h3 className="eyebrow text-muted">
                  {order.fulfilment === 'delivery' ? 'Deliver to' : 'Pickup'}
                </h3>
                {order.address ? (
                  <p className="mt-2">
                    {[order.address.line1, order.address.line2, order.address.landmark, order.address.area]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                ) : (
                  <p className="mt-2">Collect from Victoria Island</p>
                )}
                {order.scheduledFor && (
                  <p className="text-accent font-semibold">
                    Scheduled for {fmt.dateTime(order.scheduledFor)}
                  </p>
                )}
              </div>
              <div>
                <h3 className="eyebrow text-muted">History</h3>
                <ol className="mt-2 flex flex-col gap-1">
                  {order.history.map((h, n) => (
                    <li key={n} className="flex flex-wrap gap-x-2">
                      <span className="text-muted w-28 shrink-0">{fmt.dateTime(h.at)}</span>
                      <span>
                        {fmt.label(h.status)}
                        {h.by && <span className="text-muted"> · {h.by}</span>}
                        {h.note && <span className="text-secondary block text-xs">{h.note}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="eyebrow text-muted">Payments</h3>
                <ul className="mt-2 flex flex-col gap-1">
                  {order.payments.map((p) => (
                    <li key={p.reference} className="flex flex-wrap gap-x-2">
                      <span className="font-mono text-xs">{p.reference}</span>
                      <span>
                        {fmt.label(p.provider)} · {formatNaira(p.amountKobo)} · {fmt.label(p.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {can(me, 'orders.refund') && (
            <div className="border-line border-t pt-4">
              {refund ? (
                <div className="flex flex-col gap-3">
                  <TextAreaField
                    label="Why? (kept in the history and audit log)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={255}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => flag(!order.refundFlag)}
                      disabled={note.trim().length < 5}
                    >
                      {order.refundFlag ? 'Clear refund flag' : 'Flag for refund'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRefund(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setRefund(true)}>
                  {order.refundFlag ? 'Clear refund flag' : 'Flag for refund'}
                </Button>
              )}
              <p className="text-muted mt-2 text-xs">
                Refunds to cards are made in the Paystack dashboard. The flag records that one is due.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
