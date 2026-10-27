import { db, getState } from '@/lib/demo/db';
import { fail, validate, validateQuery } from '@/lib/demo/http';
import { route } from '@/lib/demo/router';
import { audit } from '@/lib/demo/services/audit';
import { can, permissionsFor } from '@/lib/demo/services/auth';
import * as loyalty from '@/lib/demo/services/loyalty';
import { TRANSITIONS, toPublic as orderToPublic, updateStatus } from '@/lib/demo/services/orders';
import {
  activeAreas,
  activeSlots,
  bookedCovers,
  STAFF_TRANSITIONS,
  staffUpdate,
} from '@/lib/demo/services/reservations';
import { addDays, atom, now, parse, sql, startOfDay, ymd } from '@/lib/demo/time';
import { mediaPath } from './public';

/** Ports of the App\Http\Controllers\Admin controllers. */

const PER_PAGE = 25;

function paging(ctx) {
  const page = Math.max(1, Number(ctx.query.get('page') ?? 1) || 1);
  return { page, offset: (page - 1) * PER_PAGE };
}

function paged(all, page) {
  return {
    items: all.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    page,
    pages: Math.max(1, Math.ceil(all.length / PER_PAGE)),
    total: all.length,
  };
}

const q = (ctx, key) => {
  const v = ctx.query.get(key);
  return v !== null && v.trim() !== '' ? v.trim() : null;
};

/** Case-insensitive LIKE '%text%'. */
const like = (text) => (value) =>
  value !== null && value !== undefined && String(value).toLowerCase().includes(text.toLowerCase());

const fullName = (u) => (u ? `${u.first_name} ${u.last_name}` : null);
const isCustomer = (u) => u.role === 'customer';
const accountOf = (userId) => db.find('loyalty_accounts', (a) => a.user_id === userId);

/** Newest first, with NULLs last (MySQL ORDER BY … DESC). */
const desc = (a, b) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : b.localeCompare(a));

/* ------------------------------------------------------------- me & dashboard */

route(
  'GET',
  '/admin/me',
  ({ user }) => ({
    permissions: permissionsFor(user),
    role: user.role,
    staffPosition: user.staff_position,
    twoFactorEnabled: user.totp_enabled_at !== null,
    // The browser demo always offers "Simulate month-end interest" (Super Admin only).
    demoTools: true,
  }),
  'staff',
);

const paidOrder = (o) => o.payment_status === 'paid' && o.status !== 'cancelled';
const orderItems = (o) => db.where('order_items', (i) => i.order_id === o.id);
const billKobo = (o) => o.total_kobo + o.wallet_applied_kobo;

route(
  'GET',
  '/admin/dashboard',
  (ctx) => {
    const days = ctx.query.get('days') === '30' ? 30 : 7;
    const at = now();
    const today = startOfDay(at);
    const from = addDays(today, -(days - 1));
    const paid = db.where('orders', paidOrder);
    const reservations = db.all('reservations');

    const kpi = (start, end) => {
      const [s, e] = [sql(start), sql(end)];
      const inRange = paid.filter((o) => o.placed_at >= s && o.placed_at < e);
      const revenue = inRange.reduce((sum, o) => sum + billKobo(o), 0);
      const [ds, de] = [ymd(start), ymd(end)];
      const res = reservations.filter((r) => r.service_date >= ds && r.service_date < de);
      return {
        revenueKobo: revenue,
        orders: inRange.length,
        reservations: res.filter((r) => r.status !== 'cancelled').length,
        covers: res
          .filter((r) => !['cancelled', 'no_show'].includes(r.status))
          .reduce((sum, r) => sum + r.party_size, 0),
        averageOrderKobo: inRange.length ? Math.floor(revenue / inRange.length) : 0,
      };
    };

    const since = paid.filter((o) => o.placed_at >= sql(from));
    const series = [];
    for (let d = from; d <= today; d = addDays(d, 1)) {
      const key = ymd(d);
      const dayOrders = since.filter((o) => o.placed_at.startsWith(key));
      series.push({
        date: key,
        revenueKobo: dayOrders.reduce((sum, o) => sum + billKobo(o), 0),
        orders: dayOrders.length,
        reservations: reservations.filter((r) => r.service_date === key && r.status !== 'cancelled').length,
      });
    }
    const dishes = new Map();
    const kitchens = new Map();
    for (const o of since) {
      for (const i of orderItems(o)) {
        const d = dishes.get(i.dish_name) ?? { name: i.dish_name, quantity: 0, revenueKobo: 0 };
        d.quantity += i.quantity;
        d.revenueKobo += i.line_total_kobo;
        dishes.set(i.dish_name, d);
        const k = db.byId('kitchens', i.kitchen_id)?.name ?? 'Other';
        kitchens.set(k, (kitchens.get(k) ?? 0) + i.line_total_kobo);
      }
    }
    const live = db
      .where('orders', (o) => ['received', 'preparing', 'ready', 'out_for_delivery'].includes(o.status))
      .sort((a, b) =>
        String(a.scheduled_for ?? a.placed_at).localeCompare(String(b.scheduled_for ?? b.placed_at)),
      )
      .slice(0, 20);
    const members = db.where('loyalty_accounts', (a) => isCustomer(db.byId('users', a.user_id) ?? {}));
    return {
      today: kpi(today, addDays(today, 1)),
      yesterday: kpi(addDays(today, -1), today),
      period: { days, ...kpi(from, addDays(today, 1)) },
      series,
      topDishes: [...dishes.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      byKitchen: [...kitchens.entries()]
        .map(([kitchen, revenueKobo]) => ({ kitchen, revenueKobo }))
        .sort((a, b) => b.revenueKobo - a.revenueKobo),
      live: live.map((o) => liveRow(o)),
      pending: {
        reviews: db.where('reviews', (r) => r.status === 'pending').length,
        enquiries: db.where('event_enquiries', (e) => e.status === 'new').length,
        messages: db.where('contact_messages', (m) => m.status === 'new').length,
      },
      loyalty: {
        members: members.length,
        walletKobo: members.reduce((s, a) => s + a.wallet_balance_kobo, 0),
        points: members.reduce((s, a) => s + a.points_balance, 0),
      },
      generatedAt: atom(at),
    };
  },
  'dashboard.view',
);

function liveRow(o) {
  return {
    reference: o.reference,
    status: o.status,
    fulfilment: o.fulfilment,
    customerName: o.customer_name,
    totalKobo: billKobo(o),
    items: orderItems(o).reduce((s, i) => s + i.quantity, 0),
    placedAt: o.placed_at,
    scheduledFor: o.scheduled_for,
  };
}

/* -------------------------------------------------------------------- orders */

const POSITION_MOVES = {
  kitchen: ['preparing', 'ready'],
  front_desk: ['preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'],
};

function allowedMoves(user, order) {
  let moves = (TRANSITIONS[order.status] ?? []).filter(
    (m) =>
      !(
        (m === 'out_for_delivery' && order.fulfilment === 'pickup') ||
        (m === 'completed' && order.fulfilment === 'delivery') ||
        (m === 'delivered' && order.fulfilment === 'pickup')
      ),
  );
  if (user.role === 'staff')
    moves = moves.filter((m) => (POSITION_MOVES[user.staff_position] ?? []).includes(m));
  return moves;
}

function findOrder(reference) {
  const o = db.find('orders', (x) => x.reference === reference.toUpperCase());
  if (!o) throw fail.notFound('We couldn’t find that order.');
  return o;
}

function adminOrder(o, user) {
  return {
    ...orderToPublic(o, true),
    customer: {
      name: o.customer_name,
      email: o.customer_email,
      phone: o.customer_phone,
      userId: o.user_id,
      tier: o.user_id ? (accountOf(o.user_id)?.tier ?? null) : null,
    },
    address: o.address_snapshot ? JSON.parse(o.address_snapshot) : null,
    notes: o.notes,
    refundFlag: !!o.refund_flag,
    cancelledReason: o.cancelled_reason,
    coupon: db.byId('coupons', o.coupon_id)?.code ?? null,
    history: db
      .where('order_status_history', (h) => h.order_id === o.id)
      .map((h) => ({
        status: h.status,
        at: h.created_at,
        note: h.note,
        by: fullName(db.byId('users', h.changed_by_user_id)),
      })),
    payments: db
      .where('payments', (p) => p.purpose === 'order' && p.payable_id === o.id)
      .map((p) => ({
        reference: p.reference,
        provider: p.provider,
        amountKobo: p.amount_kobo,
        status: p.status,
        verifiedAt: p.verified_at,
      })),
    nextStatuses: allowedMoves(user, o),
  };
}

route(
  'GET',
  '/admin/orders',
  (ctx) => {
    const { page } = paging(ctx);
    let rows = db.where('orders', (o) => o.status !== 'pending_payment');
    const status = q(ctx, 'status');
    if (status) {
      const list = status.split(',').filter((s) => s in TRANSITIONS);
      if (list.length) rows = rows.filter((o) => list.includes(o.status));
    }
    const date = q(ctx, 'date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date))
      rows = rows.filter((o) => String(o.placed_at ?? '').startsWith(date));
    const fulfilment = q(ctx, 'fulfilment');
    if (fulfilment === 'delivery' || fulfilment === 'pickup')
      rows = rows.filter((o) => o.fulfilment === fulfilment);
    if (q(ctx, 'refund') === '1') rows = rows.filter((o) => !!o.refund_flag);
    const text = q(ctx, 'q');
    if (text) {
      const m = like(text);
      rows = rows.filter(
        (o) => m(o.reference) || m(o.customer_name) || m(o.customer_email) || m(o.customer_phone),
      );
    }
    rows.sort((a, b) => desc(a.placed_at, b.placed_at) || b.id - a.id);
    return paged(
      rows.map((o) => ({ ...liveRow(o), paymentStatus: o.payment_status, refundFlag: !!o.refund_flag })),
      page,
    );
  },
  'orders.view',
);

route(
  'GET',
  '/admin/orders/:reference',
  ({ params, user }) => ({ order: adminOrder(findOrder(params.reference), user) }),
  'orders.view',
);

route(
  'POST',
  '/admin/orders/:reference/status',
  ({ params, body, user }) => {
    const o = findOrder(params.reference);
    const data = validate(body, {
      status: 'required|string|in:preparing,ready,out_for_delivery,delivered,completed,cancelled',
      note: 'nullable|string|max:255',
    });
    if (!allowedMoves(user, o).includes(data.status))
      throw fail.forbidden('You can’t move this order to that status.');
    if (data.status === 'cancelled') o.cancelled_reason = data.note ?? 'Cancelled by staff';
    updateStatus(o.reference, data.status, user.id, data.note ?? null);
    return { order: adminOrder(o, user) };
  },
  'orders.status',
);

route(
  'POST',
  '/admin/orders/:reference/refund-flag',
  ({ params, body, user }) => {
    const o = findOrder(params.reference);
    const data = validate(body, { flag: 'required|bool', reason: 'required|string|min:5|max:255' });
    o.refund_flag = data.flag ? 1 : 0;
    db.insert('order_status_history', {
      order_id: o.id,
      status: o.status,
      note: `${data.flag ? 'Refund flagged: ' : 'Refund flag cleared: '}${data.reason}`,
      changed_by_user_id: user.id,
    });
    audit(user.id, data.flag ? 'order.refund_flagged' : 'order.refund_cleared', 'order', o.reference, {
      reason: data.reason,
    });
    return { order: adminOrder(o, user) };
  },
  'orders.refund',
);

/* -------------------------------------------------------------- reservations */

function reservationToAdmin(r) {
  const area = db.byId('seating_areas', r.seating_area_id);
  return {
    code: r.code,
    status: r.status,
    date: r.service_date,
    time: String(r.start_time).slice(0, 5),
    partySize: r.party_size,
    area: { slug: area?.slug, name: area?.name },
    tableLabel: r.table_label,
    occasion: r.occasion,
    notes: r.notes,
    guest: {
      name: r.guest_name,
      email: r.guest_email,
      phone: r.guest_phone,
      userId: r.user_id,
      tier: r.user_id ? (accountOf(r.user_id)?.tier ?? null) : null,
    },
    cancelledReason: r.cancelled_reason,
    nextStatuses: STAFF_TRANSITIONS[r.status] ?? [],
    createdAt: r.created_at,
  };
}

route(
  'GET',
  '/admin/reservations',
  (ctx) => {
    const v = validateQuery(ctx.query, {
      from: 'nullable|date',
      to: 'nullable|date',
      status: 'nullable|string|max:80',
      q: 'nullable|string|max:80',
    });
    const from = v.from ?? ymd(now());
    const to = v.to ?? ymd(addDays(parse(from), 6));
    if (Math.abs(parse(to).getTime() - parse(from).getTime()) / 86_400_000 > 62) {
      throw fail.badRequest('Choose a range of two months or less.');
    }
    let rows = db.where('reservations', (r) => r.service_date >= from && r.service_date <= to);
    if (v.status) {
      const list = String(v.status)
        .split(',')
        .filter((s) => s in STAFF_TRANSITIONS);
      if (list.length) rows = rows.filter((r) => list.includes(r.status));
    }
    if (v.q) {
      const m = like(v.q);
      rows = rows.filter((r) => m(r.code) || m(r.guest_name) || m(r.guest_email) || m(r.guest_phone));
    }
    rows.sort(
      (a, b) =>
        `${a.service_date} ${a.start_time}`.localeCompare(`${b.service_date} ${b.start_time}`) || a.id - b.id,
    );
    return {
      from,
      to,
      reservations: rows.slice(0, 500).map(reservationToAdmin),
      areas: activeAreas().map((a) => ({ slug: a.slug, name: a.name, coversPerSlot: a.covers_per_slot })),
    };
  },
  'reservations.manage',
);

route(
  'PATCH',
  '/admin/reservations/:code',
  ({ params, body, user }) => {
    const data = validate(
      body,
      {
        status: 'nullable|string|in:pending,confirmed,seated,completed,cancelled,no_show',
        table_label: 'nullable|string|max:20',
        area: 'nullable|string|max:40',
        reason: 'nullable|string|max:255',
      },
      { table_label: 'Table' },
    );
    return { reservation: reservationToAdmin(staffUpdate(params.code, data, user.id)) };
  },
  'reservations.manage',
);

function capacityFor(date) {
  const overrides = db.where('capacity_overrides', (o) => o.service_date === date);
  const slots = activeSlots();
  return {
    date,
    slots,
    areas: activeAreas().map((a) => {
      const mine = overrides.filter((o) => o.seating_area_id === a.id);
      const wholeDay = mine.find((o) => o.start_time === null) ?? null;
      return {
        slug: a.slug,
        name: a.name,
        defaultCovers: a.covers_per_slot,
        slots: slots.map((t) => {
          const o =
            mine.find((x) => x.start_time !== null && String(x.start_time).slice(0, 5) === t) ?? wholeDay;
          return {
            time: t,
            covers: o ? o.covers : a.covers_per_slot,
            booked: bookedCovers(a.id, date, t),
            override: o ? { id: o.id, reason: o.reason, wholeDay: o.start_time === null } : null,
          };
        }),
      };
    }),
  };
}

route(
  'GET',
  '/admin/capacity',
  ({ query }) => capacityFor(validateQuery(query, { date: 'required|date' }).date),
  'reservations.manage',
);

route(
  'PUT',
  '/admin/capacity',
  ({ body, user }) => {
    const data = validate(body, {
      date: 'required|date',
      area: 'required|string|max:40',
      time: 'nullable|time',
      covers: 'required|int|min:0|max:500',
      reason: 'nullable|string|max:160',
    });
    const area = db.find('seating_areas', (a) => a.slug === data.area);
    if (!area) throw fail.badRequest('Unknown seating area.');
    const time = data.time ? `${data.time}:00` : null;
    const existing = db.find(
      'capacity_overrides',
      (o) => o.service_date === data.date && o.seating_area_id === area.id && o.start_time === time,
    );
    if (existing) Object.assign(existing, { covers: data.covers, reason: data.reason ?? null });
    else
      db.insert('capacity_overrides', {
        service_date: data.date,
        start_time: time,
        seating_area_id: area.id,
        covers: data.covers,
        reason: data.reason ?? null,
      });
    audit(user.id, 'capacity.set', 'seating_area', data.area, data);
    return capacityFor(data.date);
  },
  'reservations.capacity',
);

route(
  'DELETE',
  '/admin/capacity/:id',
  ({ params, user }) => {
    const o = db.byId('capacity_overrides', params.id);
    if (!o) throw fail.notFound();
    db.delete('capacity_overrides', (x) => x.id === o.id);
    audit(user.id, 'capacity.cleared', 'capacity_override', o.id, { date: o.service_date });
    return capacityFor(o.service_date);
  },
  'reservations.capacity',
);

/* ---------------------------------------------------------------------- menu */

const ALLERGENS = [
  'gluten',
  'dairy',
  'egg',
  'nuts',
  'peanuts',
  'fish',
  'shellfish',
  'soy',
  'sesame',
  'celery',
  'mustard',
  'sulphites',
];

function adminMenu() {
  const today = ymd(now());
  return {
    kitchens: db
      .all('kitchens')
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((k) => ({ id: k.id, slug: k.slug, name: k.name, tagline: k.tagline, description: k.description })),
    categories: db
      .all('categories')
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, slug: c.slug, name: c.name, sortOrder: c.sort_order })),
    dishes: db
      .where('dishes', (d) => d.deleted_at === null)
      .sort(
        (a, b) =>
          a.category_id - b.category_id || a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      )
      .map((d) => ({
        id: d.id,
        slug: d.slug,
        name: d.name,
        kitchenId: d.kitchen_id,
        categoryId: d.category_id,
        shortDescription: d.short_description,
        description: d.description,
        ingredients: d.ingredients,
        allergens: d.allergens ? String(d.allergens).split(',') : [],
        priceKobo: d.price_kobo,
        spiceLevel: d.spice_level,
        isVegetarian: !!d.is_vegetarian,
        isGlutenFree: !!d.is_gluten_free,
        containsNuts: !!d.contains_nuts,
        containsPork: !!d.contains_pork,
        isAlcoholic: !!d.is_alcoholic,
        isFeatured: !!d.is_featured,
        isAvailable: !!d.is_available,
        soldOutToday: d.sold_out_until !== null && d.sold_out_until >= today,
        imageUrl: d.image_path ? mediaPath(d.image_path) : null,
        imageAlt: d.image_alt,
        sortOrder: d.sort_order,
        popularity: d.popularity,
        options: db
          .where('dish_options', (o) => o.dish_id === d.id)
          .sort(
            (a, b) =>
              a.option_group.localeCompare(b.option_group) || a.sort_order - b.sort_order || a.id - b.id,
          )
          .map((o) => ({
            id: o.id,
            group: o.option_group,
            name: o.name,
            priceDeltaKobo: o.price_delta_kobo,
            isDefault: !!o.is_default,
          })),
      })),
  };
}

function findDish(id) {
  const d = db.find('dishes', (x) => x.id === Number(id) && x.deleted_at === null);
  if (!d) throw fail.notFound('We couldn’t find that dish.');
  return d;
}

function validateDish(body, creating) {
  const req = creating ? 'required' : 'nullable';
  const data = validate(
    body,
    {
      name: `${req}|string|min:2|max:120`,
      kitchen_id: 'nullable|int|min:1',
      category_id: `${req}|int|min:1`,
      short_description: `${req}|string|max:255`,
      description: `${req}|string|max:3000`,
      ingredients: 'nullable|string|max:1000',
      price_naira: `${req}|int|min:0|max:5000000`,
      spice_level: 'nullable|int|min:0|max:3',
      is_vegetarian: 'nullable|bool',
      is_gluten_free: 'nullable|bool',
      contains_nuts: 'nullable|bool',
      contains_pork: 'nullable|bool',
      is_alcoholic: 'nullable|bool',
      is_featured: 'nullable|bool',
      is_available: 'nullable|bool',
      sort_order: 'nullable|int|min:0|max:9999',
    },
    { price_naira: 'Price', category_id: 'Category', kitchen_id: 'Kitchen' },
  );
  if (data.category_id != null && !db.byId('categories', data.category_id))
    throw fail.field('category_id', 'Choose a category.');
  if (data.kitchen_id != null && !db.byId('kitchens', data.kitchen_id))
    throw fail.field('kitchen_id', 'Choose a kitchen.');
  if ('allergens' in body) {
    const list = Array.isArray(body.allergens) ? body.allergens : [];
    const bad = list.filter((a) => !ALLERGENS.includes(a));
    if (bad.length) throw fail.field('allergens', `Unknown allergen: ${bad.join(', ')}`);
    data.allergens = list.length ? [...new Set(list)].join(',') : null;
  }
  if ('options' in body) {
    const options = body.options;
    if (!Array.isArray(options) || options.length > 20)
      throw fail.field('options', 'Up to 20 portions and add-ons per dish.');
    data.options = options.map((o, i) => ({
      ...validate(
        o ?? {},
        {
          group: 'required|string|in:portion,addon',
          name: 'required|string|max:80',
          price_delta_naira: 'required|int|min:-1000000|max:1000000',
          is_default: 'nullable|bool',
        },
        { price_delta_naira: 'Price change' },
      ),
      sort_order: i,
    }));
    const portions = data.options.filter((o) => o.group === 'portion');
    if (portions.length && portions.filter((o) => o.is_default).length !== 1) {
      throw fail.field('options', 'Mark exactly one portion as the default.');
    }
  }
  return data;
}

function dishColumns(data) {
  const cols = {};
  for (const k of [
    'name',
    'kitchen_id',
    'category_id',
    'short_description',
    'description',
    'ingredients',
    'allergens',
    'spice_level',
    'sort_order',
  ]) {
    if (k in data) cols[k] = data[k];
  }
  for (const f of [
    'is_vegetarian',
    'is_gluten_free',
    'contains_nuts',
    'contains_pork',
    'is_alcoholic',
    'is_featured',
    'is_available',
  ]) {
    if (f in data && data[f] !== null) cols[f] = data[f] ? 1 : 0;
  }
  if (data.price_naira != null) cols.price_kobo = data.price_naira * 100;
  for (const k of ['name', 'category_id', 'short_description', 'description'])
    if (k in cols && cols[k] === null) delete cols[k];
  return cols;
}

function saveOptions(dishId, options) {
  db.delete('dish_options', (o) => o.dish_id === dishId);
  for (const o of options) {
    db.insert('dish_options', {
      dish_id: dishId,
      option_group: o.group,
      name: o.name,
      price_delta_kobo: o.price_delta_naira * 100,
      is_default: o.is_default ? 1 : 0,
      sort_order: o.sort_order,
    });
  }
}

const slugify = (text) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

route(
  'POST',
  '/admin/dishes',
  ({ body, user }) => {
    const data = validateDish(body, true);
    const base = (slugify(data.name) || 'dish').slice(0, 90);
    let slug = base;
    for (let i = 2; db.find('dishes', (d) => d.slug === slug); i++) slug = `${base}-${i}`;
    const dish = db.insert('dishes', { ...dishColumns(data), slug });
    saveOptions(dish.id, data.options ?? []);
    audit(user.id, 'menu.dish_created', 'dish', dish.id, { name: data.name });
    return adminMenu();
  },
  'menu.manage',
);

route(
  'PATCH',
  '/admin/dishes/:id',
  ({ params, body, user }) => {
    const dish = findDish(params.id);
    const data = validateDish(body, false);
    const before = dish.price_kobo;
    Object.assign(dish, dishColumns(data));
    if ('options' in data) saveOptions(dish.id, data.options);
    const meta = { fields: Object.keys(data).filter((k) => k !== 'options') };
    if (data.price_naira != null) meta.price = { from: before, to: data.price_naira * 100 };
    audit(user.id, 'menu.dish_updated', 'dish', dish.id, meta);
    return adminMenu();
  },
  'menu.manage',
);

route(
  'DELETE',
  '/admin/dishes/:id',
  ({ params, user }) => {
    const dish = findDish(params.id);
    Object.assign(dish, {
      deleted_at: sql(),
      is_available: 0,
      slug: `${String(dish.slug).slice(0, 80)}-deleted-${dish.id}`,
    });
    audit(user.id, 'menu.dish_deleted', 'dish', dish.id, { name: dish.name });
    return adminMenu();
  },
  'menu.manage',
);

route(
  'POST',
  '/admin/dishes/:id/availability',
  ({ params, body, user }) => {
    const dish = findDish(params.id);
    const data = validate(body, { sold_out_today: 'nullable|bool', available: 'nullable|bool' });
    if (data.sold_out_today != null) dish.sold_out_until = data.sold_out_today ? ymd(now()) : null;
    if (data.available != null) dish.is_available = data.available ? 1 : 0;
    audit(user.id, 'menu.availability', 'dish', dish.id, data);
    return adminMenu();
  },
  'menu.availability',
);

/** Re-encodes an uploaded photo to WebP in the browser (the API does this with GD). */
async function toWebpDataUrl(file) {
  if (file.size > 5 * 1024 * 1024) throw fail.field('image', 'That image is too large (5 MB maximum).');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw fail.field('image', 'Please upload a JPEG, PNG or WebP photo.');
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw fail.field('image', 'That file isn’t a readable image.');
  }
  if (bitmap.width < 400 || bitmap.height < 300 || bitmap.width > 8000 || bitmap.height > 8000) {
    throw fail.field('image', 'Photos must be between 400×300 and 8000×8000 pixels.');
  }
  // Smaller than the API's 1600px so a few photos fit in this browser's storage.
  const width = Math.min(960, bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((bitmap.height * width) / bitmap.width);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.8);
}

route(
  'POST',
  '/admin/dishes/:id/image',
  async ({ params, form, user }) => {
    const dish = findDish(params.id);
    const file = form?.get('image');
    if (!(file instanceof File)) throw fail.field('image', 'Choose a photo to upload.');
    const alt = String(form?.get('alt') ?? '').trim();
    dish.image_path = await toWebpDataUrl(file);
    dish.image_alt = alt ? alt.slice(0, 255) : dish.name;
    audit(user.id, 'menu.image_uploaded', 'dish', dish.id, { file: file.name });
    return adminMenu();
  },
  'menu.manage',
);

route(
  'DELETE',
  '/admin/dishes/:id/image',
  ({ params, user }) => {
    const dish = findDish(params.id);
    dish.image_path = null;
    audit(user.id, 'menu.image_removed', 'dish', dish.id);
    return adminMenu();
  },
  'menu.manage',
);

function saveCategory({ params, body, user }) {
  const data = validate(body, { name: 'required|string|max:60', sort_order: 'nullable|int|min:0|max:999' });
  if (params.id) {
    const c = db.byId('categories', params.id);
    if (!c) throw fail.notFound();
    Object.assign(c, { name: data.name, sort_order: data.sort_order ?? c.sort_order });
  } else {
    const slug = slugify(data.name);
    if (db.find('categories', (c) => c.slug === slug))
      throw fail.field('name', 'A category with that name already exists.');
    db.insert('categories', { slug, name: data.name, sort_order: data.sort_order ?? 99 });
  }
  audit(user.id, 'menu.category_saved', 'category', params.id ?? data.name);
  return adminMenu();
}

route('POST', '/admin/categories', saveCategory, 'menu.manage');
route('PATCH', '/admin/categories/:id', saveCategory, 'menu.manage');

route(
  'PATCH',
  '/admin/kitchens/:id',
  ({ params, body, user }) => {
    const k = db.byId('kitchens', params.id);
    if (!k) throw fail.notFound();
    const data = validate(body, {
      name: 'required|string|max:80',
      tagline: 'required|string|max:160',
      description: 'required|string|max:1000',
    });
    Object.assign(k, data);
    audit(user.id, 'menu.kitchen_saved', 'kitchen', k.id);
    return adminMenu();
  },
  'menu.manage',
);

route('GET', '/admin/menu', () => adminMenu(), 'menu.availability');

/* ----------------------------------------------------------------- customers */

function findCustomer(id) {
  const u = db.find('users', (x) => x.id === Number(id) && x.role === 'customer');
  if (!u) throw fail.notFound('We couldn’t find that customer.');
  return u;
}

route(
  'GET',
  '/admin/customers',
  (ctx) => {
    const { page } = paging(ctx);
    let rows = db.where('users', isCustomer).map((u) => ({ u, a: accountOf(u.id) ?? {} }));
    const text = q(ctx, 'q');
    if (text) {
      const m = like(text);
      rows = rows.filter(({ u }) => m(fullName(u)) || m(u.email) || m(u.phone) || m(u.referral_code));
    }
    const tier = q(ctx, 'tier');
    if (tier && ['bronze', 'silver', 'gold', 'black_diamond'].includes(tier))
      rows = rows.filter(({ a }) => a.tier === tier);
    const sorts = {
      spend: (x, y) => y.a.spend_12m_kobo - x.a.spend_12m_kobo,
      wallet: (x, y) => y.a.wallet_balance_kobo - x.a.wallet_balance_kobo,
      points: (x, y) => y.a.points_balance - x.a.points_balance,
      recent: (x, y) => desc(x.a.last_activity_at, y.a.last_activity_at),
    };
    rows.sort(sorts[q(ctx, 'sort') ?? ''] ?? ((x, y) => desc(x.u.created_at, y.u.created_at)));
    return paged(
      rows.map(({ u, a }) => ({
        id: u.id,
        name: fullName(u),
        email: u.email,
        phone: u.phone,
        tier: a.tier ?? 'bronze',
        walletKobo: a.wallet_balance_kobo ?? 0,
        points: a.points_balance ?? 0,
        spend12mKobo: a.spend_12m_kobo ?? 0,
        orders: db.where('orders', (o) => o.user_id === u.id && o.payment_status === 'paid').length,
        lastActivityAt: a.last_activity_at ?? null,
        joinedAt: u.created_at,
        isActive: !!u.is_active,
      })),
      page,
    );
  },
  'customers.view',
);

route(
  'GET',
  '/admin/customers/:id',
  ({ params, user }) => {
    const u = findCustomer(params.id);
    return {
      customer: {
        id: u.id,
        name: fullName(u),
        email: u.email,
        phone: u.phone,
        emailVerified: u.email_verified_at !== null,
        birthday: u.birthday,
        marketingOptIn: !!u.marketing_opt_in,
        referralCode: u.referral_code,
        joinedAt: u.created_at,
        isActive: !!u.is_active,
      },
      loyalty: loyalty.summary(u.id),
      orders: db
        .where('orders', (o) => o.user_id === u.id && o.status !== 'pending_payment')
        .sort((a, b) => desc(a.placed_at, b.placed_at))
        .slice(0, 20)
        .map((o) => ({
          reference: o.reference,
          status: o.status,
          placedAt: o.placed_at,
          totalKobo: billKobo(o),
          fulfilment: o.fulfilment,
        })),
      visits: db
        .where('dine_in_visits', (v) => v.user_id === u.id)
        .sort((a, b) => b.visited_at.localeCompare(a.visited_at))
        .slice(0, 20)
        .map((v) => ({
          reference: v.reference,
          amountKobo: v.amount_kobo,
          points: v.points_earned,
          at: v.visited_at,
          note: v.note,
        })),
      reservations: db
        .where('reservations', (r) => r.user_id === u.id || r.guest_email === u.email)
        .sort((a, b) => b.service_date.localeCompare(a.service_date))
        .slice(0, 20)
        .map((r) => ({
          code: r.code,
          date: r.service_date,
          time: String(r.start_time).slice(0, 5),
          partySize: r.party_size,
          status: r.status,
        })),
      canAdjust: can(user, 'loyalty.adjust'),
    };
  },
  'customers.view',
);

route(
  'GET',
  '/admin/customers/:id/history',
  ({ params, query }) => {
    const u = findCustomer(params.id);
    const v = validateQuery(query, {
      kind: 'required|string|in:wallet,points',
      before: 'nullable|int|min:1',
    });
    return loyalty.history(u.id, v.kind, v.before ?? null);
  },
  'customers.view',
);

route(
  'POST',
  '/admin/customers/:id/visits',
  ({ params, body, user }) => {
    const u = findCustomer(params.id);
    const data = validate(
      body,
      { amount_naira: 'required|int|min:1000|max:5000000', note: 'nullable|string|max:255' },
      { amount_naira: 'Bill amount' },
    );
    return { visit: loyalty.recordVisit(u.id, data.amount_naira * 100, user.id, data.note ?? null) };
  },
  'customers.visits',
);

route(
  'POST',
  '/admin/customers/:id/adjust',
  ({ params, body, user }) => {
    const u = findCustomer(params.id);
    const data = validate(body, {
      kind: 'required|string|in:wallet,points',
      direction: 'required|string|in:credit,debit',
      amount: 'required|int|min:1|max:100000000',
      reason: 'required|string|min:5|max:200',
    });
    const amount = data.kind === 'wallet' ? data.amount * 100 : data.amount;
    return loyalty.adjust(user.id, u.id, data.kind, data.direction, amount, data.reason);
  },
  'loyalty.adjust',
);

/* ---------------------------------------------------- interest account manager */

const TIER_KEYS = ['bronze', 'silver', 'gold', 'black_diamond'];

const SETTING_INTS = {
  earn_points_per_1000_naira: [0, 100, 'Points per ₦1,000'],
  redeem_points_per_1000_naira: [10, 10000, 'Points for ₦1,000 credit'],
  min_points_to_redeem: [1, 100000, 'Minimum points to redeem'],
  topup_min_naira: [100, 1000000, 'Minimum top-up'],
  topup_max_naira: [1000, 10000000, 'Maximum top-up'],
  interest_rate_bp: [0, 1000, 'Monthly interest rate'],
  interest_cap_naira: [0, 1000000, 'Monthly interest cap'],
  interest_min_balance_naira: [0, 10000000, 'Minimum balance for interest'],
  streak_visits_per_month: [1, 31, 'Visits for the streak bonus'],
  streak_bonus_points: [0, 100000, 'Streak bonus points'],
  anniversary_points: [0, 100000, 'Anniversary bonus points'],
  referral_credit_naira: [0, 100000, 'Referral credit'],
  referral_max_per_month: [0, 1000, 'Referral rewards per month'],
  points_expiry_months: [1, 60, 'Points expiry'],
  points_expiry_warning_days: [1, 90, 'Expiry warning'],
  winback_after_days: [7, 365, 'Win-back after'],
  winback_offer_percent: [0, 50, 'Win-back discount'],
};
const SETTING_MULTIPLIERS = {
  featured_dish_points_multiplier: [1, 5, 'Featured dish multiplier'],
  birthday_points_multiplier: [1, 5, 'Birthday week multiplier'],
};

const isNum = (v) =>
  (typeof v === 'number' && Number.isFinite(v)) ||
  (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));

/** Port of App\Loyalty\LoyaltySettingsValidator. */
function validateLoyaltySettings(input, categories) {
  const errors = {};
  const out = {};
  for (const [key, [min, max, label]] of Object.entries(SETTING_INTS)) {
    const v = input[key];
    if (!(Number.isInteger(v) || (typeof v === 'string' && /^\d+$/.test(v)))) {
      errors[key] = `${label} must be a whole number.`;
      continue;
    }
    const n = Number(v);
    if (n < min || n > max) errors[key] = `${label} must be between ${min} and ${max}.`;
    else out[key] = n;
  }
  for (const [key, [min, max, label]] of Object.entries(SETTING_MULTIPLIERS)) {
    const v = input[key];
    if (!isNum(v) || Number(v) < min || Number(v) > max)
      errors[key] = `${label} must be between ${min}× and ${max}×.`;
    else out[key] = Math.round(Number(v) * 100) / 100;
  }
  if ((out.topup_min_naira ?? 0) > (out.topup_max_naira ?? Infinity)) {
    errors.topup_max_naira = 'The maximum top-up must be at least the minimum.';
  }
  const days = input.double_points_weekdays ?? [];
  if (!Array.isArray(days) || days.length > 7 || days.some((d) => !(Number(d) >= 0 && Number(d) <= 6))) {
    errors.double_points_weekdays = 'Choose days of the week.';
  } else out.double_points_weekdays = [...new Set(days.map(Number))];
  const presets = input.topup_presets_naira ?? [];
  if (
    !Array.isArray(presets) ||
    presets.length < 1 ||
    presets.length > 6 ||
    presets.some((p) => !isNum(p) || Number(p) < 100)
  ) {
    errors.topup_presets_naira = 'Add one to six preset amounts.';
  } else out.topup_presets_naira = presets.map((p) => Math.trunc(Number(p))).sort((a, b) => a - b);
  const bands = input.topup_bonus_tiers ?? [];
  if (!Array.isArray(bands) || bands.length > 5) errors.topup_bonus_tiers = 'Up to five bonus levels.';
  else {
    out.topup_bonus_tiers = [];
    for (const b of bands) {
      if (
        !isNum(b?.min_naira) ||
        !isNum(b?.bonus_bp) ||
        Number(b.min_naira) < 1 ||
        Number(b.bonus_bp) < 0 ||
        Number(b.bonus_bp) > 5000
      ) {
        errors.topup_bonus_tiers = 'Each bonus level needs an amount and a bonus between 0% and 50%.';
        break;
      }
      out.topup_bonus_tiers.push({
        min_naira: Math.trunc(Number(b.min_naira)),
        bonus_bp: Math.trunc(Number(b.bonus_bp)),
      });
    }
    out.topup_bonus_tiers.sort((a, b) => b.min_naira - a.min_naira);
  }
  const tiers = input.tiers ?? [];
  if (!Array.isArray(tiers) || tiers.map((t) => t?.key).join() !== TIER_KEYS.join()) {
    errors.tiers = 'All four tiers are required, in order.';
  } else {
    out.tiers = [];
    let last = -1;
    for (const [i, t] of tiers.entries()) {
      const name = String(t.name ?? '').trim();
      const minSpend = i === 0 ? 0 : t.min_spend_naira;
      const perks = t.perks ?? [];
      if (
        !name ||
        name.length > 40 ||
        !isNum(minSpend) ||
        Number(minSpend) <= last ||
        !isNum(t.multiplier) ||
        Number(t.multiplier) < 1 ||
        Number(t.multiplier) > 5 ||
        !Array.isArray(perks) ||
        perks.length > 8 ||
        perks.some((p) => typeof p !== 'string' || !p.trim() || p.length > 80)
      ) {
        errors.tiers =
          'Each tier needs a name, a higher spend than the one before, a multiplier from 1× to 5× and up to 8 short perks.';
        break;
      }
      last = Math.trunc(Number(minSpend));
      out.tiers.push({
        key: t.key,
        name,
        min_spend_naira: last,
        multiplier: Math.round(Number(t.multiplier) * 100) / 100,
        perks: perks.map((p) => p.trim()),
      });
    }
  }
  const stamps = input.stamp_rewards ?? [];
  if (!Array.isArray(stamps) || stamps.length > 10) errors.stamp_rewards = 'Up to ten stamp rewards.';
  else {
    out.stamp_rewards = [];
    for (const s of stamps) {
      const reward = String(s?.reward ?? '').trim();
      if (
        !isNum(s?.stamp) ||
        Number(s.stamp) < 1 ||
        Number(s.stamp) > 10 ||
        !reward ||
        reward.length > 60 ||
        !categories.includes(s.category)
      ) {
        errors.stamp_rewards = 'Each stamp reward needs a stamp (1–10), a name and a menu section.';
        break;
      }
      out.stamp_rewards.push({ stamp: Math.trunc(Number(s.stamp)), reward, category: s.category });
    }
    out.stamp_rewards.sort((a, b) => a.stamp - b.stamp);
  }
  const free = input.free_delivery_tiers ?? [];
  if (!Array.isArray(free) || free.some((k) => !TIER_KEYS.includes(k)))
    errors.free_delivery_tiers = 'Choose tiers.';
  else out.free_delivery_tiers = TIER_KEYS.filter((k) => free.includes(k));
  if (Object.keys(errors).length) throw fail.fields(errors);
  return out;
}

function adminRewards() {
  return db
    .all('rewards_catalog')
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.points_cost - b.points_cost)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      pointsCost: r.points_cost,
      type: r.reward_type,
      creditKobo: r.credit_kobo,
      dishId: r.dish_id,
      categorySlug: r.category_slug,
      dineInOnly: !!r.dine_in_only,
      isActive: !!r.is_active,
      sortOrder: r.sort_order,
      redeemed: db.where('points_ledger', (p) => p.entry_type === 'redeem' && p.reference === r.slug).length,
    }));
}

function loyaltySettingsPayload() {
  return {
    settings: db.settings('loyalty'),
    categories: db
      .all('categories')
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ slug: c.slug, name: c.name })),
    rewards: adminRewards(),
  };
}

route('GET', '/admin/loyalty/settings', () => loyaltySettingsPayload(), 'loyalty.manage');

route(
  'PUT',
  '/admin/loyalty/settings',
  ({ body, user }) => {
    const clean = validateLoyaltySettings(
      body,
      db.all('categories').map((c) => c.slug),
    );
    const before = db.settings('loyalty');
    db.saveSettings('loyalty', { ...before, ...clean });
    const changed = Object.keys(clean).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(clean[k]));
    audit(user.id, 'loyalty.settings_updated', 'settings', 'loyalty', {
      changed,
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, clean[k]])),
    });
    return loyaltySettingsPayload();
  },
  'loyalty.manage',
);

function saveReward({ params, body, user }) {
  const creating = !params.id;
  const req = creating ? 'required' : 'nullable';
  const data = validate(
    body,
    {
      name: `${req}|string|max:120`,
      description: `${req}|string|max:255`,
      points_cost: `${req}|int|min:1|max:1000000`,
      reward_type: `${req}|string|in:credit,item,upgrade`,
      credit_naira: 'nullable|int|min:1|max:1000000',
      dish_id: 'nullable|int|min:1',
      category_slug: 'nullable|string|max:30',
      dine_in_only: 'nullable|bool',
      is_active: 'nullable|bool',
      sort_order: 'nullable|int|min:0|max:999',
    },
    { points_cost: 'Points', credit_naira: 'Credit' },
  );
  const cols = {};
  for (const k of [
    'name',
    'description',
    'points_cost',
    'reward_type',
    'dish_id',
    'category_slug',
    'sort_order',
  ])
    if (k in data) cols[k] = data[k];
  for (const k of ['dine_in_only', 'is_active']) if (data[k] != null) cols[k] = data[k] ? 1 : 0;
  if ('credit_naira' in data) cols.credit_kobo = data.credit_naira !== null ? data.credit_naira * 100 : null;
  const type = cols.reward_type ?? (creating ? null : db.byId('rewards_catalog', params.id)?.reward_type);
  if (type === 'credit' && creating && !cols.credit_kobo)
    throw fail.field('credit_naira', 'Enter the dining credit this reward gives.');
  let id;
  if (creating) {
    const slug = slugify(data.name);
    if (db.find('rewards_catalog', (r) => r.slug === slug))
      throw fail.field('name', 'A reward with that name already exists.');
    id = db.insert('rewards_catalog', { ...cols, slug }).id;
  } else {
    const r = db.byId('rewards_catalog', params.id);
    if (!r) throw fail.notFound();
    Object.assign(r, cols);
    id = r.id;
  }
  audit(user.id, creating ? 'loyalty.reward_created' : 'loyalty.reward_updated', 'reward', id, cols);
  return { rewards: adminRewards() };
}

route('POST', '/admin/loyalty/rewards', saveReward, 'loyalty.manage');
route('PATCH', '/admin/loyalty/rewards/:id', saveReward, 'loyalty.manage');

route(
  'GET',
  '/admin/loyalty/analytics',
  () => {
    const at = now();
    const d30 = sql(addDays(at, -30));
    const d90 = sql(addDays(at, -90));
    const customers = db.where('users', isCustomer);
    const accounts = customers.map((u) => accountOf(u.id)).filter((a) => !!a);
    const activity = new Map();
    for (const o of db.where(
      'orders',
      (x) => x.user_id !== null && x.payment_status === 'paid' && x.placed_at >= d90,
    )) {
      activity.set(o.user_id, (activity.get(o.user_id) ?? 0) + 1);
    }
    for (const v of db.where('dine_in_visits', (x) => x.visited_at >= d90))
      activity.set(v.user_id, (activity.get(v.user_id) ?? 0) + 1);
    const buyers = activity.size;
    const repeaters = [...activity.values()].filter((n) => n >= 2).length;
    const flows = new Map();
    for (const l of db.where('wallet_ledger', (x) => x.created_at >= d30)) {
      const k = `${l.entry_type}:${l.direction}`;
      flows.set(k, (flows.get(k) ?? 0) + l.amount_kobo);
    }
    const sum = (keys) => keys.reduce((s, k) => s + (flows.get(k) ?? 0), 0);
    const points = db.where('points_ledger', (x) => x.created_at >= d30);
    return {
      members: customers.filter((u) => !!u.is_active).length,
      activeMembers90d: accounts.filter((a) => a.last_activity_at !== null && a.last_activity_at >= d90)
        .length,
      repeatRate90d: buyers > 0 ? Math.round((repeaters / buyers) * 10000) / 10000 : 0,
      last30d: {
        creditIssuedKobo: {
          topups: sum(['topup:credit']),
          bonuses: sum(['topup_bonus:credit']),
          interest: sum(['interest:credit']),
          referrals: sum(['referral_bonus:credit']),
          rewards: sum(['reward_redemption:credit', 'birthday:credit', 'anniversary:credit']),
          adjustments: sum(['adjustment:credit']) - sum(['adjustment:debit']),
        },
        creditSpentKobo: sum(['payment:debit']) - sum(['refund:credit']),
        totalIssuedKobo: sum([
          'topup:credit',
          'topup_bonus:credit',
          'interest:credit',
          'referral_bonus:credit',
          'reward_redemption:credit',
          'birthday:credit',
          'anniversary:credit',
        ]),
        pointsIssued: points.filter((p) => p.direction === 'credit').reduce((s, p) => s + p.points, 0),
        pointsRedeemed: points.filter((p) => p.entry_type === 'redeem').reduce((s, p) => s + p.points, 0),
        pointsExpired: points.filter((p) => p.entry_type === 'expire').reduce((s, p) => s + p.points, 0),
      },
      outstanding: {
        walletKobo: accounts.reduce((s, a) => s + a.wallet_balance_kobo, 0),
        points: accounts.reduce((s, a) => s + a.points_balance, 0),
      },
      tiers: TIER_KEYS.map((key) => ({ key, members: accounts.filter((a) => a.tier === key).length })),
      topMembers: accounts
        .slice()
        .sort((a, b) => b.spend_12m_kobo - a.spend_12m_kobo)
        .slice(0, 10)
        .map((a) => ({
          id: a.user_id,
          name: fullName(db.byId('users', a.user_id)),
          tier: a.tier,
          spend12mKobo: a.spend_12m_kobo,
          walletKobo: a.wallet_balance_kobo,
          points: a.points_balance,
        })),
      interestRuns: loyalty.interestRuns(),
    };
  },
  'loyalty.manage',
);

route(
  'GET',
  '/admin/loyalty/ledger',
  (ctx) => {
    const { page } = paging(ctx);
    const kind = q(ctx, 'kind') === 'points' ? 'points' : 'wallet';
    const [table, amount, balance] =
      kind === 'points'
        ? ['points_ledger', 'points', 'balance_after']
        : ['wallet_ledger', 'amount_kobo', 'balance_after_kobo'];
    let rows = db.all(table).slice();
    const type = q(ctx, 'type');
    if (type && /^[a-z_]{2,30}$/.test(type)) rows = rows.filter((r) => r.entry_type === type);
    const text = q(ctx, 'q');
    if (text) {
      const m = like(text);
      rows = rows.filter((r) => {
        const u = db.byId('users', r.user_id);
        return m(fullName(u)) || m(u?.email) || m(r.reference);
      });
    }
    rows.sort((a, b) => b.id - a.id);
    return {
      kind,
      ...paged(
        rows.map((r) => ({
          id: r.id,
          member: { id: r.user_id, name: fullName(db.byId('users', r.user_id)) },
          type: r.entry_type,
          direction: r.direction,
          amount: r[amount],
          balanceAfter: r[balance],
          reference: r.reference,
          description: r.description,
          by: fullName(db.byId('users', r.created_by_user_id)),
          at: r.created_at,
        })),
        page,
      ),
    };
  },
  'loyalty.manage',
);

route(
  'POST',
  '/admin/loyalty/interest-runs',
  ({ body, user }) => {
    const data = validate(body, { period: 'required|string|regex:/^\\d{4}-(0[1-9]|1[0-2])$/' });
    return {
      result: loyalty.runInterest(data.period, 'admin', user.id),
      interestRuns: loyalty.interestRuns(),
    };
  },
  'loyalty.interest',
);

route(
  'POST',
  '/admin/loyalty/interest-runs/simulate',
  ({ user }) => ({
    result: loyalty.runInterest(ymd(now()).slice(0, 7), 'demo', user.id),
    interestRuns: loyalty.interestRuns(),
  }),
  'loyalty.interest',
);

/* ------------------------------------------------------------------- content */

function adminReview(r) {
  return {
    id: r.id,
    author: r.author_name,
    dish: db.byId('dishes', r.dish_id)?.name ?? null,
    orderReference: db.byId('orders', r.order_id)?.reference ?? null,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status,
    reply: r.admin_reply,
    repliedAt: r.replied_at,
    createdAt: r.created_at,
    verified: r.order_id !== null,
  };
}

/** New/pending items first, then newest. */
const firstThenNewest = (flag) => (a, b) =>
  Number(flag(b)) - Number(flag(a)) || b.created_at.localeCompare(a.created_at);

route(
  'GET',
  '/admin/reviews',
  (ctx) => {
    const status = q(ctx, 'status');
    const rows = db
      .where(
        'reviews',
        (r) => !status || !['pending', 'approved', 'hidden'].includes(status) || r.status === status,
      )
      .sort(firstThenNewest((r) => r.status === 'pending'));
    return paged(rows.map(adminReview), paging(ctx).page);
  },
  'reviews.moderate',
);

route(
  'PATCH',
  '/admin/reviews/:id',
  ({ params, body, user }) => {
    const r = db.byId('reviews', params.id);
    if (!r) throw fail.notFound();
    const data = validate(body, {
      status: 'nullable|string|in:pending,approved,hidden',
      reply: 'nullable|string|max:1000',
    });
    const set = {};
    if (data.status) set.status = data.status;
    if ('reply' in data) {
      set.admin_reply = data.reply;
      set.replied_at = data.reply ? sql() : null;
    }
    Object.assign(r, set);
    delete set.replied_at;
    audit(user.id, 'review.moderated', 'review', r.id, set);
    return { review: adminReview(r) };
  },
  'reviews.moderate',
);

function couponsPayload() {
  const at = sql();
  const rows = db
    .all('coupons')
    .slice()
    .sort(
      (a, b) =>
        Number(a.code.startsWith('MISS-')) - Number(b.code.startsWith('MISS-')) ||
        b.is_active - a.is_active ||
        b.created_at.localeCompare(a.created_at),
    );
  return {
    coupons: rows.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      discountType: c.discount_type,
      discountValue: c.discount_value,
      minOrderKobo: c.min_order_kobo,
      maxDiscountKobo: c.max_discount_kobo,
      kitchenId: c.kitchen_id,
      validWeekdays:
        c.valid_weekdays !== null && c.valid_weekdays !== ''
          ? String(c.valid_weekdays).split(',').map(Number)
          : null,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      usageLimit: c.usage_limit,
      perUserLimit: c.per_user_limit,
      firstOrderOnly: !!c.first_order_only,
      timesUsed: c.times_used,
      isActive: !!c.is_active,
      live:
        !!c.is_active &&
        (c.ends_at === null || c.ends_at > at) &&
        (c.starts_at === null || c.starts_at <= at) &&
        (c.usage_limit === null || c.times_used < c.usage_limit),
      personal: c.code.startsWith('MISS-'),
    })),
  };
}

route('GET', '/admin/coupons', () => couponsPayload(), 'coupons.manage');

function saveCoupon({ params, body, user }) {
  const creating = !params.id;
  const req = creating ? 'required' : 'nullable';
  const data = validate(
    body,
    {
      code: `${req}|string|min:3|max:30|regex:/^[A-Z0-9_-]+$/`,
      description: `${req}|string|max:255`,
      discount_type: `${req}|string|in:percent,fixed`,
      discount_value: `${req}|int|min:1|max:10000000`,
      min_order_naira: 'nullable|int|min:0|max:10000000',
      max_discount_naira: 'nullable|int|min:1|max:10000000',
      kitchen_id: 'nullable|int|min:1',
      starts_at: 'nullable|date',
      ends_at: 'nullable|date',
      usage_limit: 'nullable|int|min:1|max:1000000',
      per_user_limit: 'nullable|int|min:1|max:1000',
      first_order_only: 'nullable|bool',
      is_active: 'nullable|bool',
    },
    { discount_value: 'Discount', min_order_naira: 'Minimum order', max_discount_naira: 'Maximum discount' },
  );
  if (data.discount_type === 'percent' && (data.discount_value ?? 0) > 100) {
    throw fail.field('discount_value', 'A percentage discount can be at most 100%.');
  }
  if (data.starts_at && data.ends_at && data.starts_at > data.ends_at) {
    throw fail.field('ends_at', 'The end date must be after the start date.');
  }
  const cols = {};
  for (const k of ['code', 'description', 'discount_type', 'kitchen_id', 'usage_limit', 'per_user_limit'])
    if (k in data) cols[k] = data[k];
  if ('discount_value' in data) {
    const type = data.discount_type ?? (creating ? null : db.byId('coupons', params.id)?.discount_type);
    cols.discount_value = type === 'fixed' ? data.discount_value * 100 : data.discount_value;
  }
  if ('min_order_naira' in data)
    cols.min_order_kobo = data.min_order_naira !== null ? data.min_order_naira * 100 : 0;
  if ('max_discount_naira' in data)
    cols.max_discount_kobo = data.max_discount_naira !== null ? data.max_discount_naira * 100 : null;
  if ('starts_at' in data) cols.starts_at = data.starts_at ? `${data.starts_at} 00:00:00` : null;
  if ('ends_at' in data) cols.ends_at = data.ends_at ? `${data.ends_at} 23:59:59` : null;
  if ('valid_weekdays' in body) {
    const days = Array.isArray(body.valid_weekdays) ? body.valid_weekdays.map(Number) : [];
    if (days.some((d) => !(d >= 0 && d <= 6))) throw fail.field('valid_weekdays', 'Choose days of the week.');
    cols.valid_weekdays = days.length ? [...new Set(days)].join(',') : null;
  }
  for (const k of ['first_order_only', 'is_active']) if (data[k] != null) cols[k] = data[k] ? 1 : 0;
  if (cols.code && db.find('coupons', (c) => c.code === cols.code && c.id !== Number(params.id ?? 0))) {
    throw fail.field('code', 'That code is already in use.');
  }
  let id;
  if (creating) id = db.insert('coupons', cols).id;
  else {
    const c = db.byId('coupons', params.id);
    if (!c) throw fail.notFound();
    Object.assign(c, cols);
    id = c.id;
  }
  audit(user.id, creating ? 'coupon.created' : 'coupon.updated', 'coupon', id, cols);
  return couponsPayload();
}

route('POST', '/admin/coupons', saveCoupon, 'coupons.manage');
route('PATCH', '/admin/coupons/:id', saveCoupon, 'coupons.manage');

route(
  'POST',
  '/admin/coupons/:id/expire',
  ({ params, user }) => {
    const c = db.byId('coupons', params.id);
    if (!c) throw fail.notFound();
    Object.assign(c, { is_active: 0, ends_at: sql() });
    audit(user.id, 'coupon.expired', 'coupon', c.id, { code: c.code });
    return couponsPayload();
  },
  'coupons.manage',
);

route(
  'GET',
  '/admin/enquiries',
  (ctx) => {
    const status = q(ctx, 'status');
    const valid = status && ['new', 'contacted', 'quoted', 'booked', 'closed'].includes(status);
    const rows = db
      .where('event_enquiries', (e) => !valid || e.status === status)
      .sort(firstThenNewest((e) => e.status === 'new'));
    return paged(
      rows.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        phone: e.phone,
        company: e.company,
        eventType: e.event_type,
        package: db.byId('event_packages', e.package_id)?.name ?? null,
        eventDate: e.event_date,
        guests: e.guests,
        budgetKobo: e.budget_kobo,
        message: e.message,
        status: e.status,
        createdAt: e.created_at,
      })),
      paging(ctx).page,
    );
  },
  'enquiries.manage',
);

route(
  'PATCH',
  '/admin/enquiries/:id',
  ({ params, body, user }) => {
    const e = db.byId('event_enquiries', params.id);
    if (!e) throw fail.notFound();
    const data = validate(body, { status: 'required|string|in:new,contacted,quoted,booked,closed' });
    audit(user.id, 'enquiry.updated', 'event_enquiry', e.id, { from: e.status, to: data.status });
    e.status = data.status;
    return { ok: true, status: data.status };
  },
  'enquiries.manage',
);

route(
  'GET',
  '/admin/messages',
  (ctx) => {
    const status = q(ctx, 'status');
    const valid = status && ['new', 'read', 'replied', 'archived'].includes(status);
    const rows = db
      .where('contact_messages', (m) => (valid ? m.status === status : m.status !== 'archived'))
      .sort(firstThenNewest((m) => m.status === 'new'));
    return paged(
      rows.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        subject: m.subject,
        message: m.message,
        status: m.status,
        createdAt: m.created_at,
      })),
      paging(ctx).page,
    );
  },
  'enquiries.manage',
);

route(
  'PATCH',
  '/admin/messages/:id',
  ({ params, body, user }) => {
    const m = db.byId('contact_messages', params.id);
    if (!m) throw fail.notFound();
    const data = validate(body, { status: 'required|string|in:new,read,replied,archived' });
    m.status = data.status;
    audit(user.id, 'message.updated', 'contact_message', m.id, { to: data.status });
    return { ok: true, status: data.status };
  },
  'enquiries.manage',
);

/* --------------------------------------------------------------------- staff */

const ROLE_ORDER = ['super_admin', 'manager', 'staff'];

function staffPayload() {
  return {
    staff: db
      .where('users', (u) => ROLE_ORDER.includes(u.role))
      .sort(
        (a, b) =>
          ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.first_name.localeCompare(b.first_name),
      )
      .map((u) => ({
        id: u.id,
        name: fullName(u),
        email: u.email,
        phone: u.phone,
        role: u.role,
        staffPosition: u.staff_position,
        isActive: !!u.is_active,
        twoFactorEnabled: u.totp_enabled_at !== null,
        lastLoginAt: u.last_login_at,
        lockedUntil: u.locked_until,
      })),
  };
}

const checkPosition = (role, position) => {
  if (role === 'staff' && !['kitchen', 'front_desk'].includes(position ?? '')) {
    throw fail.field('staff_position', 'Choose kitchen or front desk.');
  }
};

function findStaff(id) {
  const u = db.find('users', (x) => x.id === Number(id) && ROLE_ORDER.includes(x.role));
  if (!u) throw fail.notFound();
  return u;
}

route('GET', '/admin/staff', () => staffPayload(), 'staff.manage');

route(
  'POST',
  '/admin/staff',
  ({ body, user }) => {
    const data = validate(
      body,
      {
        first_name: 'required|string|max:80',
        last_name: 'required|string|max:80',
        email: 'required|email',
        phone: 'nullable|phone',
        role: 'required|string|in:super_admin,manager,staff',
        staff_position: 'nullable|string|in:kitchen,front_desk',
      },
      { first_name: 'First name', last_name: 'Last name' },
    );
    checkPosition(data.role, data.staff_position ?? null);
    if (db.find('users', (u) => u.email === data.email)) {
      throw fail.field('email', 'Someone already has an account with this email. Change their role instead.');
    }
    const created = db.insert('users', {
      role: data.role,
      staff_position: data.role === 'staff' ? data.staff_position : null,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone ?? null,
    });
    // The real API emails an invitation link; the demo can't send email.
    audit(user.id, 'staff.created', 'user', created.id, {
      role: data.role,
      position: data.staff_position ?? null,
    });
    return staffPayload();
  },
  'staff.manage',
);

route(
  'PATCH',
  '/admin/staff/:id',
  ({ params, body, user }) => {
    const target = findStaff(params.id);
    const data = validate(body, {
      role: 'nullable|string|in:super_admin,manager,staff,customer',
      staff_position: 'nullable|string|in:kitchen,front_desk',
      is_active: 'nullable|bool',
    });
    const role = data.role ?? target.role;
    const position = 'staff_position' in data ? data.staff_position : target.staff_position;
    const active = data.is_active ?? !!target.is_active;
    if (target.id === user.id && (role !== target.role || !active)) {
      throw fail.conflict('You can’t change your own role or suspend yourself. Ask another Super Admin.');
    }
    if (target.role === 'super_admin' && (role !== 'super_admin' || !active)) {
      if (!db.find('users', (u) => u.role === 'super_admin' && !!u.is_active && u.id !== target.id)) {
        throw fail.conflict('There must always be at least one active Super Admin.');
      }
    }
    if (role !== 'customer') checkPosition(role, position);
    const from = { role: target.role, position: target.staff_position, active: !!target.is_active };
    Object.assign(target, {
      role,
      staff_position: role === 'staff' ? position : null,
      is_active: active ? 1 : 0,
    });
    if (role === 'customer') loyalty.account(target.id);
    if (getState().userId === target.id && !active) getState().userId = null;
    audit(user.id, 'staff.updated', 'user', target.id, {
      from,
      to: { role, position: role === 'staff' ? position : null, active },
    });
    return staffPayload();
  },
  'staff.manage',
);

route(
  'POST',
  '/admin/staff/:id/reset-2fa',
  ({ params, user }) => {
    const target = findStaff(params.id);
    target.totp_enabled_at = null;
    audit(user.id, 'staff.2fa_reset', 'user', target.id);
    return staffPayload();
  },
  'staff.manage',
);

route(
  'POST',
  '/admin/staff/:id/invite',
  ({ params, user }) => {
    const target = findStaff(params.id);
    if (!target.is_active) throw fail.notFound();
    audit(user.id, 'staff.invite_sent', 'user', target.id);
    return { ok: true };
  },
  'staff.manage',
);

/* ------------------------------------------------------------------ settings */

const SETTING_GROUPS = {
  restaurant: {
    name: 'required|string|max:80',
    tagline: 'required|string|max:120',
    address: 'required|string|max:200',
    phone: 'required|string|max:30',
    whatsapp: 'required|string|max:20|regex:/^\\+?\\d{8,15}$/',
    email: 'required|email',
    instagram: 'nullable|string|max:200|regex:#^https://#',
    tiktok: 'nullable|string|max:200|regex:#^https://#',
    map_embed_query: 'required|string|max:200',
  },
  pricing: {
    prices_include_vat: 'required|bool',
    vat_rate_bp: 'required|int|min:0|max:3000',
    service_charge_dine_in_bp: 'required|int|min:0|max:3000',
    service_charge_online_bp: 'required|int|min:0|max:3000',
    packaging_fee_kobo: 'required|int|min:0|max:1000000',
  },
  ordering: {
    accepting_orders: 'required|bool',
    min_lead_minutes: 'required|int|min:10|max:240',
    max_schedule_days: 'required|int|min:0|max:30',
    max_items_per_order: 'required|int|min:1|max:200',
  },
  reservations: {
    min_advance_minutes: 'required|int|min:0|max:1440',
    max_days_ahead: 'required|int|min:1|max:365',
    max_party_online: 'required|int|min:1|max:50',
    dining_duration_minutes: 'required|int|min:30|max:360',
  },
};

function settingsPayload() {
  const hhmm = (t) => (t ? t.slice(0, 5) : null);
  return {
    groups: Object.fromEntries(Object.keys(SETTING_GROUPS).map((g) => [g, db.settings(g)])),
    hours: db
      .all('opening_hours')
      .slice()
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .map((h) => ({
        dayOfWeek: h.day_of_week,
        opensAt: hhmm(h.opens_at),
        closesAt: hhmm(h.closes_at),
        isClosed: !!h.is_closed,
      })),
    zones: db
      .all('delivery_zones')
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((z) => ({
        id: z.id,
        slug: z.slug,
        name: z.name,
        feeKobo: z.fee_kobo,
        minOrderKobo: z.min_order_kobo,
        etaMinutes: z.eta_minutes,
        isActive: !!z.is_active,
      })),
    seating: db
      .all('seating_areas')
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        description: a.description,
        coversPerSlot: a.covers_per_slot,
        minParty: a.min_party,
        maxParty: a.max_party,
        isActive: !!a.is_active,
      })),
  };
}

route('GET', '/admin/settings', () => settingsPayload(), 'settings.manage');

route(
  'PUT',
  '/admin/settings/hours',
  ({ body, user }) => {
    const days = body.hours;
    if (!Array.isArray(days) || days.length !== 7) throw fail.field('hours', 'Send all seven days.');
    const rows = new Map();
    for (const d of days) {
      const c = validate(
        d ?? {},
        {
          day_of_week: 'required|int|min:0|max:6',
          opens_at: 'nullable|time',
          closes_at: 'nullable|time',
          is_closed: 'required|bool',
        },
        { opens_at: 'Opening time', closes_at: 'Closing time' },
      );
      if (!c.is_closed && (!c.opens_at || !c.closes_at || c.opens_at >= c.closes_at)) {
        throw fail.field('hours', 'Each open day needs an opening time before its closing time.');
      }
      rows.set(c.day_of_week, c);
    }
    if (rows.size !== 7) throw fail.field('hours', 'Send each day once.');
    for (const [day, c] of rows) {
      const h = db.find('opening_hours', (x) => x.day_of_week === day);
      if (h) {
        Object.assign(h, {
          opens_at: c.is_closed ? null : `${c.opens_at}:00`,
          closes_at: c.is_closed ? null : `${c.closes_at}:00`,
          is_closed: c.is_closed ? 1 : 0,
        });
      }
    }
    audit(user.id, 'settings.hours_updated', 'settings', 'opening_hours', { hours: [...rows.values()] });
    return settingsPayload();
  },
  'settings.manage',
);

function saveZone({ params, body, user }) {
  const creating = !params.id;
  const req = creating ? 'required' : 'nullable';
  const data = validate(
    body,
    {
      name: `${req}|string|max:80`,
      fee_naira: `${req}|int|min:0|max:100000`,
      min_order_naira: `${req}|int|min:0|max:1000000`,
      eta_minutes: `${req}|int|min:10|max:240`,
      is_active: 'nullable|bool',
    },
    { fee_naira: 'Delivery fee', min_order_naira: 'Minimum order', eta_minutes: 'Delivery time' },
  );
  const cols = {};
  if (data.name != null) cols.name = data.name;
  if (data.fee_naira != null) cols.fee_kobo = data.fee_naira * 100;
  if (data.min_order_naira != null) cols.min_order_kobo = data.min_order_naira * 100;
  if (data.eta_minutes != null) cols.eta_minutes = data.eta_minutes;
  if (data.is_active != null) cols.is_active = data.is_active ? 1 : 0;
  let id;
  if (creating) {
    const slug = slugify(data.name);
    if (db.find('delivery_zones', (z) => z.slug === slug))
      throw fail.field('name', 'That delivery area already exists.');
    id = db.insert('delivery_zones', { ...cols, slug, sort_order: 99 }).id;
  } else {
    const z = db.byId('delivery_zones', params.id);
    if (!z) throw fail.notFound();
    Object.assign(z, cols);
    id = z.id;
  }
  audit(user.id, creating ? 'settings.zone_created' : 'settings.zone_updated', 'delivery_zone', id, cols);
  return settingsPayload();
}

route('POST', '/admin/settings/zones', saveZone, 'settings.manage');
route('PATCH', '/admin/settings/zones/:id', saveZone, 'settings.manage');

route(
  'PATCH',
  '/admin/settings/seating/:id',
  ({ params, body, user }) => {
    const area = db.byId('seating_areas', params.id);
    if (!area) throw fail.notFound();
    const data = validate(
      body,
      {
        covers_per_slot: 'required|int|min:0|max:500',
        min_party: 'required|int|min:1|max:50',
        max_party: 'required|int|min:1|max:100',
        is_active: 'required|bool',
      },
      { covers_per_slot: 'Covers per slot' },
    );
    if (data.min_party > data.max_party)
      throw fail.field('max_party', 'The largest party must be at least the smallest.');
    Object.assign(area, { ...data, is_active: data.is_active ? 1 : 0 });
    audit(user.id, 'settings.seating_updated', 'seating_area', area.slug, data);
    return settingsPayload();
  },
  'settings.manage',
);

route(
  'PUT',
  '/admin/settings/:group',
  ({ params, body, user }) => {
    const rules = SETTING_GROUPS[params.group];
    if (!rules) throw fail.notFound();
    const clean = validate(body, rules);
    const before = db.settings(params.group);
    db.saveSettings(params.group, { ...before, ...clean });
    const changed = Object.keys(clean).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(clean[k]));
    audit(user.id, 'settings.updated', 'settings', params.group, {
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, clean[k]])),
    });
    return settingsPayload();
  },
  'settings.manage',
);

/* --------------------------------------------------------------------- audit */

route(
  'GET',
  '/admin/audit',
  (ctx) => {
    let rows = db.all('audit_logs').slice();
    const action = q(ctx, 'action');
    if (action && /^[a-z0-9_.]{2,80}$/.test(action)) {
      rows = rows.filter((l) =>
        action.includes('.') ? l.action === action : String(l.action).startsWith(`${action}.`),
      );
    }
    const actor = q(ctx, 'actor');
    if (actor && /^\d+$/.test(actor)) rows = rows.filter((l) => l.actor_user_id === Number(actor));
    if (q(ctx, 'staff') === '1')
      rows = rows.filter((l) => ROLE_ORDER.includes(db.byId('users', l.actor_user_id)?.role));
    const text = q(ctx, 'q');
    if (text) {
      const m = like(text);
      rows = rows.filter((l) => m(l.entity_id) || m(fullName(db.byId('users', l.actor_user_id))));
    }
    rows.sort((a, b) => b.id - a.id);
    return paged(
      rows.map((l) => {
        const u = db.byId('users', l.actor_user_id);
        return {
          id: l.id,
          action: l.action,
          actor: u ? { id: u.id, name: fullName(u), role: u.role } : null,
          entityType: l.entity_type,
          entityId: l.entity_id,
          meta: l.meta ? JSON.parse(l.meta) : null,
          ip: l.ip,
          at: l.created_at,
        };
      }),
      paging(ctx).page,
    );
  },
  'audit.view',
);
