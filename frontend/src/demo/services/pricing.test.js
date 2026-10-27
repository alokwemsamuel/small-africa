import { ApiError } from '@/lib/api';
import { buildState } from '../build';
import { db } from '../db';
import snapshot from '../snapshot.json';
import { freezeClock, parse } from '../time';
import { quote } from './pricing';

// Wednesday 13:00 in Lagos: open for ASAP orders, and not a Friday (Jollof Friday coupon).
const NOW = '2026-10-28 13:00:00';
const GUEST_ID = 3; // guest@smallafrica.demo: Gold tier, ₦68,500 dining credit

const dish = (slug) => db.find('dishes', (d) => d.slug === slug);
const option = (slug, name) => db.find('dish_options', (o) => o.dish_id === dish(slug).id && o.name === name);
const item = (slug, quantity = 1, { portion = null, addons = [] } = {}) => ({
  dish_id: dish(slug).id,
  quantity,
  portion_id: portion ? option(slug, portion).id : null,
  addon_ids: addons.map((a) => option(slug, a).id),
});
const pickup = (items, extra = {}) => ({ fulfilment: 'pickup', items, ...extra });

/** The field errors of a rejected quote. */
function fieldsOf(fn) {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e.fields;
    throw e;
  }
  throw new Error('Expected the quote to be refused');
}

beforeAll(async () => {
  freezeClock(NOW);
  await buildState(snapshot, parse(NOW));
});
afterAll(() => freezeClock(null));

describe('lines: portions and add-ons', () => {
  it('prices a portion and add-ons from the menu, never from the browser', () => {
    // Jollof ₦18,500 + Large ₦6,000 + Extra dodo ₦2,500 = ₦27,000 each, × 2
    const q = quote(
      pickup([
        {
          ...item('smoky-party-jollof', 2, { portion: 'Large', addons: ['Extra dodo'] }),
          unit_price_kobo: 1,
        },
      ]),
      null,
    );
    expect(q.lines[0]).toMatchObject({
      unitPriceKobo: 2_700_000,
      quantity: 2,
      lineTotalKobo: 5_400_000,
      portion: { name: 'Large' },
      addons: [{ name: 'Extra dodo' }],
    });
    expect(q.subtotalKobo).toBe(5_400_000);
  });

  it('uses the default portion when none is chosen', () => {
    expect(quote(pickup([item('smoky-party-jollof')]), null).lines[0].unitPriceKobo).toBe(1_850_000);
  });

  it('refuses unknown add-ons and silly quantities', () => {
    const jollof = item('smoky-party-jollof');
    expect(fieldsOf(() => quote(pickup([{ ...jollof, addon_ids: [99999] }]), null)).items).toMatch(/add-on/);
    expect(fieldsOf(() => quote(pickup([{ ...jollof, quantity: 21 }]), null)).items).toMatch(/invalid/);
    expect(fieldsOf(() => quote(pickup([]), null)).items).toBe('Your order is empty.');
  });
});

describe('fees and totals', () => {
  it('pickup: subtotal + ₦500 packaging; VAT is included in the prices', () => {
    const q = quote(
      pickup([item('smoky-party-jollof', 2, { portion: 'Large', addons: ['Extra dodo'] })]),
      null,
    );
    expect(q.deliveryFeeKobo).toBe(0);
    expect(q.packagingFeeKobo).toBe(50_000);
    expect(q.totalKobo).toBe(5_450_000);
    expect(q.vatIncludedKobo).toBe(Math.floor((5_400_000 * 750) / 10_750));
    expect(q.payableKobo).toBe(q.totalKobo);
  });

  it('delivery adds the zone fee, and enforces the zone minimum', () => {
    const lekki = db.find('delivery_zones', (z) => z.slug === 'lekki');
    const q = quote({ ...pickup([item('smoky-party-jollof')]), fulfilment: 'delivery', zone: 'lekki' }, null);
    expect(q.deliveryFeeKobo).toBe(lekki.fee_kobo);
    expect(q.totalKobo).toBe(1_850_000 + lekki.fee_kobo + 50_000);
    const small = { ...pickup([item('pepper-soup')]), fulfilment: 'delivery', zone: 'lekki' };
    expect(fieldsOf(() => quote(small, null)).items).toBe(
      `The minimum order for delivery to ${lekki.name} is ₦15,000.`,
    );
  });

  it('gives Gold members free delivery', () => {
    const q = quote(
      { ...pickup([item('smoky-party-jollof')]), fulfilment: 'delivery', zone: 'lekki' },
      GUEST_ID,
    );
    expect(q).toMatchObject({ deliveryFeeKobo: 0, freeDeliveryPerk: true });
  });

  it('asks for age confirmation when the order has alcohol', () => {
    const wine = db.find('dishes', (d) => d.is_alcoholic && d.is_available && d.deleted_at === null);
    const order = pickup([{ dish_id: wine.id, quantity: 1, addon_ids: [] }]);
    expect(fieldsOf(() => quote(order, null)).confirm_age).toMatch(/18 or over/);
    expect(quote({ ...order, confirm_age: true }, null).totalKobo).toBeGreaterThan(0);
  });
});

describe('coupons', () => {
  const big = () => [item('smoky-party-jollof', 2, { portion: 'Large', addons: ['Extra dodo'] })]; // ₦54,000

  it('caps a percentage discount at its maximum', () => {
    // WELCOME10: 10% of ₦54,000 = ₦5,400, capped at ₦5,000
    const q = quote(pickup(big(), { coupon_code: 'welcome10', email: 'new@example.com' }), null);
    expect(q.discountKobo).toBe(500_000);
    expect(q.totalKobo).toBe(5_400_000 - 500_000 + 50_000);
    expect(q.coupon.code).toBe('WELCOME10');
  });

  it('only discounts the kitchen the coupon is for, with its minimum spend', () => {
    // PIEROGI15: 15% of Polish dishes, min ₦10,000 of Polish food
    const pierogi = dish('pierogi-ruskie');
    const twoPierogi = item('pierogi-ruskie', 2);
    const q = quote(pickup([item('smoky-party-jollof'), twoPierogi], { coupon_code: 'PIEROGI15' }), null);
    const expected = Math.floor(Math.floor((pierogi.price_kobo * 2 * 15) / 100) / 100) * 100;
    expect(q.discountKobo).toBe(expected);
    expect(fieldsOf(() => quote(pickup([item('paczki')], { coupon_code: 'PIEROGI15' }), null))).toEqual({
      coupon_code: 'Spend ₦10,000 on eligible dishes to use this code.',
    });
    expect(fieldsOf(() => quote(pickup(big(), { coupon_code: 'CONTINENTAL10' }), null)).coupon_code).toBe(
      'Add a dish from our Continental Kitchen to use this code.',
    );
  });

  it('respects the days a coupon is valid', () => {
    expect(fieldsOf(() => quote(pickup(big(), { coupon_code: 'JOLLOFFRIDAY' }), null)).coupon_code).toBe(
      'That code is only valid on Fridays.',
    );
    expect(fieldsOf(() => quote(pickup(big(), { coupon_code: 'NOPE' }), null)).coupon_code).toBe(
      'That code isn’t valid.',
    );
  });
});

describe('dining credit and card split', () => {
  it('uses the whole bill from the wallet when it covers it', () => {
    const q = quote(pickup([item('smoky-party-jollof')], { use_wallet: true }), GUEST_ID);
    expect(q.walletAppliedKobo).toBe(q.totalKobo);
    expect(q.payableKobo).toBe(0);
  });

  it('pays the rest by card when the wallet runs out', () => {
    const balance = db.find('loyalty_accounts', (a) => a.user_id === GUEST_ID).wallet_balance_kobo;
    const many = [item('smoky-party-jollof', 4, { portion: 'Large', addons: ['Extra dodo'] })]; // ₦108,000
    const q = quote(pickup(many, { use_wallet: true }), GUEST_ID);
    expect(q.walletAppliedKobo).toBe(balance);
    expect(q.walletAppliedKobo + q.payableKobo).toBe(q.totalKobo);
  });

  it('never applies a wallet for guests or when not asked', () => {
    expect(quote(pickup([item('smoky-party-jollof')], { use_wallet: true }), null).walletAppliedKobo).toBe(0);
    expect(quote(pickup([item('smoky-party-jollof')]), GUEST_ID).walletAppliedKobo).toBe(0);
  });
});
