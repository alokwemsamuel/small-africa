import { db, type Row } from '../db';
import { fail, naira } from '../http';
import { code } from '../random';
import {
  addDays,
  addMinutes,
  addMonths,
  monthLabel,
  MONTHS,
  now,
  parse,
  period,
  sql,
  startOfMonth,
  weekday,
  ymd,
} from '../time';
import { audit } from './audit';
import { LoyaltyRules } from './loyaltyRules';

/** Port of App\Loyalty\LoyaltyService, Ledger, Notifier, WalletService and InterestService. */

export const VOUCHER_DAYS = 90;
const STAMP_CARD_SIZE = 10;

export function rules(): LoyaltyRules {
  return new LoyaltyRules(db.settings('loyalty'));
}

/* -------------------------------------------------------------------- ledger */

export function account(userId: number): Row {
  return (
    db.find('loyalty_accounts', (a) => a.user_id === userId) ??
    db.insert('loyalty_accounts', { user_id: userId })
  );
}

type Kind = 'wallet' | 'points';

/** Appends one ledger row and updates the cached balance. Replaying an idempotency key changes nothing. */
function move(
  kind: Kind,
  userId: number,
  direction: 'credit' | 'debit',
  type: string,
  amount: number,
  description: string,
  reference: string | null = null,
  idempotencyKey: string | null = null,
  actorId: number | null = null,
): { id: number; balanceAfter: number; replayed: boolean } {
  if (amount <= 0) throw new Error('Ledger amounts must be positive.');
  const [table, amountCol, balanceCol, cacheCol] =
    kind === 'wallet'
      ? ['wallet_ledger', 'amount_kobo', 'balance_after_kobo', 'wallet_balance_kobo']
      : ['points_ledger', 'points', 'balance_after', 'points_balance'];
  const a = account(userId);
  if (idempotencyKey !== null) {
    const existing = db.find(table, (r) => r.idempotency_key === idempotencyKey);
    if (existing) return { id: existing.id, balanceAfter: existing[balanceCol], replayed: true };
  }
  const balance = Number(a[cacheCol]);
  const after = direction === 'credit' ? balance + amount : balance - amount;
  if (after < 0) {
    throw kind === 'wallet'
      ? fail.conflict('There isn’t enough dining credit in your wallet for that.')
      : fail.conflict('You don’t have enough points for that.');
  }
  const row = db.insert(table, {
    user_id: userId,
    entry_type: type,
    direction,
    [amountCol]: amount,
    [balanceCol]: after,
    reference,
    description: description.slice(0, 255),
    idempotency_key: idempotencyKey,
    created_by_user_id: actorId,
  });
  a[cacheCol] = after;
  return { id: row.id, balanceAfter: after, replayed: false };
}

export const ledger = {
  wallet: (...args: Parameters<typeof move> extends [Kind, ...infer R] ? R : never) =>
    move('wallet', ...args),
  points: (...args: Parameters<typeof move> extends [Kind, ...infer R] ? R : never) =>
    move('points', ...args),
  /** The lowest wallet balance held between two instants (opening balance included). */
  lowestWalletBalance(userId: number, fromSql: string, toSql: string): number {
    const rows = db.where('wallet_ledger', (r) => r.user_id === userId);
    const before = rows.filter((r) => r.created_at < fromSql);
    const opening = before.length ? before[before.length - 1]!.balance_after_kobo : 0;
    const inside = rows
      .filter((r) => r.created_at >= fromSql && r.created_at < toSql)
      .map((r) => r.balance_after_kobo);
    return Math.min(opening, ...inside);
  },
};

/* -------------------------------------------------------------- notifications */

export function notify(
  userId: number,
  type: string,
  title: string,
  body: string,
  data: Row | null = null,
): void {
  // The real API also emails; the demo sends no email.
  db.insert('notifications', {
    user_id: userId,
    type,
    title: title.slice(0, 160),
    body: body.slice(0, 500),
    data: data ? JSON.stringify(data) : null,
  });
}

export function notifications(userId: number) {
  const rows = db.where('notifications', (n) => n.user_id === userId).sort((a, b) => b.id - a.id);
  return {
    items: rows.slice(0, 30).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read_at !== null,
      at: n.created_at,
    })),
    unread: rows.filter((n) => n.read_at === null).length,
  };
}

export function markRead(userId: number, ids: number[] | null): void {
  if (ids && ids.length === 0) return;
  for (const n of db.where('notifications', (r) => r.user_id === userId && r.read_at === null)) {
    if (!ids || ids.includes(n.id)) n.read_at = sql();
  }
}

/* ------------------------------------------------------------------ dashboard */

export function spend12m(userId: number): number {
  const since = sql(addMonths(now(), -12));
  const orders = db
    .where(
      'orders',
      (o) =>
        o.user_id === userId &&
        o.payment_status === 'paid' &&
        ['delivered', 'completed'].includes(o.status) &&
        o.placed_at !== null &&
        o.placed_at >= since,
    )
    .reduce((s, o) => s + o.subtotal_kobo - o.discount_kobo - o.voucher_discount_kobo, 0);
  const visits = db
    .where('dine_in_visits', (v) => v.user_id === userId && v.visited_at >= since)
    .reduce((s, v) => s + v.amount_kobo, 0);
  return orders + visits;
}

export function vouchers(userId: number) {
  const at = sql();
  return db
    .where('reward_vouchers', (v) => v.user_id === userId && v.status === 'issued' && v.expires_at > at)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
    .map((v) => ({
      code: v.code,
      title: v.title,
      source: v.source,
      dineInOnly: !!v.dine_in_only,
      expiresAt: v.expires_at,
    }));
}

export function summary(userId: number) {
  const a = account(userId);
  const user = db.byId('users', userId) ?? {};
  const r = rules();
  const s = r.s;
  const at = now();
  const spend = spend12m(userId);
  const tiers = r.tiers();
  const tier = tiers.find((t) => t.key === a.tier) ?? tiers[0]!;
  const points = Number(a.points_balance);

  const catalog = db
    .where('rewards_catalog', (x) => !!x.is_active)
    .sort((x, y) => x.points_cost - y.points_cost || x.sort_order - y.sort_order)
    .map((x) => ({
      slug: x.slug,
      name: x.name,
      description: x.description,
      pointsCost: x.points_cost,
      type: x.reward_type,
      creditKobo: x.credit_kobo ?? null,
      dineInOnly: !!x.dine_in_only,
      affordable: points >= x.points_cost,
    }));
  const nextCatalog = catalog.find((x) => !x.affordable) ?? null;
  const stampRewards = ((s.stamp_rewards ?? []) as Row[]).map((x) => ({
    stamp: Number(x.stamp),
    reward: String(x.reward),
  }));
  const stamps = Number(a.stamps);
  const nextStamp = stampRewards.find((x) => x.stamp > stamps) ?? null;
  const lowest = ledger.lowestWalletBalance(userId, sql(startOfMonth(at)), sql(addMinutes(at, 1 / 60)));
  const lastInterest =
    db
      .where('wallet_ledger', (l) => l.user_id === userId && l.entry_type === 'interest')
      .sort((x, y) => y.id - x.id)[0] ?? null;
  const referrals = db.where('referrals', (x) => x.referrer_user_id === userId);
  const months = Number(s.points_expiry_months ?? 12);
  const nowSql = sql();

  return {
    member: {
      name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(),
      since: user.created_at ?? null,
      birthdayWeek: LoyaltyRules.inBirthdayWeek(user.birthday ?? null, at),
      hasBirthday: !!user.birthday,
    },
    tier: {
      key: tier.key,
      name: tier.name,
      multiplier: Number(tier.multiplier),
      perks: tier.perks,
      spend12mKobo: spend,
      next: r.nextTier(spend),
    },
    tiers: tiers.map((t) => ({
      key: t.key,
      name: t.name,
      minSpendKobo: t.min_spend_naira * 100,
      multiplier: Number(t.multiplier),
      perks: t.perks,
    })),
    wallet: {
      balanceKobo: Number(a.wallet_balance_kobo),
      interest: {
        rateBp: Number(s.interest_rate_bp ?? 200),
        capKobo: Number(s.interest_cap_naira ?? 5000) * 100,
        minBalanceKobo: Number(s.interest_min_balance_naira ?? 20000) * 100,
        lowestThisMonthKobo: lowest,
        projectedKobo: r.interest(lowest),
        last: lastInterest
          ? {
              amountKobo: lastInterest.amount_kobo,
              period: lastInterest.reference,
              at: lastInterest.created_at,
            }
          : null,
      },
      topup: {
        presetsKobo: ((s.topup_presets_naira ?? []) as number[]).map((n) => Number(n) * 100),
        minKobo: r.topupLimits().min,
        maxKobo: r.topupLimits().max,
        bonusBands: ((s.topup_bonus_tiers ?? []) as Row[]).map((b) => ({
          minKobo: Number(b.min_naira) * 100,
          bonusBp: Number(b.bonus_bp),
        })),
      },
    },
    points: {
      balance: points,
      valueKobo: r.pointsToCreditKobo(points),
      earnPer1000Naira: Number(s.earn_points_per_1000_naira ?? 5),
      doublePointsWeekdays: ((s.double_points_weekdays ?? []) as number[]).map(Number),
      expiresAt: points > 0 && a.last_activity_at ? ymd(addMonths(parse(a.last_activity_at), months)) : null,
      nextReward: nextCatalog
        ? {
            name: nextCatalog.name,
            pointsCost: nextCatalog.pointsCost,
            remaining: nextCatalog.pointsCost - points,
          }
        : null,
    },
    stampCard: {
      stamps,
      size: STAMP_CARD_SIZE,
      rewards: stampRewards,
      next: nextStamp ? { ...nextStamp, remaining: nextStamp.stamp - stamps } : null,
      lifetime: Number(a.lifetime_stamps),
    },
    streak: {
      month: period(at),
      count: a.streak_month === period(at) ? Number(a.streak_count) : 0,
      target: Number(s.streak_visits_per_month ?? 3),
      bonusPoints: Number(s.streak_bonus_points ?? 200),
    },
    referral: {
      code: user.referral_code ?? null,
      link: user.referral_code
        ? `${window.location.origin}${import.meta.env.BASE_URL}register?ref=${encodeURIComponent(user.referral_code)}`
        : null,
      creditKobo: r.referralCreditKobo(),
      rewarded: referrals.filter((x) => x.status === 'rewarded').length,
      pending: referrals.filter((x) => x.status === 'pending').length,
    },
    rewards: catalog,
    vouchers: vouchers(userId),
    offers: db
      .where(
        'customer_offers',
        (o) => o.user_id === userId && (o.expires_at === null || o.expires_at > nowSql),
      )
      .sort((x, y) => y.id - x.id)
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        kind: o.kind,
        headline: o.headline,
        message: o.message,
        couponCode: db.byId('coupons', o.coupon_id)?.code ?? null,
        expiresAt: o.expires_at,
      })),
  };
}

export function history(userId: number, kind: string, before: number | null, limit = 20) {
  const [table, amount, balance] =
    kind === 'points'
      ? ['points_ledger', 'points', 'balance_after']
      : ['wallet_ledger', 'amount_kobo', 'balance_after_kobo'];
  const rows = db
    .where(table, (r) => r.user_id === userId && r.id < (before ?? Number.MAX_SAFE_INTEGER))
    .sort((a, b) => b.id - a.id)
    .slice(0, limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    entries: page.map((r) => ({
      id: r.id,
      type: r.entry_type,
      direction: r.direction,
      amount: r[amount],
      balanceAfter: r[balance],
      reference: r.reference,
      description: r.description,
      at: r.created_at,
    })),
    nextBefore: more && page.length ? page[page.length - 1]!.id : null,
  };
}

/* ---------------------------------------------------------- earning and tiers */

export function onOrderCompleted(order: Row): void {
  if (!order.user_id || order.loyalty_processed_at !== null || order.payment_status !== 'paid') return;
  const items = db.where('order_items', (i) => i.order_id === order.id);
  const subtotal = Number(order.subtotal_kobo);
  const food = Math.max(0, subtotal - order.discount_kobo - order.voucher_discount_kobo);
  const lines = items.map((i) => ({
    amountKobo: subtotal > 0 ? Math.floor((i.line_total_kobo * food) / subtotal) : 0,
    featured: !!db.byId('dishes', i.dish_id)?.is_featured,
  }));
  recordSpend(order.user_id, order.reference, lines, parse(order.placed_at ?? order.created_at), order);
  maybeRewardReferral(order.user_id);
}

export function recordSpend(
  userId: number,
  reference: string,
  lines: { amountKobo: number; featured: boolean }[],
  at: Date,
  order: Row | null = null,
): void {
  const r = rules();
  const s = r.s;
  const user = db.byId('users', userId);
  const a = account(userId);
  if (order && order.loyalty_processed_at !== null) return;
  const points = r.pointsFor(
    lines,
    weekday(at),
    a.tier,
    LoyaltyRules.inBirthdayWeek(user?.birthday ?? null, at),
  );
  if (points > 0)
    ledger.points(
      userId,
      'credit',
      'earn',
      points,
      `Points for ${reference}`,
      reference,
      `earn:${reference}`,
    );
  const stamp = r.addStamp(Number(a.stamps));
  let voucher: ReturnType<typeof issueVoucher> | null = null;
  if (stamp.reward) {
    voucher = issueVoucher(
      userId,
      'stamp_card',
      stamp.reward.reward,
      null,
      null,
      stamp.reward.category ?? null,
      false,
      VOUCHER_DAYS,
    );
  }
  const month = period(at);
  const count = a.streak_month === month ? Number(a.streak_count) + 1 : 1;
  let streakBonus = 0;
  if (r.streakReached(count)) {
    streakBonus = Number(s.streak_bonus_points ?? 200);
    ledger.points(
      userId,
      'credit',
      'streak',
      streakBonus,
      `Monthly streak bonus: ${count} visits in ${MONTHS[at.getUTCMonth()]}`,
      month,
      `streak:${userId}:${month}`,
    );
  }
  Object.assign(a, {
    stamps: stamp.stamps,
    lifetime_stamps: Number(a.lifetime_stamps) + 1,
    streak_month: month,
    streak_count: Math.min(255, count),
    last_activity_at: sql(),
  });
  if (order) Object.assign(order, { points_earned: points, loyalty_processed_at: sql() });

  if (points > 0) {
    notify(
      userId,
      'points',
      `You earned ${points} points`,
      `Thank you for dining with us. ${points} points from ${reference} are in your Interest Account.`,
      { reference },
    );
  }
  if (voucher) {
    notify(
      userId,
      'stamp_reward',
      `Stamp card reward: ${voucher.title}`,
      `Your stamp card earned you a ${voucher.title}. Use code ${voucher.code} on your next order.`,
      { code: voucher.code },
    );
  }
  if (streakBonus > 0) {
    notify(
      userId,
      'streak',
      `Streak bonus: +${streakBonus} points`,
      'Three visits this month! Your streak bonus has been added.',
    );
  }
  recalculateTier(userId, false);
}

export function recordVisit(userId: number, amountKobo: number, actorId: number, note: string | null) {
  if (!db.find('users', (u) => u.id === userId && u.role === 'customer' && u.is_active)) {
    throw fail.notFound('We couldn’t find that member.');
  }
  if (amountKobo < 100000 || amountKobo > 500000000) {
    throw fail.field('amount_naira', 'Enter the bill amount (₦1,000 to ₦5,000,000).');
  }
  const recent = sql(addMinutes(now(), -10));
  if (
    db.find(
      'dine_in_visits',
      (v) => v.user_id === userId && v.amount_kobo === amountKobo && v.visited_at >= recent,
    )
  ) {
    throw fail.conflict('That bill was already recorded a moment ago.');
  }
  const reference = code(6, 'DINE-');
  const visit = db.insert('dine_in_visits', {
    reference,
    user_id: userId,
    amount_kobo: amountKobo,
    note,
    recorded_by_user_id: actorId,
    visited_at: sql(),
  });
  recordSpend(userId, reference, [{ amountKobo, featured: false }], now());
  const points = db.find('points_ledger', (p) => p.idempotency_key === `earn:${reference}`)?.points ?? 0;
  visit.points_earned = points;
  audit(actorId, 'loyalty.visit_recorded', 'user', userId, { reference, amount_kobo: amountKobo });
  return { reference, points };
}

export function recalculateTier(userId: number, allowDowngrade: boolean): string | null {
  const r = rules();
  const spend = spend12m(userId);
  const a = account(userId);
  const current = String(a.tier);
  const earned = r.tierFor(spend);
  const up = r.tierRank(earned) > r.tierRank(current);
  const down = r.tierRank(earned) < r.tierRank(current);
  a.spend_12m_kobo = spend;
  if (!(up || (down && allowDowngrade))) return null;
  Object.assign(a, { tier: earned, tier_updated_at: sql() });
  audit(null, 'loyalty.tier_changed', 'user', userId, { from: current, to: earned, up });
  const tier = r.tiers().find((t) => t.key === earned);
  if (up && tier) {
    notify(
      userId,
      'tier_upgrade',
      `Welcome to ${tier.name}`,
      `You’re now a ${tier.name} member. Your perks: ${tier.perks.join(', ')}.`,
      { tier: tier.key },
    );
  }
  return earned;
}

/* -------------------------------------------------------------- redemptions */

export function issueVoucher(
  userId: number,
  source: string,
  title: string,
  rewardId: number | null,
  dishId: number | null,
  category: string | null,
  dineInOnly: boolean,
  days: number,
  pointsSpent = 0,
) {
  const voucherCode = code(6, 'RW-');
  const expires = sql(addDays(now(), days));
  db.insert('reward_vouchers', {
    user_id: userId,
    source,
    reward_id: rewardId,
    dish_id: dishId,
    category_slug: category,
    dine_in_only: dineInOnly ? 1 : 0,
    title: title.slice(0, 120),
    code: voucherCode,
    points_spent: pointsSpent,
    expires_at: expires,
  });
  return { code: voucherCode, title, expiresAt: expires, dineInOnly };
}

export function redeem(userId: number, slug: string, idempotencyKey: string | null) {
  const reward = db.find('rewards_catalog', (x) => x.slug === slug && !!x.is_active);
  if (!reward) throw fail.notFound('That reward isn’t available.');
  const min = Number(rules().s.min_points_to_redeem);
  if (reward.points_cost < min) throw fail.field('reward', `Rewards start at ${min} points.`);
  const key = idempotencyKey !== null ? `redeem:${userId}:${idempotencyKey}` : null;
  const entry = ledger.points(
    userId,
    'debit',
    'redeem',
    reward.points_cost,
    `Redeemed: ${reward.name}`,
    reward.slug,
    key,
  );
  if (entry.replayed) return { type: 'replayed', pointsBalance: entry.balanceAfter };
  const out: Row = { type: reward.reward_type, pointsBalance: entry.balanceAfter };
  if (reward.reward_type === 'credit') {
    ledger.wallet(
      userId,
      'credit',
      'reward_redemption',
      reward.credit_kobo,
      `${reward.name} (from points)`,
      reward.slug,
      `redeem-credit:${entry.id}`,
    );
    out.creditKobo = reward.credit_kobo;
  } else {
    out.voucher = issueVoucher(
      userId,
      'points',
      reward.name,
      reward.id,
      reward.dish_id,
      reward.category_slug,
      !!reward.dine_in_only,
      VOUCHER_DAYS,
      reward.points_cost,
    );
  }
  account(userId).last_activity_at = sql();
  audit(userId, 'loyalty.redeemed', 'reward', reward.slug, { points: reward.points_cost });
  notify(
    userId,
    'redeemed',
    `Redeemed: ${reward.name}`,
    out.voucher ? `Your voucher code is ${out.voucher.code}.` : 'Your dining credit is ready to spend.',
  );
  return out;
}

/* ---------------------------------------------------------------- referrals */

export function maybeRewardReferral(friendId: number): void {
  const referral = db.find('referrals', (x) => x.referred_user_id === friendId && x.status === 'pending');
  if (!referral) return;
  const friend = db.byId('users', friendId);
  const referrer = db.byId('users', referral.referrer_user_id);
  const firstOrder = db
    .where(
      'orders',
      (o) =>
        o.user_id === friendId &&
        o.payment_status === 'paid' &&
        ['delivered', 'completed'].includes(o.status),
    )
    .sort((a, b) => String(a.placed_at).localeCompare(String(b.placed_at)))[0];
  if (!friend || !referrer || !firstOrder || friend.email_verified_at === null) return;
  const digits = (p: string | null) =>
    String(p ?? '')
      .replace(/\D/g, '')
      .slice(-10);
  const phone = digits(referral.referred_phone ?? friend.phone);
  const monthStart = sql(startOfMonth(now()));
  const r = rules();
  const reason = r.referralRejection({
    self_referral: referrer.id === friend.id || referrer.email.toLowerCase() === friend.email.toLowerCase(),
    same_phone_as_referrer: phone !== '' && phone === digits(referrer.phone),
    phone_used_by_other_referral:
      phone !== '' &&
      db
        .where('referrals', (x) => x.id !== referral.id && x.status === 'rewarded')
        .some((x) => digits(x.referred_phone ?? db.byId('users', x.referred_user_id)?.phone ?? '') === phone),
    referrer_rewards_this_month: db.where(
      'referrals',
      (x) => x.referrer_user_id === referrer.id && x.status === 'rewarded' && x.rewarded_at >= monthStart,
    ).length,
  });
  if (reason !== null) {
    Object.assign(referral, { status: 'rejected', reject_reason: reason });
    audit(null, 'loyalty.referral_rejected', 'referral', referral.id, { reason });
    return;
  }
  const credit = r.referralCreditKobo();
  ledger.wallet(
    referrer.id,
    'credit',
    'referral_bonus',
    credit,
    `Referral: ${friend.first_name} joined and dined`,
    `REF-${referral.id}`,
    `referral:${referral.id}:referrer`,
  );
  ledger.wallet(
    friend.id,
    'credit',
    'referral_bonus',
    credit,
    `Welcome credit from ${referrer.first_name}’s invitation`,
    `REF-${referral.id}`,
    `referral:${referral.id}:friend`,
  );
  Object.assign(referral, { status: 'rewarded', rewarded_at: sql(), qualifying_order_id: firstOrder.id });
  audit(null, 'loyalty.referral_rewarded', 'referral', referral.id, { credit_kobo: credit });
  notify(
    referrer.id,
    'referral',
    `${naira(credit)} referral credit`,
    `${friend.first_name} enjoyed their first order. ${naira(credit)} dining credit is in your wallet.`,
  );
  notify(
    friend.id,
    'referral',
    `${naira(credit)} welcome credit`,
    `A thank-you from ${referrer.first_name} and us: ${naira(credit)} dining credit is in your wallet.`,
  );
}

/* ---------------------------------------------------------------- admin tools */

export function adjust(
  actorId: number,
  userId: number,
  kind: string,
  direction: 'credit' | 'debit',
  amount: number,
  reason: string,
) {
  if (reason.trim().length < 5) throw fail.field('reason', 'Please give a reason (at least 5 characters).');
  const entry =
    kind === 'points'
      ? ledger.points(
          userId,
          direction,
          'adjustment',
          amount,
          `Adjustment: ${reason.trim()}`,
          null,
          null,
          actorId,
        )
      : ledger.wallet(
          userId,
          direction,
          'adjustment',
          amount,
          `Adjustment: ${reason.trim()}`,
          null,
          null,
          actorId,
        );
  audit(actorId, 'loyalty.adjustment', 'user', userId, { kind, direction, amount, reason: reason.trim() });
  return { balanceAfter: entry.balanceAfter };
}

/* ------------------------------------------------------------------- wallet */

export function topupToPublic(t: Row) {
  return {
    reference: t.reference,
    amountKobo: t.amount_kobo,
    bonusKobo: t.bonus_kobo,
    status: t.status,
    paidAt: t.paid_at,
  };
}

/** Credits a paid top-up (and its bonus) exactly once. */
export function creditTopup(topup: Row): void {
  if (topup.status === 'paid') return;
  const userId = topup.user_id;
  const amount = Number(topup.amount_kobo);
  const bonus = Number(topup.bonus_kobo);
  ledger.wallet(
    userId,
    'credit',
    'topup',
    amount,
    'Wallet top-up',
    topup.reference,
    `topup:${topup.reference}`,
  );
  if (bonus > 0) {
    const pct = String(Math.round((bonus * 1000) / amount) / 10).replace(/\.0$/, '');
    ledger.wallet(
      userId,
      'credit',
      'topup_bonus',
      bonus,
      `Top-up bonus (${pct}%)`,
      topup.reference,
      `topup-bonus:${topup.reference}`,
    );
  }
  Object.assign(topup, { status: 'paid', paid_at: sql() });
  account(userId).last_activity_at = sql();
  audit(userId, 'wallet.topup', 'wallet_topup', topup.reference, { amount_kobo: amount, bonus_kobo: bonus });
  const bonusText = bonus > 0 ? ` including a ${naira(bonus)} bonus` : '';
  notify(
    userId,
    'topup',
    `${naira(amount + bonus)} added to your wallet`,
    `Your top-up${bonusText} is ready to spend at Small Africa.`,
    { reference: topup.reference },
  );
}

/* ------------------------------------------------------------------ interest */

/** InterestService::run. `demo` may pay the current month to date. Never pays a member twice. */
export function runInterest(periodKey: string, trigger: 'cron' | 'admin' | 'demo', actorId: number | null) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw fail.badRequest('Period must look like 2026-10.');
  const start = parse(`${periodKey}-01`);
  const end = addMonths(start, 1);
  const at = now();
  if (start > at) throw fail.badRequest('That month hasn’t started yet.');
  if (end > at && trigger !== 'demo') throw fail.badRequest('Interest is paid after the month ends.');
  const until = end < at ? end : at;

  const run = db.find('interest_runs', (x) => x.period === periodKey);
  if (run?.status === 'completed') {
    throw fail.conflict(`Interest for ${periodKey} has already been paid.`, 'interest_already_paid');
  }
  const row =
    run ??
    db.insert('interest_runs', {
      period: periodKey,
      status: 'running',
      triggered_by: trigger,
      run_by_user_id: actorId,
      started_at: sql(),
    });
  Object.assign(row, {
    status: 'running',
    triggered_by: trigger,
    run_by_user_id: actorId,
    started_at: sql(),
    error: null,
  });

  const r = rules();
  const label = monthLabel(start);
  const members = db.where(
    'users',
    (u) => u.role === 'customer' && !!u.is_active && u.created_at < sql(until),
  );
  for (const m of members) {
    const lowest = ledger.lowestWalletBalance(m.id, sql(start), sql(until));
    const interest = r.interest(lowest);
    if (interest <= 0) continue;
    const entry = ledger.wallet(
      m.id,
      'credit',
      'interest',
      interest,
      `Interest for ${label} (dining credit)`,
      periodKey,
      `interest:${periodKey}:${m.id}`,
    );
    if (!entry.replayed) {
      notify(
        m.id,
        'interest',
        `You earned ${naira(interest)} interest`,
        `You earned ${naira(interest)} interest this month — come and enjoy it!`,
        { period: periodKey },
      );
    }
  }
  const paid = db.where('wallet_ledger', (l) => l.entry_type === 'interest' && l.reference === periodKey);
  const total = paid.reduce((s, l) => s + l.amount_kobo, 0);
  Object.assign(row, {
    status: 'completed',
    accounts_credited: paid.length,
    total_kobo: total,
    finished_at: sql(),
  });
  audit(actorId, 'loyalty.interest_run', 'interest_run', periodKey, {
    trigger,
    accounts: paid.length,
    total_kobo: total,
  });
  return { period: periodKey, status: 'completed', accountsCredited: paid.length, totalKobo: total };
}

export function interestRuns() {
  return db
    .all('interest_runs')
    .slice()
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 24)
    .map((x) => ({
      period: x.period,
      status: x.status,
      accounts: x.accounts_credited,
      totalKobo: x.total_kobo,
      trigger: x.triggered_by,
      startedAt: x.started_at,
      finishedAt: x.finished_at,
      error: x.error,
    }));
}
