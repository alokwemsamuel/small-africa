import { parse } from '@/lib/demo/time';
import { LoyaltyRules } from './loyaltyRules';

// The live Interest Account settings (from the seeded `loyalty` settings group).
const SETTINGS = {
  earn_points_per_1000_naira: 5,
  double_points_weekdays: [2, 3], // Tuesday, Wednesday
  featured_dish_points_multiplier: 2,
  birthday_points_multiplier: 2,
  redeem_points_per_1000_naira: 100,
  interest_rate_bp: 200, // 2% a month
  interest_cap_naira: 5000,
  interest_min_balance_naira: 20000,
  topup_min_naira: 5000,
  topup_max_naira: 1000000,
  topup_bonus_tiers: [
    { min_naira: 100000, bonus_bp: 1000 },
    { min_naira: 50000, bonus_bp: 500 },
  ],
  tiers: [
    { key: 'bronze', name: 'Bronze', min_spend_naira: 0, multiplier: 1, perks: [] },
    { key: 'silver', name: 'Silver', min_spend_naira: 150000, multiplier: 1.25, perks: [] },
    { key: 'gold', name: 'Gold', min_spend_naira: 500000, multiplier: 1.5, perks: [] },
    { key: 'black_diamond', name: 'Black Diamond', min_spend_naira: 1500000, multiplier: 2, perks: [] },
  ],
  stamp_rewards: [
    { stamp: 5, reward: 'Free dessert', category: 'desserts' },
    { stamp: 10, reward: 'Free main course', category: 'mains' },
  ],
  streak_visits_per_month: 3,
  referral_credit_naira: 2000,
  referral_max_per_month: 10,
};
const rules = new LoyaltyRules(SETTINGS);
const naira = (n) => Math.round(n * 100); // naira → kobo

describe('monthly interest (dining credit)', () => {
  it('pays nothing below the minimum balance', () => {
    expect(rules.interest(naira(19999.99))).toBe(0);
    expect(rules.interest(0)).toBe(0);
    expect(rules.interest(-500)).toBe(0);
  });

  it('pays 2% of the lowest balance, rounded down to whole naira', () => {
    expect(rules.interest(naira(20000))).toBe(naira(400));
    // ₦23,456.78 × 2% = ₦469.1356 → ₦469
    expect(rules.interest(naira(23456.78))).toBe(naira(469));
  });

  it('never pays more than the monthly cap', () => {
    expect(rules.interest(naira(250000))).toBe(naira(5000)); // exactly 2%
    expect(rules.interest(naira(300000))).toBe(naira(5000)); // 2% would be ₦6,000
  });
});

describe('wallet top-up bonus', () => {
  it('uses the highest band the amount reaches', () => {
    expect(rules.topupBonus(naira(49999))).toBe(0);
    expect(rules.topupBonus(naira(50000))).toBe(naira(2500)); // 5%
    expect(rules.topupBonus(naira(75000))).toBe(naira(3750)); // still 5%
    expect(rules.topupBonus(naira(100000))).toBe(naira(10000)); // 10%
  });

  it('has the configured limits', () => {
    expect(rules.topupLimits()).toEqual({ min: naira(5000), max: naira(1000000) });
  });
});

describe('points: multipliers never stack', () => {
  const MONDAY = 1;
  const TUESDAY = 2;
  const line = (n, featured = false) => ({ amountKobo: naira(n), featured });

  it('earns 5 points per ₦1,000 at the base rate', () => {
    expect(rules.pointsFor([line(10000)], MONDAY, 'bronze', false)).toBe(50);
  });

  it('applies the tier multiplier alone', () => {
    expect(rules.pointsFor([line(10000)], MONDAY, 'gold', false)).toBe(75); // 1.5×
  });

  it('uses only the highest multiplier: Gold (1.5×) on a double-points day earns 2×, not 3×', () => {
    expect(rules.pointsFor([line(10000)], TUESDAY, 'gold', false)).toBe(100);
  });

  it('does not stack featured, birthday, tier and double day', () => {
    expect(rules.pointsFor([line(10000, true)], TUESDAY, 'black_diamond', true)).toBe(100);
  });

  it('gives featured dishes their own multiplier per line', () => {
    expect(rules.pointsFor([line(10000, true), line(10000)], MONDAY, 'bronze', false)).toBe(150);
  });

  it('rounds down, once, for the whole order', () => {
    expect(rules.pointsFor([line(1000)], MONDAY, 'silver', false)).toBe(6); // 6.25
    expect(rules.pointsFor([line(500), line(500)], MONDAY, 'silver', false)).toBe(6);
  });

  it('reports the order multiplier for display', () => {
    expect(rules.orderMultiplier(TUESDAY, 'gold', false)).toBe(2);
    expect(rules.orderMultiplier(MONDAY, 'black_diamond', false)).toBe(2);
    expect(rules.orderMultiplier(MONDAY, 'silver', true)).toBe(2);
    expect(rules.orderMultiplier(MONDAY, 'silver', false)).toBe(1.25);
  });

  it('converts points to dining credit (100 points = ₦1,000)', () => {
    expect(rules.pointsToCreditKobo(100)).toBe(naira(1000));
    expect(rules.pointsToCreditKobo(250)).toBe(naira(2500));
    expect(rules.pointsToCreditKobo(0)).toBe(0);
  });
});

describe('tiers', () => {
  it('follows 12-month spend', () => {
    expect(rules.tierFor(0)).toBe('bronze');
    expect(rules.tierFor(naira(149999.99))).toBe('bronze');
    expect(rules.tierFor(naira(150000))).toBe('silver');
    expect(rules.tierFor(naira(500000))).toBe('gold');
    expect(rules.tierFor(naira(2000000))).toBe('black_diamond');
  });

  it('shows the way to the next tier', () => {
    expect(rules.nextTier(naira(100000))).toEqual({
      key: 'silver',
      name: 'Silver',
      remainingKobo: naira(50000),
      progress: 0.6667,
    });
    expect(rules.nextTier(naira(1500000))).toBeNull();
  });
});

describe('stamp card and streaks', () => {
  it('gives the 5th-stamp and 10th-stamp rewards and starts a new card', () => {
    expect(rules.addStamp(0)).toEqual({ stamps: 1, reward: null });
    expect(rules.addStamp(4)).toMatchObject({ stamps: 5, reward: { reward: 'Free dessert' } });
    expect(rules.addStamp(9)).toMatchObject({ stamps: 0, reward: { reward: 'Free main course' } });
  });

  it('pays the streak bonus once, on the third visit of the month', () => {
    expect([1, 2, 3, 4].map((n) => rules.streakReached(n))).toEqual([false, false, true, false]);
  });
});

describe('referrals', () => {
  const ok = {
    self_referral: false,
    same_phone_as_referrer: false,
    phone_used_by_other_referral: false,
    referrer_rewards_this_month: 0,
  };

  it('rewards a genuine friend with ₦2,000 each', () => {
    expect(rules.referralRejection(ok)).toBeNull();
    expect(rules.referralCreditKobo()).toBe(naira(2000));
  });

  it('rejects abuse', () => {
    expect(rules.referralRejection({ ...ok, self_referral: true })).toBe('Self-referral');
    expect(rules.referralRejection({ ...ok, same_phone_as_referrer: true })).toBe(
      'Same phone number as the referrer',
    );
    expect(rules.referralRejection({ ...ok, phone_used_by_other_referral: true })).toBe(
      'Phone number already used for a referral',
    );
    expect(rules.referralRejection({ ...ok, referrer_rewards_this_month: 10 })).toBe(
      'Referrer reached the monthly limit',
    );
  });
});

describe('birthday week', () => {
  const week = (birthday, at) => LoyaltyRules.inBirthdayWeek(birthday, parse(at));

  it('runs for 7 days from the birthday', () => {
    expect(week('1990-10-28', '2026-10-27 23:59')).toBe(false);
    expect(week('1990-10-28', '2026-10-28 00:00')).toBe(true);
    expect(week('1990-10-28', '2026-11-03 23:59')).toBe(true);
    expect(week('1990-10-28', '2026-11-04 00:00')).toBe(false);
  });

  it('carries over New Year and handles 29 February', () => {
    expect(week('1990-12-30', '2027-01-04 12:00')).toBe(true);
    expect(week('2000-02-29', '2027-02-28 12:00')).toBe(true);
    expect(week(null, '2027-02-28 12:00')).toBe(false);
  });
});

describe('welcome bonus', () => {
  it('defaults to 200 points and 0 switches it off', () => {
    expect(rules.welcomeBonusPoints()).toBe(200);
    expect(new LoyaltyRules({ ...SETTINGS, welcome_bonus_points: 350 }).welcomeBonusPoints()).toBe(350);
    expect(new LoyaltyRules({ ...SETTINGS, welcome_bonus_points: 0 }).welcomeBonusPoints()).toBe(0);
  });

  it('waits for a confirmed email and refuses a phone or device used before', () => {
    const ok = { email_verified: true, phone_used_by_other_bonus: false, device_used_by_other_bonus: false };
    expect(rules.welcomeBonusRejection(ok)).toBeNull();
    expect(rules.welcomeBonusRejection({ ...ok, email_verified: false })).toBe('Email not verified');
    expect(rules.welcomeBonusRejection({ ...ok, phone_used_by_other_bonus: true })).toBe(
      'Phone number already used for a welcome bonus',
    );
    expect(rules.welcomeBonusRejection({ ...ok, device_used_by_other_bonus: true })).toBe(
      'Device already used for a welcome bonus',
    );
  });
});
