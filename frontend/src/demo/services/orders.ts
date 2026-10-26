import { db, type Row } from '../db';
import { fail } from '../http';
import { code } from '../random';
import { sql } from '../time';
import { audit } from './audit';
import { ledger, onOrderCompleted } from './loyalty';
import { quote } from './pricing';

/** Port of App\Services\OrderService and PaymentAttempts, with the simulated gateway. */

export const TRANSITIONS: Record<string, string[]> = {
  received: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed'],
  out_for_delivery: ['delivered'],
  delivered: [],
  completed: [],
  cancelled: [],
  pending_payment: ['cancelled'],
};

const MAX_ATTEMPTS = 9;

/** Stands in for the API's HMAC tracking token: unguessable enough for a browser-only demo. */
export function trackingToken(reference: string): string {
  return `demo-${btoa(`track:${reference}`).replace(/[^A-Za-z0-9]/g, '')}`;
}

/* ----------------------------------------------------------- payment attempts */

export function latestPayment(purpose: string, payableId: number): Row | null {
  return (
    db
      .where('payments', (p) => p.purpose === purpose && p.payable_id === payableId)
      .sort((a, b) => b.attempt - a.attempt || b.id - a.id)[0] ?? null
  );
}

/** PaymentAttempts::start: resumes an open attempt, or opens a new one with a new reference. */
export function startPayment(
  purpose: string,
  payableId: number,
  userId: number | null,
  baseReference: string,
  amountKobo: number,
) {
  const rows = db
    .where('payments', (p) => p.purpose === purpose && p.payable_id === payableId)
    .sort((a, b) => b.attempt - a.attempt || b.id - a.id);
  if (rows.some((r) => r.status === 'success')) throw fail.conflict('This has already been paid.');
  let attempt = rows[0];
  if (!(attempt && attempt.status === 'initialized' && attempt.amount_kobo === amountKobo)) {
    const n = attempt ? attempt.attempt + 1 : 1;
    if (n > MAX_ATTEMPTS) {
      throw fail.conflict(
        'Too many payment attempts. Please contact us and we’ll help you finish your order.',
      );
    }
    attempt = db.insert('payments', {
      user_id: userId,
      purpose,
      payable_id: payableId,
      provider: 'simulated',
      reference: n === 1 ? baseReference : `${baseReference}-${n}`,
      attempt: n,
      amount_kobo: amountKobo,
      status: 'initialized',
      access_code: `demo_${code(10)}`,
    });
  }
  return {
    provider: 'simulated' as const,
    reference: attempt.reference,
    accessCode: attempt.access_code,
    authorizationUrl: null,
  };
}

/** The simulated gateway's answer for an attempt: whatever the guest chose in the popup. */
export function checkPayment(payment: Row): 'success' | 'failed' | 'abandoned' | 'pending' {
  const outcome = payment.provider_payload
    ? (JSON.parse(payment.provider_payload).simulated_outcome as string)
    : null;
  if (outcome === 'failed' || outcome === 'abandoned') {
    if (payment.status === 'initialized') payment.status = outcome;
    return outcome;
  }
  return outcome === 'success' ? 'success' : 'pending';
}

/** Marks an attempt successful exactly once. */
export function markSuccess(payment: Row): boolean {
  if (payment.status === 'success') return false;
  Object.assign(payment, { status: 'success', verified_at: sql() });
  return true;
}

/** Records the guest's choice in the simulated popup on the latest attempt. */
export function recordSimulatedOutcome(purpose: string, payableId: number, outcome: string): void {
  const latest = latestPayment(purpose, payableId);
  if (latest && latest.status === 'initialized')
    latest.provider_payload = JSON.stringify({ simulated_outcome: outcome });
}

/* --------------------------------------------------------------------- orders */

export function toPublic(o: Row, withDetail = false) {
  const zone = db.byId('delivery_zones', o.delivery_zone_id);
  const out: Row = {
    reference: o.reference,
    status: o.status,
    paymentStatus: o.payment_status,
    fulfilment: o.fulfilment,
    zone: zone ? { name: zone.name, etaMinutes: zone.eta_minutes } : null,
    scheduledFor: o.scheduled_for,
    placedAt: o.placed_at,
    createdAt: o.created_at,
    customerName: o.customer_name,
    subtotalKobo: o.subtotal_kobo,
    discountKobo: o.discount_kobo,
    voucherDiscountKobo: o.voucher_discount_kobo,
    deliveryFeeKobo: o.delivery_fee_kobo,
    serviceChargeKobo: o.service_charge_kobo,
    vatIncludedKobo: o.vat_included_kobo,
    walletAppliedKobo: o.wallet_applied_kobo,
    totalKobo: o.total_kobo,
    pointsEarned: o.points_earned,
  };
  if (withDetail) {
    out.items = db
      .where('order_items', (i) => i.order_id === o.id)
      .map((i) => {
        const opts = JSON.parse(i.options ?? '{}') as Row;
        return {
          dishId: i.dish_id,
          slug: db.byId('dishes', i.dish_id)?.slug ?? null,
          name: i.dish_name,
          quantity: i.quantity,
          unitPriceKobo: i.unit_price_kobo,
          lineTotalKobo: i.line_total_kobo,
          portion: opts.portion ?? null,
          addons: opts.addons ?? [],
          containsPork: !!opts.containsPork,
          note: i.notes,
        };
      });
    out.history = db
      .where('order_status_history', (h) => h.order_id === o.id)
      .map((h) => ({ status: h.status, at: h.created_at }));
    const address = o.address_snapshot ? (JSON.parse(o.address_snapshot) as Row) : null;
    out.deliveryArea = address ? (address.area ?? zone?.name ?? null) : null;
    out.reviewable = ['delivered', 'completed'].includes(o.status);
  }
  return out;
}

function resume(order: Row) {
  const token = trackingToken(order.reference);
  let payment = null;
  if (order.payment_status !== 'paid') {
    if (order.status === 'cancelled') {
      throw fail.conflict('This order expired before it was paid. Please place it again.', 'order_expired');
    }
    payment = startPayment('order', order.id, order.user_id, order.reference, order.total_kobo);
    if (order.payment_status === 'failed') order.payment_status = 'unpaid';
  }
  return { order: toPublic(order), payment, trackingToken: token, publicKey: null };
}

export function create(req: Row, user: Row | null, idempotencyKey: string | null) {
  if (idempotencyKey !== null) {
    const existing = db.find('orders', (o) => o.idempotency_key === idempotencyKey);
    if (existing) {
      if (existing.customer_email !== req.email) throw fail.conflict('This checkout was already submitted.');
      return resume(existing);
    }
  }
  const userId = user ? user.id : null;
  const q = quote(req, userId);
  let reference: string;
  do reference = code(6, 'SA-');
  while (db.find('orders', (o) => o.reference === reference));
  const now = sql();
  const order = db.insert('orders', {
    reference,
    user_id: userId,
    customer_name: req.name,
    customer_email: req.email,
    customer_phone: req.phone,
    fulfilment: q.fulfilment,
    delivery_zone_id: q.zone?.id ?? null,
    address_snapshot: q.fulfilment === 'delivery' ? JSON.stringify(req.address) : null,
    scheduled_for: q.scheduledFor ? `${q.scheduledFor}:00` : null,
    status: 'pending_payment',
    payment_status: 'unpaid',
    subtotal_kobo: q.subtotalKobo,
    discount_kobo: q.discountKobo,
    voucher_discount_kobo: q.voucherDiscountKobo,
    delivery_fee_kobo: q.deliveryFeeKobo + q.packagingFeeKobo,
    service_charge_kobo: q.serviceChargeKobo,
    vat_included_kobo: q.vatIncludedKobo,
    wallet_applied_kobo: q.walletAppliedKobo,
    total_kobo: q.payableKobo,
    coupon_id: q.coupon?.id ?? null,
    voucher_id: q.voucher?.id ?? null,
    notes: req.notes ?? null,
    idempotency_key: idempotencyKey,
    status_updated_at: now,
  });
  for (const l of q.lines) {
    db.insert('order_items', {
      order_id: order.id,
      dish_id: l.dishId,
      dish_name: l.name,
      kitchen_id: l.kitchenId,
      unit_price_kobo: l.unitPriceKobo,
      quantity: l.quantity,
      options: JSON.stringify({ portion: l.portion, addons: l.addons, containsPork: l.containsPork }),
      line_total_kobo: l.lineTotalKobo,
      notes: l.note,
    });
  }
  db.insert('order_status_history', { order_id: order.id, status: 'pending_payment' });
  if (q.voucher) {
    const v = db.byId('reward_vouchers', q.voucher.id);
    if (!v || v.status !== 'issued') throw fail.field('voucher_code', 'That voucher has just been used.');
    Object.assign(v, { status: 'used', used_order_id: order.id });
  }
  if (q.walletAppliedKobo > 0 && userId) {
    ledger.wallet(
      userId,
      'debit',
      'payment',
      q.walletAppliedKobo,
      `Order ${reference}`,
      reference,
      `order-wallet:${reference}`,
    );
  }
  if (q.payableKobo === 0) {
    db.insert('payments', {
      user_id: userId,
      purpose: 'order',
      payable_id: order.id,
      provider: 'wallet',
      reference: `${reference}-W`,
      amount_kobo: q.walletAppliedKobo,
      status: 'success',
      verified_at: now,
    });
    applyPaid(order);
  }
  audit(userId, 'order.created', 'order', reference, {
    total_kobo: order.total_kobo,
    wallet_kobo: order.wallet_applied_kobo,
  });
  if (order.payment_status === 'paid')
    audit(userId, 'order.paid', 'order', reference, { total_kobo: order.total_kobo });
  return resume(order);
}

function applyPaid(order: Row): void {
  const now = sql();
  Object.assign(order, {
    payment_status: 'paid',
    status: 'received',
    placed_at: now,
    status_updated_at: now,
  });
  db.insert('order_status_history', { order_id: order.id, status: 'received' });
  if (order.coupon_id) {
    db.insert('coupon_redemptions', {
      coupon_id: order.coupon_id,
      user_id: order.user_id,
      order_id: order.id,
      discount_kobo: order.discount_kobo,
    });
    const coupon = db.byId('coupons', order.coupon_id);
    if (coupon) coupon.times_used += 1;
  }
  for (const item of db.where('order_items', (i) => i.order_id === order.id)) {
    const dish = db.byId('dishes', item.dish_id);
    if (dish) dish.popularity += item.quantity;
  }
}

/** Confirms the latest payment attempt with the (simulated) gateway, never the browser. */
export function verifyPayment(reference: string) {
  const order = db.find('orders', (o) => o.reference === reference.toUpperCase());
  if (!order) throw fail.notFound('We couldn’t find that payment.');
  if (order.payment_status !== 'paid') {
    const payment = latestPayment('order', order.id);
    if (payment && payment.status !== 'success' && payment.provider !== 'wallet') {
      const result = checkPayment(payment);
      if (result === 'success' && markSuccess(payment)) {
        if (order.status === 'cancelled') {
          audit(null, 'payment.needs_refund', 'payment', payment.reference, { order: order.reference });
        } else {
          applyPaid(order);
          audit(order.user_id, 'order.paid', 'order', order.reference, { total_kobo: order.total_kobo });
        }
      } else if (result === 'failed' && order.payment_status === 'unpaid') {
        order.payment_status = 'failed';
      }
    }
  }
  return toPublic(order);
}

export function findForTracking(reference: string, user: Row | null, token: string | null) {
  const order = db.find('orders', (o) => o.reference === reference.toUpperCase());
  const owner = order && user && order.user_id === user.id;
  const staff = user && ['super_admin', 'manager', 'staff'].includes(user.role);
  const tokenOk = order && token && token === trackingToken(order.reference);
  if (!order || !(owner || staff || tokenOk)) throw fail.notFound('We couldn’t find that order.');
  return toPublic(order, true);
}

export function listForUser(userId: number) {
  return db
    .where('orders', (o) => o.user_id === userId && o.status !== 'pending_payment')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50)
    .map((o) => toPublic(o, true));
}

function releaseHolds(order: Row): void {
  if (order.wallet_applied_kobo > 0 && order.user_id) {
    ledger.wallet(
      order.user_id,
      'credit',
      'refund',
      order.wallet_applied_kobo,
      `Returned from cancelled order ${order.reference}`,
      order.reference,
      `order-wallet-refund:${order.reference}`,
    );
  }
  if (order.voucher_id) {
    const v = db.byId('reward_vouchers', order.voucher_id);
    if (v && v.used_order_id === order.id) Object.assign(v, { status: 'issued', used_order_id: null });
  }
}

export function updateStatus(
  reference: string,
  to: string,
  actorId: number | null,
  note: string | null = null,
): void {
  const order = db.find('orders', (o) => o.reference === reference);
  if (!order) throw fail.notFound();
  let allowed = TRANSITIONS[order.status] ?? [];
  if (
    (to === 'out_for_delivery' && order.fulfilment === 'pickup') ||
    (to === 'completed' && order.fulfilment === 'delivery')
  ) {
    allowed = [];
  }
  if (!allowed.includes(to)) throw fail.conflict(`An order that is ${order.status} can’t move to ${to}.`);
  const from = order.status;
  Object.assign(order, { status: to, status_updated_at: sql() });
  db.insert('order_status_history', { order_id: order.id, status: to, note, changed_by_user_id: actorId });
  if (to === 'cancelled') releaseHolds(order);
  audit(actorId, 'order.status', 'order', reference, { from, to });
  if (['delivered', 'completed'].includes(to)) onOrderCompleted(order);
}

/** Basket lines rebuilt from a past order at today's prices (OrderController::reorder). */
export function reorder(reference: string, userId: number) {
  const order = db.find('orders', (o) => o.reference === reference.toUpperCase() && o.user_id === userId);
  if (!order) throw fail.notFound('We couldn’t find that order.');
  const today = sql().slice(0, 10);
  const lines: Row[] = [];
  const unavailable: string[] = [];
  for (const item of db.where('order_items', (i) => i.order_id === order.id)) {
    const dish = db.find('dishes', (d) => d.id === item.dish_id && d.deleted_at === null);
    if (!dish || !dish.is_available || (dish.sold_out_until !== null && dish.sold_out_until >= today)) {
      unavailable.push(item.dish_name);
      continue;
    }
    const opts = JSON.parse(item.options ?? '{}') as Row;
    const valid = new Map(db.where('dish_options', (o) => o.dish_id === dish.id).map((o) => [o.id, o]));
    const portion = opts.portion?.id ? (valid.get(opts.portion.id) ?? null) : null;
    const addons = ((opts.addons ?? []) as Row[]).map((a) => valid.get(a.id)).filter((a): a is Row => !!a);
    lines.push({
      dishId: dish.id,
      slug: dish.slug,
      name: dish.name,
      kitchen: db.byId('kitchens', dish.kitchen_id)?.slug ?? null,
      unitPriceKobo:
        dish.price_kobo +
        (portion?.price_delta_kobo ?? 0) +
        addons.reduce((s, a) => s + a.price_delta_kobo, 0),
      quantity: item.quantity,
      portionId: portion?.id ?? null,
      portionName: portion?.name ?? null,
      addonIds: addons.map((a) => a.id),
      addonNames: addons.map((a) => a.name),
      containsPork: !!dish.contains_pork,
    });
  }
  return { lines, unavailable };
}

/** Saves a delivery address used at checkout (CheckoutController::saveAddress). */
export function saveCheckoutAddress(userId: number, req: Row): void {
  const zone = db.find('delivery_zones', (z) => z.slug === req.zone);
  const mine = db.where('addresses', (a) => a.user_id === userId);
  if (mine.some((a) => a.line1 === req.address.line1) || mine.length >= 10) return;
  db.insert('addresses', {
    user_id: userId,
    label: req.address.label ?? 'Home',
    line1: req.address.line1,
    line2: req.address.line2 ?? null,
    landmark: req.address.landmark ?? null,
    delivery_zone_id: zone?.id ?? null,
    phone: req.phone,
    is_default: mine.length === 0 ? 1 : 0,
  });
}
