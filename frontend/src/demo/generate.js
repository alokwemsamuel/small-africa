import { db } from './db';
import { seeded } from './random';
import { addDays, addMinutes, parse, sql, startOfDay, weekday, ymd } from './time';

/**
 * DEMO DATA ONLY. Port of backend/src/Seeds/DemoOperationsSeeder.php, run in the browser
 * relative to today so the dashboard is always current: guest-checkout orders every day for
 * 30 days (more on Fridays and weekends, lunch and dinner peaks, all three kitchens, Jollof
 * and Pierogi the favourites), today's orders still in the kitchen, and reservations around
 * today. Members' Interest Account history comes from the exported snapshot instead.
 */

const FIRST = [
  'Adaeze',
  'Chinedu',
  'Folake',
  'Yemi',
  'Ngozi',
  'Tobi',
  'Kelechi',
  'Amaka',
  'Seyi',
  'Bola',
  'Ifeoma',
  'Uche',
  'Damilola',
  'Obinna',
  'Zainab',
  'Musa',
  'Aisha',
  'Kunle',
  'Temi',
  'Efe',
  'Agnieszka',
  'Paweł',
  'Magda',
  'Krzysztof',
  'Ola',
  'Tomek',
  'Kasia',
  'Michał',
  'Sarah',
  'James',
  'Fatima',
  'Ibrahim',
];
const LAST = [
  'Okafor',
  'Adebayo',
  'Eze',
  'Balogun',
  'Nwachukwu',
  'Okoro',
  'Adeyemi',
  'Lawal',
  'Ibrahim',
  'Okonkwo',
  'Ogunleye',
  'Bello',
  'Danjuma',
  'Afolabi',
  'Nowak',
  'Kowalski',
  'Wójcik',
  'Lewandowski',
  'Kamińska',
  'Mensah',
  'Johnson',
  'Williams',
];
const KITCHEN_WEIGHT = { nigerian: 45, polish: 30, continental: 25 };
const FAVOURITES = {
  'smoky-party-jollof': 14,
  'pierogi-ruskie': 11,
  'beef-suya-platter': 5,
  'egusi-pounded-yam': 5,
  'pierogi-z-miesem': 4,
  'beef-wellington': 3,
  golabki: 3,
  'grilled-salmon': 3,
};
/** About one order in five is built around a signature dish, whatever the kitchen mix that week. */
const SIGNATURE_PERCENT = 20;
const SIGNATURES = { 'smoky-party-jollof': 55, 'pierogi-ruskie': 45 };
const STREETS = ['Adeola Odeku St', 'Bourdillon Rd', 'Admiralty Way', 'Awolowo Rd', 'Ozumba Mbadiwe Ave'];
const CANCEL_REASONS = [
  'Guest called to cancel',
  'Rider could not reach the address',
  'Kitchen ran out of an item',
];

/** 'Paweł Wójcik' → 'pawelwojcik' (like the seeder's iconv transliteration). */
const ascii = (name) =>
  name
    .replace(/ł/g, 'l')
    .normalize('NFKD')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();

export function generateOperations(at) {
  // Same data all day (a rebuild after "Reset demo" looks the same), different each day.
  const rng = seeded(4242 + Math.floor(at.getTime() / 86_400_000));
  const byKitchen = {};
  const drinks = [];
  for (const d of db.where('dishes', (x) => x.deleted_at === null && !x.is_alcoholic)) {
    const category = db.byId('categories', d.category_id)?.slug;
    const kitchen = db.byId('kitchens', d.kitchen_id)?.slug;
    if (category === 'tasting') continue;
    const row = { ...d, category, kitchen };
    if (category === 'drinks') drinks.push(row);
    else if (kitchen) (byKitchen[kitchen] ??= []).push(row);
  }
  const zones = db.where('delivery_zones', (z) => !!z.is_active);
  const coupon = (c) => db.find('coupons', (x) => x.code === c);
  const name = () => `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  const kitchenStaff = db.find('users', (u) => u.role === 'staff' && u.staff_position === 'kitchen');
  const frontDesk = db.find('users', (u) => u.role === 'staff' && u.staff_position === 'front_desk');

  const pickDish = (kitchen) => {
    const pool = byKitchen[kitchen];
    return pool[rng.index(pool.map((d) => (FAVOURITES[d.slug] ?? 1) * (d.category === 'sides' ? 1 : 2)))];
  };

  /** Older orders are finished; the last ~90 minutes are still moving through the kitchen. */
  const status = (placed, delivery) => {
    const age = Math.floor((at.getTime() - placed.getTime()) / 60_000);
    if (age > 100) {
      return rng.int(1, 100) <= 4
        ? ['cancelled', rng.int(3, 15)]
        : [delivery ? 'delivered' : 'completed', delivery ? rng.int(55, 85) : rng.int(30, 45)];
    }
    if (age < 5) return ['received', 0];
    if (age < 28) return ['preparing', 4];
    if (age < 34) return ['ready', 28];
    if (delivery && age < 80) return ['out_for_delivery', 34];
    return [delivery ? 'delivered' : 'completed', Math.min(age, delivery ? 80 : 40)];
  };

  const order = (placed, dow, scheduledFor = null) => {
    const lines = new Map();
    const signatureSlug = rng.int(1, 100) <= SIGNATURE_PERCENT ? rng.weighted(SIGNATURES) : null;
    const signature = signatureSlug
      ? Object.values(byKitchen)
          .flat()
          .find((d) => d.slug === signatureSlug)
      : undefined;
    const kitchen = signature?.kitchen ?? rng.weighted(KITCHEN_WEIGHT);
    const mains = rng.int(1, 100) <= 70 ? rng.int(1, 2) : rng.int(2, 3);
    for (let i = 0; i < mains; i++) {
      // Most orders stay in one kitchen; some mix kitchens, as the menu invites.
      const k = i === 0 || rng.int(1, 100) <= 60 ? kitchen : rng.weighted(KITCHEN_WEIGHT);
      const dish = i === 0 && signature ? signature : pickDish(k);
      const qty = (lines.get(dish.id)?.qty ?? 0) + (rng.int(1, 100) <= 25 ? 2 : 1);
      lines.set(dish.id, { dish, qty, total: 0 });
    }
    if (drinks.length && rng.int(1, 100) <= 45) {
      const drink = rng.pick(drinks);
      lines.set(drink.id, { dish: drink, qty: rng.int(1, 2), total: 0 });
    }
    let subtotal = 0;
    for (const l of lines.values()) {
      l.total = l.dish.price_kobo * l.qty;
      subtotal += l.total;
    }
    let used = null;
    let discount = 0;
    if (dow === 5 && kitchen === 'nigerian' && rng.int(1, 100) <= 40 && coupon('JOLLOFFRIDAY')) {
      const nigerian = [...lines.values()].reduce(
        (s, l) => s + (l.dish.kitchen === 'nigerian' ? l.total : 0),
        0,
      );
      discount = Math.min(400000, Math.floor((nigerian * 20) / 100));
      used = coupon('JOLLOFFRIDAY');
    } else if (rng.int(1, 100) <= 8 && coupon('WELCOME10')) {
      discount = Math.min(500000, Math.floor((subtotal * 10) / 100));
      used = coupon('WELCOME10');
    }
    let delivery = rng.int(1, 100) <= 65;
    // Most deliveries go to the island (VI, Ikoyi, Lekki), fewer to the mainland.
    let zone = delivery ? zones[rng.index(zones.map((_, i) => [5, 4, 4, 2, 1, 1, 1][i] ?? 1))] : null;
    let fees = 50000 + (zone ? zone.fee_kobo : 0);
    if (zone && subtotal < zone.min_order_kobo) {
      delivery = false;
      zone = null;
      fees = 50000;
    }
    const total = subtotal - discount + fees;
    const [state, minutes] = scheduledFor ? ['received', 0] : status(placed, delivery);
    const guest = name();
    let reference;
    do reference = rng.code(6, 'SA-');
    while (db.find('orders', (o) => o.reference === reference));
    const o = db.insert('orders', {
      reference,
      customer_name: guest,
      customer_email: `${ascii(guest)}${rng.int(10, 99)}@example.com`,
      customer_phone: `+23480${rng.int(30000000, 99999999)}`,
      fulfilment: delivery ? 'delivery' : 'pickup',
      delivery_zone_id: zone?.id ?? null,
      address_snapshot: zone
        ? JSON.stringify({ line1: `${rng.int(2, 48)} ${rng.pick(STREETS)}`, area: zone.name })
        : null,
      status: state,
      payment_status: 'paid',
      refund_flag: state === 'cancelled' ? 1 : 0,
      subtotal_kobo: subtotal,
      discount_kobo: discount,
      delivery_fee_kobo: fees,
      vat_included_kobo: Math.floor(((subtotal - discount) * 750) / 10750),
      total_kobo: total,
      coupon_id: used?.id ?? null,
      cancelled_reason: state === 'cancelled' ? rng.pick(CANCEL_REASONS) : null,
      scheduled_for: scheduledFor ? sql(scheduledFor) : null,
      placed_at: sql(placed),
      status_updated_at: sql(addMinutes(placed, minutes)),
      created_at: sql(addMinutes(placed, -1)),
    });
    for (const l of lines.values()) {
      db.insert('order_items', {
        order_id: o.id,
        dish_id: l.dish.id,
        dish_name: l.dish.name,
        kitchen_id: l.dish.kitchen_id,
        unit_price_kobo: l.dish.price_kobo,
        quantity: l.qty,
        line_total_kobo: l.total,
        options: JSON.stringify({ portion: null, addons: [], containsPork: !!l.dish.contains_pork }),
      });
      const dish = db.byId('dishes', l.dish.id);
      if (dish) dish.popularity += l.qty;
    }
    const steps =
      state === 'cancelled'
        ? [
            ['pending_payment', -1],
            ['received', 0],
            ['cancelled', minutes],
          ]
        : [
            ['pending_payment', -1],
            ['received', 0],
            ['preparing', 4],
            ['ready', 28],
            [delivery ? 'out_for_delivery' : 'completed', 34],
            ...(delivery ? [['delivered', minutes]] : []),
          ].filter(([, m]) => m <= minutes);
    for (const [s, m] of steps) {
      // Kitchen staff move orders to preparing/ready; the front desk sends and completes them.
      const by = ['preparing', 'ready'].includes(s)
        ? kitchenStaff
        : ['out_for_delivery', 'delivered', 'completed'].includes(s)
          ? frontDesk
          : null;
      db.insert('order_status_history', {
        order_id: o.id,
        status: s,
        changed_by_user_id: by?.id ?? null,
        created_at: sql(addMinutes(placed, m)),
      });
    }
    db.insert('payments', {
      purpose: 'order',
      payable_id: o.id,
      provider: 'simulated',
      reference,
      amount_kobo: total,
      status: 'success',
      verified_at: sql(placed),
      created_at: sql(placed),
    });
    if (used) {
      db.insert('coupon_redemptions', {
        coupon_id: used.id,
        order_id: o.id,
        discount_kobo: discount,
        created_at: sql(placed),
      });
      used.times_used += 1;
    }
  };

  const today = startOfDay(at);
  for (let ago = 29; ago >= 0; ago--) {
    const day = addDays(today, -ago);
    const dow = weekday(day);
    const [lo, hi] = dow === 5 ? [11, 14] : dow === 6 || dow === 0 ? [9, 12] : [5, 8];
    const count = rng.int(lo, hi);
    for (let i = 0; i < count; i++) {
      // Lunch (12:00–14:30) and dinner (18:00–21:45) peaks, a few in the afternoon.
      const r = rng.int(1, 100);
      const minutes = r <= 35 ? rng.int(720, 870) : r <= 90 ? rng.int(1080, 1305) : rng.int(900, 1065);
      const placed = addMinutes(day, minutes);
      if (placed > addMinutes(at, -5)) continue;
      order(placed, dow);
    }
  }
  // Pre-orders placed earlier today for later today, so the live feed is never empty.
  const hour = at.getUTCHours();
  if (hour >= 7 && hour < 21) {
    for (let i = 0; i < 3; i++) {
      const placed = addMinutes(at, -rng.int(8, 110));
      const noon = parse(`${ymd(at)} 12:15`);
      const earliest = addMinutes(at, 50) > noon ? addMinutes(at, 50) : noon;
      const slot = addMinutes(earliest, i * 30 + rng.int(0, 2) * 15);
      order(
        placed,
        weekday(at),
        parse(
          `${ymd(slot)} ${String(slot.getUTCHours()).padStart(2, '0')}:${String(Math.floor(slot.getUTCMinutes() / 15) * 15).padStart(2, '0')}`,
        ),
      );
    }
  }

  reservations(at, rng, name);
  linkReviews(rng);
  auditTrail(at, kitchenStaff, frontDesk);
}

function reservations(at, rng, name) {
  const areas = db.where('seating_areas', (a) => !!a.is_active);
  const times = db
    .where('reservation_slots', (s) => !!s.is_active)
    .map((s) => String(s.start_time))
    .sort();
  const dinner = times.filter((t) => t >= '18:00:00');
  const occasions = [
    'none',
    'none',
    'none',
    'birthday',
    'anniversary',
    'business',
    'date_night',
    'celebration',
  ];
  const notes = [
    null,
    null,
    null,
    'Window table if possible',
    'Celebrating a promotion',
    'One guest is vegetarian',
    'High chair needed',
    'Nut allergy at the table',
  ];
  const book = (offset, guest) => {
    const day = addDays(startOfDay(at), offset);
    const time = rng.int(1, 100) <= 70 ? rng.pick(dinner) : rng.pick(times);
    const area = rng.pick(areas);
    const party = Math.max(area.min_party, Math.min(area.max_party, rng.int(2, 6)));
    const start = parse(`${ymd(day)} ${time}`);
    const status =
      start < at
        ? start > addMinutes(at, -120)
          ? 'seated'
          : rng.int(1, 100) <= 85
            ? 'completed'
            : rng.int(0, 1)
              ? 'no_show'
              : 'cancelled'
        : rng.int(1, 100) <= 85
          ? 'confirmed'
          : rng.int(1, 100) <= 60
            ? 'pending'
            : 'cancelled';
    let code;
    do code = rng.code(6, 'R-');
    while (db.find('reservations', (r) => r.code === code));
    db.insert('reservations', {
      code,
      user_id: guest?.id ?? null,
      guest_name: guest ? `${guest.first_name} ${guest.last_name}` : name(),
      guest_email: guest?.email ?? `guest${rng.int(100, 999)}@example.com`,
      guest_phone: guest?.phone ?? `+23481${rng.int(30000000, 99999999)}`,
      party_size: party,
      service_date: ymd(day),
      start_time: time,
      seating_area_id: area.id,
      occasion: rng.pick(occasions),
      notes: rng.pick(notes),
      status,
      table_label: ['seated', 'completed'].includes(status) ? `T${rng.int(1, 24)}` : null,
      cancelled_reason: status === 'cancelled' ? 'Cancelled by guest' : null,
      created_at: sql(addDays(start, -rng.int(1, 12))),
    });
  };
  // The first few are today, so the front desk always has guests expected.
  for (let i = 0; i < 34; i++) book(i < 5 ? 0 : rng.int(-16, 16), null);
  // The demo guest account has its own bookings: one coming up, one enjoyed.
  const guest = db.find('users', (u) => u.email === 'guest@smallafrica.demo');
  if (guest) {
    book(4, guest);
    book(-9, guest);
  }
}

/** Most published reviews come from real (guest) orders, so the admin shows them as verified. */
function linkReviews(rng) {
  const done = db.where('orders', (o) => o.user_id === null && ['delivered', 'completed'].includes(o.status));
  if (!done.length) return;
  for (const r of db.where('reviews', (x) => x.user_id === null && x.order_id === null)) {
    if (rng.int(1, 100) <= 70) r.order_id = rng.pick(done).id;
  }
}

/** A plausible recent audit trail, so the Audit page isn't empty on first open. */
function auditTrail(at, kitchen, desk) {
  const admin = db.find('users', (u) => u.role === 'super_admin');
  const manager = db.find('users', (u) => u.role === 'manager');
  const log = (actor, action, type, id, when, meta = null) =>
    db.insert('audit_logs', {
      actor_user_id: actor?.id ?? null,
      action,
      entity_type: type,
      entity_id: id === null ? null : String(id),
      meta: meta ? JSON.stringify(meta) : null,
      ip: '102.89.34.17',
      created_at: sql(when),
    });
  const entries = [];
  for (const r of db.all('interest_runs')) {
    entries.push([
      parse(r.started_at),
      () =>
        log(null, 'loyalty.interest_run', 'interest_run', r.period, parse(r.started_at), {
          trigger: 'cron',
          accounts: r.accounts_credited,
          total_kobo: r.total_kobo,
        }),
    ]);
  }
  for (let ago = 6; ago >= 0; ago--) {
    const day = addDays(startOfDay(at), -ago);
    for (const [user, h] of [
      [kitchen, '10:02'],
      [desk, '10:15'],
      [manager, '11:40'],
    ]) {
      const when = parse(`${ymd(day)} ${h}`);
      if (user && when < at) entries.push([when, () => log(user, 'auth.login', 'user', user.id, when)]);
    }
  }
  const since = sql(addDays(at, -2));
  for (const h of db.where(
    'order_status_history',
    (x) => x.changed_by_user_id !== null && x.created_at >= since,
  )) {
    const o = db.byId('orders', h.order_id);
    const when = parse(h.created_at);
    if (o && when < at) {
      entries.push([
        when,
        () =>
          log(db.byId('users', h.changed_by_user_id), 'order.status', 'order', o.reference, when, {
            to: h.status,
          }),
      ]);
    }
  }
  for (const r of db.where('reviews', (x) => x.replied_at !== null)) {
    const when = parse(r.replied_at);
    if (when < at)
      entries.push([
        when,
        () => log(manager, 'review.moderated', 'review', r.id, when, { admin_reply: r.admin_reply }),
      ]);
  }
  const yesterday = addDays(startOfDay(at), -1);
  const jollof = db.find('dishes', (d) => d.slug === 'smoky-party-jollof');
  const soldOut = parse(`${ymd(yesterday)} 20:41`);
  entries.push([
    soldOut,
    () => log(kitchen, 'menu.availability', 'dish', jollof?.id ?? null, soldOut, { sold_out_today: true }),
  ]);
  const settings = parse(`${ymd(addDays(yesterday, -3))} 16:05`);
  entries.push([
    settings,
    () =>
      log(admin, 'settings.updated', 'settings', 'ordering', settings, {
        before: { min_lead_minutes: 30 },
        after: { min_lead_minutes: 45 },
      }),
  ]);
  // Logged in time order, like the real append-only log.
  entries.sort((a, b) => a[0].getTime() - b[0].getTime()).forEach(([, write]) => write());
}
