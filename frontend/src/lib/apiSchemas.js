import { z } from 'zod';

/**
 * The shapes of the most important API responses, written from the PHP controllers. In
 * development every matching response is checked (see api.js), so a wrong or missing field
 * shows a clear console error instead of a confusing bug later. Tests use the same schemas to
 * prove the demo-mode API answers exactly like the real one. Production never loads this file.
 *
 * Extra fields are allowed (the API may grow); missing or wrongly typed ones are reported.
 */

const kobo = z.number().int();
const id = z.number().int().positive();
const text = z.string();
const maybe = (schema) => schema.nullable();
const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/, 'YYYY-MM-DD[ HH:MM[:SS]]');

export const user = z.object({
  id,
  firstName: text,
  lastName: text,
  email: z.string().email(),
  phone: maybe(text),
  role: z.enum(['super_admin', 'manager', 'staff', 'customer']),
  staffPosition: maybe(z.enum(['kitchen', 'front_desk'])),
  emailVerified: z.boolean(),
  birthday: maybe(text),
  favouriteKitchenId: maybe(z.number().int()),
  referralCode: maybe(text),
  marketingOptIn: z.boolean(),
  themePreference: maybe(z.enum(['dark', 'light', 'system'])),
  twoFactorEnabled: z.boolean(),
  createdAt: dateTime,
});

const option = z.object({ id, name: text, priceDeltaKobo: kobo, isDefault: z.boolean() });

export const dish = z.object({
  id,
  slug: text,
  name: text,
  kitchen: maybe(z.enum(['nigerian', 'polish', 'continental'])),
  category: text,
  shortDescription: text,
  description: text,
  ingredients: maybe(text),
  allergens: z.array(text),
  priceKobo: kobo,
  spiceLevel: z.number().int().min(0).max(3),
  isVegetarian: z.boolean(),
  isGlutenFree: z.boolean(),
  containsNuts: z.boolean(),
  containsPork: z.boolean(),
  isAlcoholic: z.boolean(),
  isFeatured: z.boolean(),
  isAvailable: z.boolean(),
  popularity: z.number().int(),
  imageUrl: maybe(text),
  imageAlt: text,
  options: z.object({ portion: z.array(option), addon: z.array(option) }),
});

const review = z.object({
  id,
  author: text,
  rating: z.number().int().min(1).max(5),
  title: maybe(text),
  body: text,
  dish: maybe(text),
  reply: maybe(text),
  createdAt: dateTime,
});

export const menu = z.object({
  kitchens: z.array(
    z.object({ id, slug: text, name: text, tagline: text, description: text, accentColor: text }),
  ),
  categories: z.array(z.object({ id, slug: text, name: text })),
  dishes: z.array(dish),
});

export const dishDetail = z.object({
  dish: dish.extend({
    tastingCourses: z.array(
      z.object({ courseNo: z.number().int(), kitchen: text, name: text, description: text }),
    ),
    related: z.array(dish),
    reviews: z.array(review),
  }),
});

export const site = z.object({
  restaurant: z.record(z.string(), z.unknown()),
  pricing: z.object({
    pricesIncludeVat: z.boolean(),
    vatRateBp: z.number(),
    serviceChargeDineInBp: z.number(),
  }),
  openingHours: z.array(
    z.object({
      dayOfWeek: z.number().int(),
      opensAt: maybe(text),
      closesAt: maybe(text),
      isClosed: z.boolean(),
    }),
  ),
  deliveryZones: z.array(
    z.object({ slug: text, name: text, feeKobo: kobo, minOrderKobo: kobo, etaMinutes: z.number().int() }),
  ),
  seatingAreas: z.array(
    z.object({ slug: text, name: text, description: text, minParty: z.number(), maxParty: z.number() }),
  ),
  eventPackages: z.array(
    z.object({ id, slug: text, name: text, pricePerGuestKobo: kobo, features: z.array(text) }),
  ),
  loyalty: z.object({
    tiers: z.array(z.unknown()),
    earnPointsPer1000Naira: z.number(),
    interestRateBp: z.number(),
  }),
  testimonials: z.array(review),
});

const quoteLine = z.object({
  dishId: id,
  slug: text,
  name: text,
  kitchen: maybe(text),
  unitPriceKobo: kobo,
  quantity: z.number().int().min(1),
  lineTotalKobo: kobo,
  portion: maybe(z.object({ id, name: text })),
  addons: z.array(z.object({ id, name: text })),
  note: maybe(text),
  containsPork: z.boolean(),
  isAlcoholic: z.boolean(),
});

export const quote = z.object({
  quote: z
    .object({
      lines: z.array(quoteLine),
      subtotalKobo: kobo,
      discountKobo: kobo,
      coupon: maybe(z.object({ id, code: text, description: text })),
      voucher: maybe(z.object({ id, code: text, title: text, discountKobo: kobo })),
      voucherDiscountKobo: kobo,
      deliveryFeeKobo: kobo,
      freeDeliveryPerk: z.boolean(),
      packagingFeeKobo: kobo,
      serviceChargeKobo: kobo,
      vatIncludedKobo: kobo,
      totalKobo: kobo,
      walletBalanceKobo: kobo,
      walletAppliedKobo: kobo,
      payableKobo: kobo,
      fulfilment: z.enum(['delivery', 'pickup']),
      zone: maybe(z.object({ slug: text, name: text, etaMinutes: z.number().int() })),
      scheduledFor: maybe(text),
      estimatedReadyAt: text,
    })
    // The card pays what the dining credit doesn't.
    .refine((q) => q.walletAppliedKobo + q.payableKobo === q.totalKobo, 'wallet + card must equal the total'),
});

const orderStatus = z.enum([
  'pending_payment',
  'received',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
]);

export const order = z.object({
  reference: z.string().regex(/^SA-[A-Z0-9]{6}$/),
  status: orderStatus,
  paymentStatus: z.enum(['unpaid', 'paid', 'failed', 'refunded', 'partially_refunded']),
  fulfilment: z.enum(['delivery', 'pickup']),
  zone: maybe(z.object({ name: text, etaMinutes: z.number().int() })),
  scheduledFor: maybe(text),
  placedAt: maybe(dateTime),
  createdAt: dateTime,
  customerName: text,
  subtotalKobo: kobo,
  discountKobo: kobo,
  voucherDiscountKobo: kobo,
  deliveryFeeKobo: kobo,
  serviceChargeKobo: kobo,
  vatIncludedKobo: kobo,
  walletAppliedKobo: kobo,
  totalKobo: kobo,
  pointsEarned: z.number().int(),
  items: z
    .array(
      z.object({
        dishId: maybe(z.number().int()),
        name: text,
        quantity: z.number().int(),
        unitPriceKobo: kobo,
        lineTotalKobo: kobo,
        addons: z.array(z.unknown()),
      }),
    )
    .optional(),
  history: z.array(z.object({ status: orderStatus, at: dateTime })).optional(),
});

const payment = z.object({
  provider: z.enum(['paystack', 'simulated']),
  reference: text,
  accessCode: text,
  authorizationUrl: maybe(text),
});

export const placedOrder = z.object({
  order,
  payment: maybe(payment),
  trackingToken: text,
  publicKey: maybe(text),
});

export const topup = z.object({
  reference: z.string().regex(/^TU-[A-Z0-9]{6}$/),
  amountKobo: kobo,
  bonusKobo: kobo,
  status: z.enum(['pending', 'paid', 'failed']),
  paidAt: maybe(dateTime),
});

const tierKey = z.enum(['bronze', 'silver', 'gold', 'black_diamond']);

export const loyaltySummary = z.object({
  member: z.object({ name: text, since: maybe(text), birthdayWeek: z.boolean(), hasBirthday: z.boolean() }),
  tier: z.object({
    key: tierKey,
    name: text,
    multiplier: z.number(),
    perks: z.array(text),
    spend12mKobo: kobo,
    next: maybe(
      z.object({ key: tierKey, name: text, remainingKobo: kobo, progress: z.number().min(0).max(1) }),
    ),
  }),
  tiers: z.array(z.object({ key: tierKey, name: text, minSpendKobo: kobo, multiplier: z.number() })),
  wallet: z.object({
    balanceKobo: kobo,
    interest: z.object({
      rateBp: z.number().int(),
      capKobo: kobo,
      minBalanceKobo: kobo,
      lowestThisMonthKobo: kobo,
      projectedKobo: kobo,
      last: maybe(z.object({ amountKobo: kobo, period: text, at: dateTime })),
    }),
    topup: z.object({
      presetsKobo: z.array(kobo),
      minKobo: kobo,
      maxKobo: kobo,
      bonusBands: z.array(z.object({ minKobo: kobo, bonusBp: z.number().int() })),
    }),
  }),
  points: z.object({
    balance: z.number().int().min(0),
    valueKobo: kobo,
    earnPer1000Naira: z.number(),
    doublePointsWeekdays: z.array(z.number().int()),
    expiresAt: maybe(text),
    nextReward: maybe(z.object({ name: text, pointsCost: z.number().int(), remaining: z.number().int() })),
  }),
  stampCard: z.object({ stamps: z.number().int(), size: z.number().int(), lifetime: z.number().int() }),
  streak: z.object({
    month: text,
    count: z.number().int(),
    target: z.number().int(),
    bonusPoints: z.number().int(),
  }),
  referral: z.object({ code: maybe(text), link: maybe(text), creditKobo: kobo }),
  rewards: z.array(
    z.object({
      slug: text,
      name: text,
      pointsCost: z.number().int(),
      type: z.enum(['credit', 'item', 'upgrade']),
    }),
  ),
  vouchers: z.array(z.object({ code: text, title: text, dineInOnly: z.boolean(), expiresAt: dateTime })),
  offers: z.array(z.unknown()),
});

const kpi = z.object({
  revenueKobo: kobo,
  orders: z.number().int(),
  reservations: z.number().int(),
  covers: z.number().int(),
  averageOrderKobo: kobo,
});

export const dashboard = z.object({
  today: kpi,
  yesterday: kpi,
  period: kpi.extend({ days: z.union([z.literal(7), z.literal(30)]) }),
  series: z.array(
    z.object({ date: text, revenueKobo: kobo, orders: z.number().int(), reservations: z.number().int() }),
  ),
  topDishes: z.array(z.object({ name: text, quantity: z.number().int(), revenueKobo: kobo })),
  byKitchen: z.array(z.object({ kitchen: text, revenueKobo: kobo })),
  live: z.array(z.object({ reference: text, status: orderStatus, totalKobo: kobo, items: z.number().int() })),
  pending: z.object({ reviews: z.number().int(), enquiries: z.number().int(), messages: z.number().int() }),
  loyalty: z.object({ members: z.number().int(), walletKobo: kobo, points: z.number().int() }),
  generatedAt: text,
});

export const availability = z.object({
  date: text,
  partySize: z.number().int(),
  durationMinutes: z.number().int(),
  closed: z.boolean(),
  areas: z.array(
    z.object({
      slug: text,
      name: text,
      fitsParty: z.boolean(),
      slots: z.array(
        z.object({ time: z.string().regex(/^\d{2}:\d{2}$/), available: z.boolean(), remaining: z.number() }),
      ),
    }),
  ),
});

/** Which schema checks which response: [method, path pattern, schema]. */
export const RESPONSES = [
  ['GET', /^\/auth\/me$/, z.object({ user: maybe(user) })],
  ['POST', /^\/auth\/(login|register|2fa)$/, z.object({ user: user.optional() })],
  ['GET', /^\/menu$/, menu],
  ['GET', /^\/menu\/[a-z0-9-]+$/, dishDetail],
  ['GET', /^\/site$/, site],
  ['POST', /^\/checkout\/quote$/, quote],
  ['POST', /^\/orders$/, placedOrder],
  ['GET', /^\/orders\/SA-[A-Z0-9]{6}/, z.object({ order })],
  ['POST', /^\/payments\/(verify|simulate)$/, z.union([z.object({ order }), z.object({ topup })])],
  ['GET', /^\/account\/orders$/, z.object({ orders: z.array(order) })],
  ['GET', /^\/account\/loyalty$/, loyaltySummary],
  ['POST', /^\/account\/wallet\/topups$/, z.object({ topup, payment: maybe(payment) })],
  ['GET', /^\/reservations\/availability/, availability],
  ['GET', /^\/admin\/dashboard/, dashboard],
];

/**
 * Checks a response in development and logs a readable error when its shape is wrong.
 * @param {string} method
 * @param {string} path
 * @param {unknown} data
 * @returns {boolean} true when the response matches (or nothing checks this path)
 */
export function checkResponse(method, path, data) {
  const pathname = path.split('?')[0];
  const match = RESPONSES.find(([m, re]) => m === method && re.test(pathname));
  if (!match) return true;
  const result = match[2].safeParse(data);
  if (!result.success) {
    console.error(
      `[api] ${method} ${pathname} returned an unexpected shape:\n` +
        result.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n'),
    );
  }
  return result.success;
}
