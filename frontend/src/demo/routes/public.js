import { db, getState } from '../db';
import { fail, validate, validateQuery } from '../http';
import { route } from '../router';
import { changePassword, login, register, userToPublic } from '../services/auth';
import { creditTopup, topupToPublic } from '../services/loyalty';
import * as orders from '../services/orders';
import { quote } from '../services/pricing';
import * as reservations from '../services/reservations';
import { now, ymd } from '../time';

/* --------------------------------------------------------------- menu & site */

function dishToPublic(d, withOptions = true) {
  const today = ymd(now());
  const options = withOptions
    ? db
        .where('dish_options', (o) => o.dish_id === d.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    : [];
  const group = (g) =>
    options
      .filter((o) => o.option_group === g)
      .map((o) => ({
        id: o.id,
        name: o.name,
        priceDeltaKobo: o.price_delta_kobo,
        isDefault: !!o.is_default,
      }));
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    kitchen: db.byId('kitchens', d.kitchen_id)?.slug ?? null,
    category: db.byId('categories', d.category_id)?.slug,
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
    isAvailable: !(!d.is_available || (d.sold_out_until !== null && d.sold_out_until >= today)),
    popularity: d.popularity,
    imageUrl: d.image_path ? mediaPath(d.image_path) : null,
    imageAlt: d.image_alt || d.name,
    options: { portion: group('portion'), addon: group('addon') },
  };
}

/** Uploaded photos live in the demo database as data URLs; real files are served by the API. */
export const mediaPath = (path) => (path.startsWith('data:') ? path : `/media/${path}`);

const liveDishes = () => db.where('dishes', (d) => d.deleted_at === null);
const categorySort = (id) => db.byId('categories', id)?.sort_order ?? 0;

function reviewToPublic(r, withDish) {
  return {
    id: r.id,
    author: r.author_name,
    rating: r.rating,
    title: r.title,
    body: r.body,
    dish: withDish ? (db.byId('dishes', r.dish_id)?.name ?? null) : null,
    reply: r.admin_reply,
    createdAt: r.created_at,
  };
}

route('GET', '/menu', () => ({
  kitchens: db
    .all('kitchens')
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((k) => ({
      id: k.id,
      slug: k.slug,
      name: k.name,
      tagline: k.tagline,
      description: k.description,
      accentColor: k.accent_color,
    })),
  categories: db
    .all('categories')
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
  dishes: liveDishes()
    .sort((a, b) => categorySort(a.category_id) - categorySort(b.category_id) || a.sort_order - b.sort_order)
    .map((d) => dishToPublic(d)),
}));

route('GET', '/menu/:slug', ({ params }) => {
  const d = /^[a-z0-9-]{1,100}$/.test(params.slug)
    ? db.find('dishes', (x) => x.slug === params.slug && x.deleted_at === null)
    : null;
  if (!d) throw fail.notFound('We couldn’t find that dish.');
  const related = liveDishes()
    .filter((x) => x.id !== d.id && (x.kitchen_id === d.kitchen_id || x.category_id === d.category_id))
    .sort(
      (a, b) =>
        Number(b.kitchen_id === d.kitchen_id) - Number(a.kitchen_id === d.kitchen_id) ||
        Number(b.category_id === d.category_id) - Number(a.category_id === d.category_id) ||
        b.popularity - a.popularity,
    )
    .slice(0, 4);
  return {
    dish: {
      ...dishToPublic(d),
      tastingCourses: db
        .where('tasting_courses', (t) => t.dish_id === d.id)
        .sort((a, b) => a.course_no - b.course_no)
        .map((t) => ({
          courseNo: t.course_no,
          kitchen: db.byId('kitchens', t.kitchen_id)?.slug,
          name: t.name,
          description: t.description,
        })),
      related: related.map((r) => dishToPublic(r, false)),
      reviews: db
        .where('reviews', (r) => r.dish_id === d.id && r.status === 'approved')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 6)
        .map((r) => reviewToPublic(r, false)),
    },
  };
});

route('GET', '/site', () => {
  const pricing = db.settings('pricing');
  const loyalty = db.settings('loyalty');
  const hhmm = (t) => (t ? t.slice(0, 5) : null);
  const bySort = (a, b) => a.sort_order - b.sort_order;
  return {
    restaurant: db.settings('restaurant'),
    pricing: {
      pricesIncludeVat: pricing.prices_include_vat ?? true,
      vatRateBp: pricing.vat_rate_bp ?? 750,
      serviceChargeDineInBp: pricing.service_charge_dine_in_bp ?? 1000,
    },
    openingHours: db
      .all('opening_hours')
      .slice()
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .map((h) => ({
        dayOfWeek: h.day_of_week,
        opensAt: hhmm(h.opens_at),
        closesAt: hhmm(h.closes_at),
        isClosed: !!h.is_closed,
      })),
    deliveryZones: db
      .where('delivery_zones', (z) => !!z.is_active)
      .sort(bySort)
      .map((z) => ({
        slug: z.slug,
        name: z.name,
        feeKobo: z.fee_kobo,
        minOrderKobo: z.min_order_kobo,
        etaMinutes: z.eta_minutes,
      })),
    seatingAreas: reservations.activeAreas().map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      minParty: a.min_party,
      maxParty: a.max_party,
    })),
    eventPackages: db
      .all('event_packages')
      .slice()
      .sort(bySort)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        summary: p.summary,
        pricePerGuestKobo: p.price_per_guest_kobo,
        minGuests: p.min_guests,
        maxGuests: p.max_guests,
        features: JSON.parse(p.features),
      })),
    loyalty: {
      tiers: loyalty.tiers ?? [],
      earnPointsPer1000Naira: loyalty.earn_points_per_1000_naira ?? 5,
      interestRateBp: loyalty.interest_rate_bp ?? 200,
      interestCapNaira: loyalty.interest_cap_naira ?? 5000,
      interestMinBalanceNaira: loyalty.interest_min_balance_naira ?? 20000,
      referralCreditNaira: loyalty.referral_credit_naira ?? 2000,
    },
    testimonials: db
      .where('reviews', (r) => r.status === 'approved' && r.rating >= 4)
      .sort((a, b) => b.rating - a.rating || b.created_at.localeCompare(a.created_at))
      .slice(0, 8)
      .map((r) => reviewToPublic(r, true)),
  };
});

route('GET', '/rewards', () => ({
  rewards: db
    .where('rewards_catalog', (r) => !!r.is_active)
    .sort((a, b) => a.points_cost - b.points_cost || a.sort_order - b.sort_order)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      pointsCost: r.points_cost,
      type: r.reward_type,
      dineInOnly: !!r.dine_in_only,
    })),
}));

/* ------------------------------------------------------------------- forms */

route('POST', '/contact', ({ body }) => {
  const data = validate(body, {
    name: 'required|string|max:160',
    email: 'required|email',
    phone: 'nullable|phone',
    subject: 'required|string|max:160',
    message: 'required|string|min:10|max:3000',
    website: 'nullable|string|max:200',
  });
  const message = 'Thank you. We’ll reply within one working day.';
  if (data.website) return { message };
  delete data.website;
  const row = db.insert('contact_messages', data);
  return { id: row.id, message };
});

route('POST', '/newsletter', ({ body }) => {
  const data = validate(body, {
    email: 'required|email',
    source: 'nullable|string|in:footer,home,checkout,account',
  });
  if (!db.find('newsletter_subscribers', (s) => s.email === data.email)) {
    db.insert('newsletter_subscribers', {
      email: data.email,
      source: data.source ?? 'footer',
      status: 'subscribed',
    });
  }
  return { message: 'You’re on the list. Watch your inbox for menus, events and member offers.' };
});

route('POST', '/events/enquiries', ({ body, user }) => {
  const data = validate(
    body,
    {
      name: 'required|string|max:160',
      email: 'required|email',
      phone: 'required|phone',
      company: 'nullable|string|max:160',
      event_type: 'required|string|in:private_dining,corporate,wedding,birthday,other',
      package: 'nullable|string|max:40',
      event_date: 'required|date',
      guests: 'required|int|min:2|max:500',
      budget_naira: 'nullable|int|min:0|max:500000000',
      message: 'nullable|string|max:2000',
    },
    { event_type: 'Event type', event_date: 'Event date', budget_naira: 'Budget' },
  );
  if (data.event_date <= ymd(now())) throw fail.field('event_date', 'Please choose a date in the future.');
  let packageId = null;
  if (data.package) {
    packageId = db.find('event_packages', (p) => p.slug === data.package)?.id ?? null;
    if (!packageId) throw fail.field('package', 'Please choose a package from the list.');
  }
  const row = db.insert('event_enquiries', {
    user_id: user?.id ?? null,
    name: data.name,
    email: data.email,
    phone: data.phone,
    company: data.company ?? null,
    event_type: data.event_type,
    package_id: packageId,
    event_date: data.event_date,
    guests: data.guests,
    budget_kobo: data.budget_naira != null ? data.budget_naira * 100 : null,
    message: data.message ?? null,
  });
  return {
    id: row.id,
    message: 'Thank you. Our events team will call you within one working day with a tailored proposal.',
  };
});

/* ---------------------------------------------------------------- checkout */

function validateCheckout(body, forQuote) {
  const rules = {
    fulfilment: 'required|string|in:delivery,pickup',
    zone: 'nullable|string|max:40',
    scheduled_for: 'nullable|string|regex:/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$/',
    coupon_code: 'nullable|string|max:30',
    voucher_code: 'nullable|string|max:16',
    use_wallet: 'nullable|bool',
    confirm_age: 'nullable|bool',
    email: forQuote ? 'nullable|email' : 'required|email',
  };
  if (!forQuote) {
    Object.assign(rules, {
      name: 'required|string|max:160',
      phone: 'required|phone',
      notes: 'nullable|string|max:500',
      save_address: 'nullable|bool',
    });
  }
  const data = validate(body, rules, {
    scheduled_for: 'Scheduled time',
    coupon_code: 'Coupon code',
    voucher_code: 'Voucher code',
  });
  if (!Array.isArray(body.items)) throw fail.field('items', 'Your order is empty.');
  data.items = body.items;
  if (!forQuote && data.fulfilment === 'delivery') {
    data.address = validate(
      body.address ?? {},
      {
        line1: 'required|string|max:160',
        line2: 'nullable|string|max:160',
        landmark: 'nullable|string|max:160',
        area: 'nullable|string|max:80',
        label: 'nullable|string|max:40',
      },
      { line1: 'Street address' },
    );
  }
  return data;
}

route('POST', '/checkout/quote', ({ body, user }) => ({
  quote: quote(validateCheckout(body, true), user?.id ?? null),
}));

route('POST', '/orders', ({ body, user, idempotencyKey }) => {
  const data = validateCheckout(body, false);
  const result = orders.create(data, user, idempotencyKey);
  if (user && data.fulfilment === 'delivery' && data.save_address) orders.saveCheckoutAddress(user.id, data);
  return result;
});

route('GET', '/orders/:reference', ({ params, query, user }) => {
  if (!/^SA-[A-Z0-9]{6}$/i.test(params.reference)) throw fail.notFound('We couldn’t find that order.');
  return { order: orders.findForTracking(params.reference, user, query.get('t')) };
});

route('POST', '/payments/verify', ({ body }) => {
  const data = validate(body, { reference: 'required|string|max:40|regex:/^SA-[A-Z0-9]{6}$/' });
  return { order: orders.verifyPayment(data.reference) };
});

/** The simulated Paystack popup reports the guest's choice here, then the payment is verified. */
route('POST', '/payments/simulate', ({ body, user }) => {
  const data = validate(body, {
    reference: 'required|string|max:40|regex:/^(SA|TU)-[A-Z0-9]{6}$/',
    outcome: 'required|string|in:success,failed,abandoned',
  });
  if (data.reference.startsWith('TU-')) {
    const topup = db.find('wallet_topups', (t) => t.reference === data.reference);
    if (!topup || (user && topup.user_id !== user.id)) throw fail.notFound('We couldn’t find that top-up.');
    orders.recordSimulatedOutcome('wallet_topup', topup.id, data.outcome);
    return { topup: verifyTopup(topup) };
  }
  const order = db.find('orders', (o) => o.reference === data.reference);
  if (order) orders.recordSimulatedOutcome('order', order.id, data.outcome);
  return { order: orders.verifyPayment(data.reference) };
});

/** WalletService::verify */
export function verifyTopup(topup) {
  if (topup.status !== 'paid') {
    const payment = orders.latestPayment('wallet_topup', topup.id);
    if (payment && payment.status !== 'success') {
      const result = orders.checkPayment(payment);
      if (result === 'success' && orders.markSuccess(payment)) creditTopup(topup);
      else if (result === 'failed' && topup.status === 'pending') topup.status = 'failed';
    }
  }
  return topupToPublic(topup);
}

/* ------------------------------------------------------------ reservations */

route('GET', '/reservations/availability', ({ query }) => {
  const q = validateQuery(
    query,
    { date: 'required|date', party: 'required|int|min:1|max:50' },
    { party: 'Party size' },
  );
  return reservations.availability(q.date, q.party);
});

route('POST', '/reservations', ({ body, user }) => {
  const data = validate(
    body,
    {
      date: 'required|date',
      time: 'required|time',
      party_size: 'required|int|min:1|max:50',
      area: 'required|string|max:40',
      occasion: 'nullable|string|in:none,birthday,anniversary,business,date_night,celebration,other',
      notes: 'nullable|string|max:500',
      name: 'required|string|max:160',
      email: 'required|email',
      phone: 'required|phone',
    },
    { party_size: 'Party size', area: 'Seating area' },
  );
  return reservations.create(data, user);
});

const reservationCode = (c) => {
  if (!/^R-[A-Z0-9]{6}$/i.test(c)) throw fail.notFound('We couldn’t find that reservation.');
  return c;
};

route('GET', '/reservations/:code', ({ params, query, user }) => ({
  reservation: reservations.find(reservationCode(params.code), user, query.get('t')),
}));

route('POST', '/reservations/:code/cancel', ({ params, body, user }) => ({
  reservation: reservations.cancel(
    reservationCode(params.code),
    user,
    typeof body.t === 'string' ? body.t : null,
  ),
}));

/* -------------------------------------------------------------------- auth */

const CSRF = { csrfToken: 'demo' };

route('GET', '/auth/csrf', () => CSRF);
route('GET', '/auth/me', ({ user }) => ({ user: user ? userToPublic(user) : null }));

route('POST', '/auth/register', async ({ body }) => {
  const data = validate(
    body,
    {
      first_name: 'required|string|max:80',
      last_name: 'required|string|max:80',
      email: 'required|email',
      phone: 'nullable|phone',
      password: 'required|string|max:128',
      referral_code: 'nullable|string|max:20',
      device_id: 'nullable|string|max:64',
      marketing_opt_in: 'nullable|bool',
      accept_terms: 'required|bool',
    },
    { first_name: 'First name', last_name: 'Last name', accept_terms: 'Accepting the terms' },
  );
  if (data.accept_terms !== true) {
    throw fail.field('accept_terms', 'Please accept the Terms and Privacy Policy to continue.');
  }
  return { user: await register(data), ...CSRF };
});

route('POST', '/auth/login', async ({ body }) => {
  const data = validate(body, { email: 'required|email', password: 'required|string|max:128' });
  return { user: await login(data.email, data.password), ...CSRF };
});

route('POST', '/auth/2fa', () => {
  throw fail.unauthorized('Your sign-in expired. Please enter your email and password again.');
});

route('POST', '/auth/logout', () => {
  getState().userId = null;
  return { ok: true };
});

route('POST', '/auth/forgot-password', ({ body }) => {
  validate(body, { email: 'required|email' });
  return { message: 'If an account exists for that email, we’ve sent a link to reset your password.' };
});

route('POST', '/auth/reset-password', () => {
  throw fail.badRequest(
    'This reset link is invalid or has expired. Please request a new one.',
    'invalid_token',
  );
});

route('POST', '/auth/verify-email', () => {
  throw fail.badRequest(
    'This confirmation link is invalid or has expired. Sign in to request a new one.',
    'invalid_token',
  );
});

route(
  'POST',
  '/auth/resend-verification',
  () => ({ message: 'We’ve sent a new confirmation link.' }),
  'user',
);

/* ----------------------------------------------------------------- account */

route(
  'PATCH',
  '/account/profile',
  ({ body, user }) => {
    const data = validate(body, {
      first_name: 'nullable|string|max:80',
      last_name: 'nullable|string|max:80',
      phone: 'nullable|phone',
      birthday: 'nullable|date',
      favourite_kitchen_id: 'nullable|int|in:1,2,3',
      marketing_opt_in: 'nullable|bool',
      theme_preference: 'nullable|string|in:dark,light,system',
    });
    for (const f of ['first_name', 'last_name', 'marketing_opt_in'])
      if (f in data && data[f] === null) delete data[f];
    if ('birthday' in data && user.birthday !== null) delete data.birthday;
    if ('marketing_opt_in' in data) data.marketing_opt_in = data.marketing_opt_in ? 1 : 0;
    Object.assign(user, data);
    return { user: userToPublic(user) };
  },
  'user',
);

route(
  'POST',
  '/account/password',
  async ({ body, user }) => {
    const data = validate(
      body,
      { current_password: 'required|string|max:128', new_password: 'required|string|max:128' },
      { current_password: 'Current password', new_password: 'New password' },
    );
    await changePassword(user, data.current_password, data.new_password);
    return { message: 'Password updated. Other devices have been signed out.' };
  },
  'user',
);

route('GET', '/account/orders', ({ user }) => ({ orders: orders.listForUser(user.id) }), 'user');
route(
  'POST',
  '/account/orders/:reference/reorder',
  ({ params, user }) => orders.reorder(params.reference, user.id),
  'user',
);
route(
  'GET',
  '/account/reservations',
  ({ user }) => ({ reservations: reservations.listForUser(user.id, user.email) }),
  'user',
);
