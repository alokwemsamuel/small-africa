import { addDays, addMonths, parse } from '../time';

/**
 * Port of App\Loyalty\LoyaltyRules: pure Interest Account arithmetic. Integers only and every
 * division rounds down, so the restaurant never over-credits. Multipliers never stack.
 */
export class LoyaltyRules {
  s;
  constructor(s) {
    this.s = s;
  }

  interest(lowestBalanceKobo) {
    const min = Number(this.s.interest_min_balance_naira ?? 20000) * 100;
    if (lowestBalanceKobo < min || lowestBalanceKobo <= 0) return 0;
    const cap = Number(this.s.interest_cap_naira ?? 5000) * 100;
    const kobo = Math.floor((lowestBalanceKobo * Number(this.s.interest_rate_bp ?? 200)) / 10000);
    return Math.min(cap, kobo - (kobo % 100));
  }

  topupBonus(amountKobo) {
    const bands = [...(this.s.topup_bonus_tiers ?? [])].sort((a, b) => b.min_naira - a.min_naira);
    const band = bands.find((b) => amountKobo >= Number(b.min_naira) * 100);
    return band ? Math.floor((amountKobo * Number(band.bonus_bp)) / 10000) : 0;
  }

  topupLimits() {
    return {
      min: Number(this.s.topup_min_naira ?? 5000) * 100,
      max: Number(this.s.topup_max_naira ?? 1000000) * 100,
    };
  }

  tiers() {
    return [...(this.s.tiers ?? [])].sort((a, b) => a.min_spend_naira - b.min_spend_naira);
  }

  tierFor(spendKobo) {
    let key = 'bronze';
    for (const t of this.tiers()) if (spendKobo >= t.min_spend_naira * 100) key = t.key;
    return key;
  }

  nextTier(spendKobo) {
    const tiers = this.tiers();
    const index = Math.max(
      0,
      tiers.findIndex((t) => t.key === this.tierFor(spendKobo)),
    );
    const next = tiers[index + 1];
    if (!next) return null;
    const from = tiers[index].min_spend_naira * 100;
    const to = next.min_spend_naira * 100;
    const progress = to > from ? Math.min(1, Math.max(0, (spendKobo - from) / (to - from))) : 1;
    return {
      key: next.key,
      name: next.name,
      remainingKobo: Math.max(0, to - spendKobo),
      progress: Math.round(progress * 10000) / 10000,
    };
  }

  tierMultiplier(tier) {
    return Number(this.tiers().find((t) => t.key === tier)?.multiplier ?? 1);
  }

  tierRank(tier) {
    return Math.max(
      0,
      this.tiers().findIndex((t) => t.key === tier),
    );
  }

  /** N points per ₦1,000 of food spend; each line at the single highest multiplier that applies. */
  pointsFor(lines, weekday, tier, birthdayWeek) {
    const per1000 = Number(this.s.earn_points_per_1000_naira ?? 5);
    const order = this.orderMultiplier(weekday, tier, birthdayWeek);
    const featured = Number(this.s.featured_dish_points_multiplier ?? 2);
    let weighted = 0;
    for (const l of lines) {
      const m = l.featured ? Math.max(order, featured) : order;
      weighted += Math.max(0, l.amountKobo) * Math.round(m * 100);
    }
    return Math.floor((weighted * per1000) / (100000 * 100));
  }

  orderMultiplier(weekday, tier, birthdayWeek) {
    const doubleDays = (this.s.double_points_weekdays ?? []).map(Number);
    return Math.max(
      this.tierMultiplier(tier),
      doubleDays.includes(weekday) ? 2 : 1,
      birthdayWeek ? Number(this.s.birthday_points_multiplier ?? 2) : 1,
    );
  }

  pointsToCreditKobo(points) {
    return Math.floor((points * 100000) / Math.max(1, Number(this.s.redeem_points_per_1000_naira ?? 100)));
  }

  addStamp(current) {
    const next = current + 1;
    let reward = null;
    for (const r of this.s.stamp_rewards ?? []) if (Number(r.stamp) === next) reward = r;
    return { stamps: next >= 10 ? 0 : next, reward };
  }

  streakReached(visitsThisMonth) {
    return visitsThisMonth === Number(this.s.streak_visits_per_month ?? 3);
  }

  referralCreditKobo() {
    return Number(this.s.referral_credit_naira ?? 2000) * 100;
  }

  referralRejection(f) {
    if (f.self_referral) return 'Self-referral';
    if (f.same_phone_as_referrer) return 'Same phone number as the referrer';
    if (f.phone_used_by_other_referral) return 'Phone number already used for a referral';
    if (f.referrer_rewards_this_month >= Number(this.s.referral_max_per_month ?? 10)) {
      return 'Referrer reached the monthly limit';
    }
    return null;
  }

  /** Whether `date` falls in the 7 days starting on the guest's birthday. */
  static inBirthdayWeek(birthday, date) {
    const m = birthday ? /^\d{4}-(\d{2})-(\d{2})$/.exec(birthday) : null;
    if (!m) return false;
    for (const year of [date.getUTCFullYear() - 1, date.getUTCFullYear()]) {
      const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
      const day = m[1] === '02' && m[2] === '29' && !leap ? '28' : m[2];
      const start = parse(`${year}-${m[1]}-${day}`);
      if (date >= start && date < addDays(start, 7)) return true;
    }
    return false;
  }

  /** When points expire after the last activity. */
  expiresAt(lastActivity) {
    return addMonths(lastActivity, Number(this.s.points_expiry_months ?? 12));
  }
}
