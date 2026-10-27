import { db } from '../db';
import { fail, naira, validate, validateQuery } from '../http';
import { code } from '../random';
import { route } from '../router';
import { audit } from '../services/audit';
import * as loyalty from '../services/loyalty';
import { startPayment } from '../services/orders';
import { verifyTopup } from './public';

/* ---------------------------------------------------------------- addresses */

function listAddresses(userId) {
  return db
    .where('addresses', (a) => a.user_id === userId)
    .sort((a, b) => b.is_default - a.is_default || a.id - b.id)
    .map((a) => {
      const zone = db.byId('delivery_zones', a.delivery_zone_id);
      return {
        id: a.id,
        label: a.label,
        line1: a.line1,
        line2: a.line2,
        landmark: a.landmark,
        zone: zone?.slug ?? null,
        zoneName: zone?.name ?? null,
        phone: a.phone,
        isDefault: !!a.is_default,
      };
    });
}

function saveAddress(body, userId, id) {
  const data = validate(
    body,
    {
      label: 'required|string|max:40',
      line1: 'required|string|max:160',
      line2: 'nullable|string|max:160',
      landmark: 'nullable|string|max:160',
      zone: 'required|string|max:40',
      phone: 'nullable|phone',
      is_default: 'nullable|bool',
    },
    { line1: 'Street address', zone: 'Delivery area' },
  );
  const zone = db.find('delivery_zones', (z) => z.slug === data.zone && !!z.is_active);
  if (!zone) throw fail.field('zone', 'Choose a delivery area we serve.');
  const values = {
    label: data.label,
    line1: data.line1,
    line2: data.line2 ?? null,
    landmark: data.landmark ?? null,
    delivery_zone_id: zone.id,
    phone: data.phone ?? null,
  };
  const mine = db.where('addresses', (a) => a.user_id === userId);
  if (data.is_default) {
    for (const a of mine) a.is_default = 0;
    values.is_default = 1;
  }
  if (id !== null) {
    const existing = mine.find((a) => a.id === id);
    if (!existing) throw fail.notFound('Address not found.');
    Object.assign(existing, values);
  } else {
    if (mine.length >= 10) throw fail.field('label', 'You can save up to 10 addresses.');
    db.insert('addresses', {
      ...values,
      user_id: userId,
      is_default: mine.length === 0 ? 1 : (values.is_default ?? 0),
    });
  }
  return { addresses: listAddresses(userId) };
}

route('GET', '/account/addresses', ({ user }) => ({ addresses: listAddresses(user.id) }), 'user');
route('POST', '/account/addresses', ({ body, user }) => saveAddress(body, user.id, null), 'user');
route(
  'PATCH',
  '/account/addresses/:id',
  ({ body, user, params }) => saveAddress(body, user.id, Number(params.id)),
  'user',
);
route(
  'DELETE',
  '/account/addresses/:id',
  ({ user, params }) => {
    db.delete('addresses', (a) => a.id === Number(params.id) && a.user_id === user.id);
    return { addresses: listAddresses(user.id) };
  },
  'user',
);

/* ------------------------------------------------------------------ reviews */

route(
  'GET',
  '/account/reviews',
  ({ user }) => ({
    reviews: db
      .where('reviews', (r) => r.user_id === user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => {
        const dish = db.byId('dishes', r.dish_id);
        return {
          id: r.id,
          dish: dish?.name ?? null,
          dishSlug: dish?.slug ?? null,
          orderReference: db.byId('orders', r.order_id)?.reference ?? null,
          rating: r.rating,
          title: r.title,
          body: r.body,
          status: r.status,
          reply: r.admin_reply,
          createdAt: r.created_at,
        };
      }),
  }),
  'user',
);

route(
  'POST',
  '/account/reviews',
  ({ body, user }) => {
    const data = validate(
      body,
      {
        order_reference: 'required|string|max:20|regex:/^SA-[A-Z0-9]{6}$/',
        dish_id: 'required|int|min:1',
        rating: 'required|int|min:1|max:5',
        title: 'nullable|string|max:120',
        body: 'required|string|min:10|max:1500',
      },
      { body: 'Your review' },
    );
    const order = db.find(
      'orders',
      (o) =>
        o.reference === data.order_reference &&
        o.user_id === user.id &&
        ['delivered', 'completed'].includes(o.status),
    );
    if (!order || !db.find('order_items', (i) => i.order_id === order.id && i.dish_id === data.dish_id)) {
      throw fail.forbidden('You can review dishes from your delivered or collected orders.');
    }
    if (db.find('reviews', (r) => r.order_id === order.id && r.dish_id === data.dish_id)) {
      throw fail.conflict('You’ve already reviewed this dish for this order.');
    }
    const row = db.insert('reviews', {
      user_id: user.id,
      author_name: `${user.first_name} ${String(user.last_name).slice(0, 1)}.`,
      dish_id: data.dish_id,
      order_id: order.id,
      rating: data.rating,
      title: data.title ?? null,
      body: data.body,
      status: 'pending',
    });
    audit(user.id, 'review.created', 'review', row.id);
    return { message: 'Thank you! Your review will appear once our team has checked it.' };
  },
  'user',
);

/* ---------------------------------------------------------- interest account */

route('GET', '/account/loyalty', ({ user }) => loyalty.summary(user.id), 'user');

route(
  'GET',
  '/account/loyalty/history',
  ({ user, query }) => {
    const q = validateQuery(query, {
      kind: 'required|string|in:wallet,points',
      before: 'nullable|int|min:1',
    });
    return loyalty.history(user.id, q.kind, q.before ?? null);
  },
  'user',
);

route(
  'POST',
  '/account/wallet/topups',
  ({ body, user, idempotencyKey }) => {
    const data = validate(
      body,
      { amount_naira: 'required|int|min:1|max:10000000' },
      { amount_naira: 'Amount' },
    );
    const amountKobo = data.amount_naira * 100;
    if (user.email_verified_at === null) {
      throw fail.forbidden('Please confirm your email address before topping up your wallet.');
    }
    if (idempotencyKey !== null && !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
      throw fail.badRequest('Invalid Idempotency-Key header.');
    }
    const rules = loyalty.rules();
    const limits = rules.topupLimits();
    if (amountKobo < limits.min || amountKobo > limits.max) {
      throw fail.field('amount', `Top-ups must be between ${naira(limits.min)} and ${naira(limits.max)}.`);
    }
    let topup =
      idempotencyKey !== null
        ? db.find('wallet_topups', (t) => t.user_id === user.id && t.idempotency_key === idempotencyKey)
        : null;
    if (!topup) {
      topup = db.insert('wallet_topups', {
        reference: code(6, 'TU-'),
        user_id: user.id,
        amount_kobo: amountKobo,
        bonus_kobo: rules.topupBonus(amountKobo),
        idempotency_key: idempotencyKey,
      });
    }
    if (topup.status === 'paid') return { topup: loyalty.topupToPublic(topup), payment: null };
    const payment = startPayment('wallet_topup', topup.id, user.id, topup.reference, topup.amount_kobo);
    return { topup: loyalty.topupToPublic(topup), payment };
  },
  'user',
);

route(
  'POST',
  '/account/wallet/topups/verify',
  ({ body, user }) => {
    const data = validate(body, { reference: 'required|string|max:20|regex:/^TU-[A-Z0-9]{6}$/' });
    const topup = db.find('wallet_topups', (t) => t.reference === data.reference && t.user_id === user.id);
    if (!topup) throw fail.notFound('We couldn’t find that top-up.');
    return { topup: verifyTopup(topup) };
  },
  'user',
);

route(
  'POST',
  '/account/rewards/:slug/redeem',
  ({ params, user, idempotencyKey }) => ({
    result: loyalty.redeem(user.id, params.slug, idempotencyKey),
    account: loyalty.summary(user.id),
  }),
  'user',
);

route('GET', '/account/notifications', ({ user }) => loyalty.notifications(user.id), 'user');

route(
  'POST',
  '/account/notifications/read',
  ({ body, user }) => {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => Number.isInteger(x)) : null;
    loyalty.markRead(user.id, ids);
    return loyalty.notifications(user.id);
  },
  'user',
);
