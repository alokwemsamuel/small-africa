import { db } from '../db';
import { fail } from '../http';
import { addDays, addMinutes, atom, hm, now, parse, sql, weekday, ymd } from '../time';

/** Port of App\Services\PricingService and CouponService: every price comes from the database. */

const MAX_QTY_PER_LINE = 20;

/** Opening window for a date, or null when closed (Settings::openingWindow). */
export function openingWindow(date) {
  const row = db.find('opening_hours', (h) => h.day_of_week === weekday(date));
  if (!row || row.is_closed || !row.opens_at || !row.closes_at) return null;
  const day = ymd(date);
  return { opens: parse(`${day} ${row.opens_at}`), closes: parse(`${day} ${row.closes_at}`) };
}

function soldOut(d) {
  return !d.is_available || (d.sold_out_until !== null && d.sold_out_until >= ymd());
}

function priceLines(items, maxItems) {
  if (!items.length) throw fail.field('items', 'Your order is empty.');
  if (items.length > 40)
    throw fail.field('items', 'That’s a lot of different dishes. Please call us for large orders.');
  let totalQty = 0;
  const lines = items.map((item) => {
    const dishId = Number(item.dish_id);
    const qty = Number(item.quantity);
    if (!Number.isInteger(dishId) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw fail.field('items', 'One of the items in your order is invalid. Please refresh your basket.');
    }
    const dish = db.find('dishes', (d) => d.id === dishId && d.deleted_at === null);
    if (!dish) throw fail.field('items', 'A dish in your order is no longer on the menu. Please remove it.');
    if (soldOut(dish))
      throw fail.field('items', `Sorry, ${dish.name} is sold out today. Please remove it to continue.`);
    const category = db.byId('categories', dish.category_id)?.slug ?? '';
    if (category === 'tasting') {
      throw fail.field(
        'items',
        'The Chef’s Tasting Menu is served in the restaurant only. Please reserve a table.',
      );
    }
    const options = db.where('dish_options', (o) => o.dish_id === dishId);
    const portions = options.filter((o) => o.option_group === 'portion');
    let portion = null;
    if (portions.length) {
      const wanted = item.portion_id ?? null;
      for (const p of portions) {
        if ((wanted === null && p.is_default) || (wanted !== null && p.id === Number(wanted))) portion = p;
      }
      if (!portion) throw fail.field('items', `Please choose an option for ${dish.name}.`);
    }
    const addonIds = [...new Set((item.addon_ids ?? []).map(Number))];
    const addons = addonIds.map((aid) => {
      const match = options.find((o) => o.option_group === 'addon' && o.id === aid);
      if (!match)
        throw fail.field(
          'items',
          `An add-on for ${dish.name} isn’t available any more. Please update your basket.`,
        );
      return match;
    });
    const unit =
      dish.price_kobo + (portion?.price_delta_kobo ?? 0) + addons.reduce((s, a) => s + a.price_delta_kobo, 0);
    totalQty += qty;
    const note = typeof item.note === 'string' ? item.note.trim().slice(0, 200) : null;
    return {
      dishId: dish.id,
      slug: dish.slug,
      name: dish.name,
      kitchenId: dish.kitchen_id,
      kitchen: db.byId('kitchens', dish.kitchen_id)?.slug ?? null,
      unitPriceKobo: unit,
      quantity: qty,
      lineTotalKobo: unit * qty,
      portion: portion && portions.length > 1 ? { id: portion.id, name: portion.name } : null,
      addons: addons.map((a) => ({ id: a.id, name: a.name })),
      note: note || null,
      containsPork: !!dish.contains_pork,
      isAlcoholic: !!dish.is_alcoholic,
      isFeatured: !!dish.is_featured,
      category,
    };
  });
  if (totalQty > maxItems) {
    throw fail.field(
      'items',
      `Online orders are limited to ${maxItems} items. Please call us for larger orders.`,
    );
  }
  return lines;
}

function voucher(voucherCode, lines, userId) {
  if (!voucherCode || !voucherCode.trim()) return { voucher: null, discount: 0 };
  if (userId === null) throw fail.field('voucher_code', 'Sign in to use a reward voucher.');
  const v = db.find(
    'reward_vouchers',
    (x) => x.code === voucherCode.trim().toUpperCase() && x.user_id === userId,
  );
  if (!v || v.status !== 'issued' || v.expires_at < sql()) {
    throw fail.field('voucher_code', 'That voucher isn’t valid, has expired or has already been used.');
  }
  if (v.dine_in_only)
    throw fail.field(
      'voucher_code',
      'This reward is enjoyed in the restaurant: show the code to your server.',
    );
  const matching = lines.filter(
    (l) =>
      (v.dish_id !== null && l.dishId === v.dish_id) ||
      (v.category_slug !== null && l.category === v.category_slug),
  );
  if (!matching.length) {
    const what =
      v.dish_id !== null
        ? (db.byId('dishes', v.dish_id)?.name ?? 'the dish')
        : `a dish from ${db.find('categories', (c) => c.slug === v.category_slug)?.name ?? 'the right section'}`;
    throw fail.field('voucher_code', `Add ${what} to your order to use “${v.title}”.`);
  }
  const discount = Math.max(...matching.map((l) => l.unitPriceKobo));
  return { voucher: { id: v.id, code: v.code, title: v.title, discountKobo: discount }, discount };
}

const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** CouponService::evaluate */
export function evaluateCoupon(couponCode, lines, orderDate, userId, email) {
  const coupon = db.find('coupons', (c) => c.code === couponCode.trim().toUpperCase());
  if (!coupon || !coupon.is_active) throw fail.field('coupon_code', 'That code isn’t valid.');
  const at = sql(orderDate);
  if (coupon.starts_at && at < coupon.starts_at)
    throw fail.field('coupon_code', 'That code isn’t active yet.');
  if (coupon.ends_at && at > coupon.ends_at) throw fail.field('coupon_code', 'That code has expired.');
  if (coupon.valid_weekdays !== null && coupon.valid_weekdays !== '') {
    const days = String(coupon.valid_weekdays).split(',').map(Number);
    if (!days.includes(weekday(orderDate))) {
      throw fail.field(
        'coupon_code',
        `That code is only valid on ${days.map((d) => WEEKDAY_NAMES[d]).join(' and ')}.`,
      );
    }
  }
  if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) {
    throw fail.field('coupon_code', 'That code has reached its usage limit.');
  }
  const mail = email.toLowerCase();
  const mine = (o) => o.customer_email === mail || (userId !== null && o.user_id === userId);
  if (coupon.per_user_limit !== null) {
    const used = db
      .where('coupon_redemptions', (cr) => cr.coupon_id === coupon.id)
      .filter((cr) => {
        const o = db.byId('orders', cr.order_id);
        return o !== null && mine(o);
      }).length;
    if (used >= coupon.per_user_limit) throw fail.field('coupon_code', 'You’ve already used this code.');
  }
  if (coupon.first_order_only && db.find('orders', (o) => o.payment_status === 'paid' && mine(o))) {
    throw fail.field('coupon_code', 'This code is for your first order only.');
  }
  const eligible = lines
    .filter((l) => coupon.kitchen_id === null || l.kitchenId === coupon.kitchen_id)
    .reduce((s, l) => s + l.lineTotalKobo, 0);
  if (eligible === 0) {
    throw fail.field(
      'coupon_code',
      `Add a dish from our ${db.byId('kitchens', coupon.kitchen_id)?.name} to use this code.`,
    );
  }
  if (eligible < coupon.min_order_kobo) {
    throw fail.field(
      'coupon_code',
      `Spend ₦${(coupon.min_order_kobo / 100).toLocaleString('en-US')} on eligible dishes to use this code.`,
    );
  }
  let discount =
    coupon.discount_type === 'percent'
      ? Math.floor((eligible * coupon.discount_value) / 100)
      : Number(coupon.discount_value);
  if (coupon.max_discount_kobo !== null) discount = Math.min(discount, coupon.max_discount_kobo);
  discount = Math.floor(Math.min(discount, eligible) / 100) * 100;
  return { coupon, discount };
}

function resolveTime(scheduled, lead, maxDays) {
  const at = now();
  if (!scheduled) {
    const w = openingWindow(at);
    if (!w || at < w.opens || addMinutes(at, lead) > w.closes) {
      throw fail.field(
        'scheduled_for',
        'We’re closed for ASAP orders right now. Please schedule your order for later.',
      );
    }
    return { at: addMinutes(at, lead), scheduled: false };
  }
  if (
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(scheduled) ||
    `${ymd(parse(scheduled))} ${hm(parse(scheduled))}` !== scheduled
  ) {
    throw fail.field('scheduled_for', 'Choose a valid date and time.');
  }
  const when = parse(scheduled);
  if (when < addMinutes(at, lead)) {
    throw fail.field('scheduled_for', `Please allow at least ${lead} minutes for us to prepare your order.`);
  }
  if (when > addDays(at, maxDays))
    throw fail.field('scheduled_for', `Orders can be scheduled up to ${maxDays} days ahead.`);
  const w = openingWindow(when);
  if (!w || when < w.opens || when > w.closes)
    throw fail.field('scheduled_for', 'That time is outside our opening hours.');
  return { at: when, scheduled: true };
}

/** PricingService::quote */
export function quote(req, userId) {
  const ordering = db.settings('ordering');
  const pricing = db.settings('pricing');
  if (!(ordering.accepting_orders ?? true)) {
    throw fail.field('items', 'We’re not taking online orders right now. Please call or WhatsApp us.');
  }
  const lines = priceLines(req.items, Number(ordering.max_items_per_order ?? 40));
  if (lines.some((l) => l.isAlcoholic) && !req.confirm_age) {
    throw fail.field('confirm_age', 'Please confirm you are 18 or over to order alcohol.');
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotalKobo, 0);
  const when = resolveTime(
    req.scheduled_for ?? null,
    Number(ordering.min_lead_minutes ?? 45),
    Number(ordering.max_schedule_days ?? 7),
  );

  let zone = null;
  let deliveryFee = 0;
  if (req.fulfilment === 'delivery') {
    zone = db.find('delivery_zones', (z) => z.slug === (req.zone ?? '') && !!z.is_active);
    if (!zone) throw fail.field('zone', 'Choose your delivery area.');
    if (subtotal < zone.min_order_kobo) {
      throw fail.field(
        'items',
        `The minimum order for delivery to ${zone.name} is ₦${(zone.min_order_kobo / 100).toLocaleString('en-US')}.`,
      );
    }
    deliveryFee = zone.fee_kobo;
  }
  const account = userId ? db.find('loyalty_accounts', (a) => a.user_id === userId) : null;
  let freeDelivery = false;
  const freeTiers = db.settings('loyalty').free_delivery_tiers ?? ['gold', 'black_diamond'];
  if (deliveryFee > 0 && account && freeTiers.includes(account.tier)) {
    deliveryFee = 0;
    freeDelivery = true;
  }
  const v = voucher(req.voucher_code ?? null, lines, userId);
  let discount = 0;
  let coupon = null;
  if (req.coupon_code) {
    const result = evaluateCoupon(String(req.coupon_code), lines, when.at, userId, String(req.email ?? ''));
    coupon = result.coupon;
    discount = Math.min(result.discount, subtotal - v.discount);
  }
  const packaging = Number(pricing.packaging_fee_kobo ?? 0);
  const serviceCharge = Math.floor(
    ((subtotal - discount - v.discount) * Number(pricing.service_charge_online_bp ?? 0)) / 10000,
  );
  const vatBp = Number(pricing.vat_rate_bp ?? 750);
  const food = subtotal - discount - v.discount;
  const vatIncluded = Math.floor((food * vatBp) / (10000 + vatBp));
  const total = food + deliveryFee + packaging + serviceCharge;
  const walletBalance = Number(account?.wallet_balance_kobo ?? 0);
  const walletApplied = req.use_wallet && userId ? Math.min(walletBalance, total) : 0;

  return {
    lines,
    subtotalKobo: subtotal,
    discountKobo: discount,
    coupon: coupon ? { id: coupon.id, code: coupon.code, description: coupon.description } : null,
    voucher: v.voucher,
    voucherDiscountKobo: v.discount,
    deliveryFeeKobo: deliveryFee,
    freeDeliveryPerk: freeDelivery,
    packagingFeeKobo: packaging,
    serviceChargeKobo: serviceCharge,
    vatIncludedKobo: vatIncluded,
    totalKobo: total,
    walletBalanceKobo: walletBalance,
    walletAppliedKobo: walletApplied,
    payableKobo: total - walletApplied,
    fulfilment: req.fulfilment,
    zone: zone ? { id: zone.id, slug: zone.slug, name: zone.name, etaMinutes: zone.eta_minutes } : null,
    scheduledFor: when.scheduled ? `${ymd(when.at)} ${hm(when.at)}` : null,
    estimatedReadyAt: atom(addMinutes(when.at, zone ? zone.eta_minutes : 25)),
  };
}
