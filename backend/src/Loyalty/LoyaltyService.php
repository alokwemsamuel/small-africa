<?php

declare(strict_types=1);

namespace App\Loyalty;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\ValidationError;
use App\Security\Crypto;
use App\Security\RateLimiter;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Logger;
use App\Support\Settings;

/**
 * The Small Africa Interest Account: dining wallet, points, tiers, stamp card, streaks,
 * vouchers, referrals and the notification centre. All balances move through Ledger.
 */
final class LoyaltyService
{
    public const VOUCHER_DAYS = 90;
    private const STAMP_CARD_SIZE = 10;

    public function __construct(
        private Database $db,
        private Settings $settings,
        private Ledger $ledger,
        private Notifier $notifier,
        private AuditLogger $audit,
        private RateLimiter $limiter,
        private Clock $clock,
        private Logger $logger,
        private string $frontendUrl,
    ) {
    }

    public function rules(): LoyaltyRules
    {
        return new LoyaltyRules($this->settings->group('loyalty'));
    }

    /* ------------------------------------------------------------------ dashboard */

    /** @return array<string, mixed> */
    public function summary(int $userId): array
    {
        $this->db->run('INSERT IGNORE INTO loyalty_accounts (user_id) VALUES (?)', [$userId]);
        $a = $this->db->one('SELECT * FROM loyalty_accounts WHERE user_id = ?', [$userId]) ?? [];
        $user = $this->db->one('SELECT first_name, last_name, referral_code, birthday, created_at FROM users WHERE id = ?', [$userId]) ?? [];
        $rules = $this->rules();
        $s = $rules->settings();
        $now = $this->clock->now();
        $spend = $this->spend12m($userId);
        $tiers = $rules->tiers();
        $tier = array_values(array_filter($tiers, static fn ($t) => $t['key'] === $a['tier']))[0] ?? $tiers[0];
        $points = (int) $a['points_balance'];
        $wallet = (int) $a['wallet_balance_kobo'];

        $catalog = array_map(static fn ($r) => [
            'slug' => $r['slug'],
            'name' => $r['name'],
            'description' => $r['description'],
            'pointsCost' => (int) $r['points_cost'],
            'type' => $r['reward_type'],
            'creditKobo' => $r['credit_kobo'] !== null ? (int) $r['credit_kobo'] : null,
            'dineInOnly' => (bool) $r['dine_in_only'],
            'affordable' => $points >= (int) $r['points_cost'],
        ], $this->db->all('SELECT * FROM rewards_catalog WHERE is_active = 1 ORDER BY points_cost, sort_order'));
        $nextCatalog = array_values(array_filter($catalog, static fn ($r) => !$r['affordable']))[0] ?? null;

        $stampRewards = array_map(static fn ($r) => ['stamp' => (int) $r['stamp'], 'reward' => (string) $r['reward']], (array) ($s['stamp_rewards'] ?? []));
        $stamps = (int) $a['stamps'];
        $nextStamp = array_values(array_filter($stampRewards, static fn ($r) => $r['stamp'] > $stamps))[0] ?? null;

        $monthStart = $now->modify('first day of this month')->setTime(0, 0);
        $lowest = $this->ledger->lowestWalletBalance($userId, $this->clock->sql($monthStart), $this->clock->sql($now->modify('+1 second')));
        $lastInterest = $this->db->one(
            "SELECT amount_kobo, reference, created_at FROM wallet_ledger WHERE user_id = ? AND entry_type = 'interest' ORDER BY id DESC LIMIT 1",
            [$userId],
        );
        $referrals = $this->db->one(
            "SELECT SUM(status = 'rewarded') AS rewarded, SUM(status = 'pending') AS pending FROM referrals WHERE referrer_user_id = ?",
            [$userId],
        );
        $lastActivity = $a['last_activity_at'] ? new \DateTimeImmutable($a['last_activity_at'], Clock::zone()) : null;
        $months = (int) ($s['points_expiry_months'] ?? 12);

        return [
            'member' => [
                'name' => trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')),
                'since' => $user['created_at'] ?? null,
                'birthdayWeek' => LoyaltyRules::inBirthdayWeek($user['birthday'] ?? null, $now),
                'hasBirthday' => !empty($user['birthday']),
            ],
            'tier' => [
                'key' => $tier['key'],
                'name' => $tier['name'],
                'multiplier' => (float) $tier['multiplier'],
                'perks' => $tier['perks'],
                'spend12mKobo' => $spend,
                'next' => $rules->nextTier($spend),
            ],
            'tiers' => array_map(static fn ($t) => ['key' => $t['key'], 'name' => $t['name'], 'minSpendKobo' => (int) $t['min_spend_naira'] * 100, 'multiplier' => (float) $t['multiplier'], 'perks' => $t['perks']], $tiers),
            'wallet' => [
                'balanceKobo' => $wallet,
                'interest' => [
                    'rateBp' => (int) ($s['interest_rate_bp'] ?? 200),
                    'capKobo' => (int) ($s['interest_cap_naira'] ?? 5000) * 100,
                    'minBalanceKobo' => (int) ($s['interest_min_balance_naira'] ?? 20000) * 100,
                    'lowestThisMonthKobo' => $lowest,
                    'projectedKobo' => $rules->interest($lowest),
                    'last' => $lastInterest ? ['amountKobo' => (int) $lastInterest['amount_kobo'], 'period' => $lastInterest['reference'], 'at' => $lastInterest['created_at']] : null,
                ],
                'topup' => [
                    'presetsKobo' => array_map(static fn ($n) => (int) $n * 100, (array) ($s['topup_presets_naira'] ?? [])),
                    'minKobo' => $rules->topupLimits()['min'],
                    'maxKobo' => $rules->topupLimits()['max'],
                    'bonusBands' => array_map(static fn ($b) => ['minKobo' => (int) $b['min_naira'] * 100, 'bonusBp' => (int) $b['bonus_bp']], (array) ($s['topup_bonus_tiers'] ?? [])),
                ],
            ],
            'points' => [
                'balance' => $points,
                'valueKobo' => $rules->pointsToCreditKobo($points),
                'earnPer1000Naira' => (int) ($s['earn_points_per_1000_naira'] ?? 5),
                'doublePointsWeekdays' => array_map('intval', (array) ($s['double_points_weekdays'] ?? [])),
                'expiresAt' => $points > 0 && $lastActivity ? $lastActivity->modify("+{$months} months")->format('Y-m-d') : null,
                'nextReward' => $nextCatalog ? ['name' => $nextCatalog['name'], 'pointsCost' => $nextCatalog['pointsCost'], 'remaining' => $nextCatalog['pointsCost'] - $points] : null,
            ],
            'stampCard' => [
                'stamps' => $stamps,
                'size' => self::STAMP_CARD_SIZE,
                'rewards' => $stampRewards,
                'next' => $nextStamp ? $nextStamp + ['remaining' => $nextStamp['stamp'] - $stamps] : null,
                'lifetime' => (int) $a['lifetime_stamps'],
            ],
            'streak' => [
                'month' => $now->format('Y-m'),
                'count' => $a['streak_month'] === $now->format('Y-m') ? (int) $a['streak_count'] : 0,
                'target' => (int) ($s['streak_visits_per_month'] ?? 3),
                'bonusPoints' => (int) ($s['streak_bonus_points'] ?? 200),
            ],
            'referral' => [
                'code' => $user['referral_code'] ?? null,
                'link' => $user['referral_code'] ? "{$this->frontendUrl}/register?ref=" . rawurlencode($user['referral_code']) : null,
                'creditKobo' => $rules->referralCreditKobo(),
                'rewarded' => (int) ($referrals['rewarded'] ?? 0),
                'pending' => (int) ($referrals['pending'] ?? 0),
            ],
            'rewards' => $catalog,
            'vouchers' => $this->vouchers($userId),
            'offers' => array_map(fn ($o) => [
                'id' => (int) $o['id'],
                'kind' => $o['kind'],
                'headline' => $o['headline'],
                'message' => $o['message'],
                'couponCode' => $o['coupon_code'],
                'expiresAt' => $o['expires_at'],
            ], $this->db->all(
                'SELECT o.*, c.code AS coupon_code FROM customer_offers o LEFT JOIN coupons c ON c.id = o.coupon_id
                 WHERE o.user_id = ? AND (o.expires_at IS NULL OR o.expires_at > ?) ORDER BY o.id DESC LIMIT 5',
                [$userId, $this->clock->sql()],
            )),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function vouchers(int $userId): array
    {
        return array_map(static fn ($v) => [
            'code' => $v['code'],
            'title' => $v['title'],
            'source' => $v['source'],
            'dineInOnly' => (bool) $v['dine_in_only'],
            'expiresAt' => $v['expires_at'],
        ], $this->db->all(
            "SELECT * FROM reward_vouchers WHERE user_id = ? AND status = 'issued' AND expires_at > ? ORDER BY expires_at",
            [$userId, $this->clock->sql()],
        ));
    }

    /**
     * One page of the member's wallet or points history, newest first.
     *
     * @return array{entries: list<array<string, mixed>>, nextBefore: int|null}
     */
    public function history(int $userId, string $kind, ?int $before, int $limit = 20): array
    {
        [$table, $amount, $balance] = $kind === 'points'
            ? ['points_ledger', 'points', 'balance_after']
            : ['wallet_ledger', 'amount_kobo', 'balance_after_kobo'];
        $rows = $this->db->all(
            "SELECT id, entry_type, direction, {$amount} AS amount, {$balance} AS balance_after, reference, description, created_at
             FROM {$table} WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT " . ($limit + 1),
            [$userId, $before ?? PHP_INT_MAX],
        );
        $more = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        return [
            'entries' => array_map(static fn ($r) => [
                'id' => (int) $r['id'],
                'type' => $r['entry_type'],
                'direction' => $r['direction'],
                'amount' => (int) $r['amount'],
                'balanceAfter' => (int) $r['balance_after'],
                'reference' => $r['reference'],
                'description' => $r['description'],
                'at' => $r['created_at'],
            ], $rows),
            'nextBefore' => $more && $rows ? (int) end($rows)['id'] : null,
        ];
    }

    /* --------------------------------------------------------- earning and tiers */

    /** Points, stamp, streak and tier for an order that reached delivered/completed. Idempotent. */
    public function onOrderCompleted(int $orderId): void
    {
        $order = $this->db->one('SELECT * FROM orders WHERE id = ?', [$orderId]);
        if (!$order || !$order['user_id'] || $order['loyalty_processed_at'] !== null || $order['payment_status'] !== 'paid') {
            return;
        }
        $userId = (int) $order['user_id'];
        $items = $this->db->all(
            'SELECT oi.line_total_kobo, COALESCE(d.is_featured, 0) AS is_featured FROM order_items oi LEFT JOIN dishes d ON d.id = oi.dish_id WHERE oi.order_id = ?',
            [$orderId],
        );
        $subtotal = (int) $order['subtotal_kobo'];
        $food = max(0, $subtotal - (int) $order['discount_kobo'] - (int) $order['voucher_discount_kobo']);
        // Discounts are shared across lines in proportion, so points follow what was actually paid.
        $lines = array_map(static fn ($i) => [
            'amountKobo' => $subtotal > 0 ? intdiv((int) $i['line_total_kobo'] * $food, $subtotal) : 0,
            'featured' => (bool) $i['is_featured'],
        ], $items);
        $at = new \DateTimeImmutable((string) ($order['placed_at'] ?? $order['created_at']), Clock::zone());

        $this->recordSpend($userId, $order['reference'], $lines, $at, $orderId);
        $this->maybeRewardReferral($userId);
    }

    /**
     * Shared by online orders (and dine-in bills in the admin panel).
     *
     * @param list<array{amountKobo: int, featured: bool}> $lines
     */
    public function recordSpend(int $userId, string $reference, array $lines, \DateTimeImmutable $at, ?int $orderId = null): void
    {
        $rules = $this->rules();
        $s = $rules->settings();
        $birthday = $this->db->scalar('SELECT birthday FROM users WHERE id = ?', [$userId]);

        $result = $this->db->transaction(function () use ($userId, $reference, $lines, $at, $orderId, $rules, $s, $birthday): ?array {
            $account = $this->ledger->lockAccount($userId);
            if ($orderId !== null && $this->db->scalar('SELECT loyalty_processed_at FROM orders WHERE id = ? FOR UPDATE', [$orderId]) !== null) {
                return null;
            }
            $points = $rules->pointsFor($lines, (int) $at->format('w'), $account['tier'], LoyaltyRules::inBirthdayWeek($birthday ? (string) $birthday : null, $at));
            if ($points > 0) {
                $this->ledger->points($userId, 'credit', 'earn', $points, "Points for {$reference}", $reference, "earn:{$reference}");
            }

            $stamp = $rules->addStamp((int) $account['stamps']);
            $voucher = null;
            if ($stamp['reward'] !== null) {
                $voucher = $this->issueVoucher($userId, 'stamp_card', $stamp['reward']['reward'], null, null, $stamp['reward']['category'] ?? null, false, self::VOUCHER_DAYS);
            }
            $month = $at->format('Y-m');
            $count = $account['streak_month'] === $month ? (int) $account['streak_count'] + 1 : 1;
            $streakBonus = 0;
            if ($rules->streakReached($count)) {
                $streakBonus = (int) ($s['streak_bonus_points'] ?? 200);
                $this->ledger->points($userId, 'credit', 'streak', $streakBonus, "Monthly streak bonus: {$count} visits in " . $at->format('F'), $month, "streak:{$userId}:{$month}");
            }
            $this->db->run(
                'UPDATE loyalty_accounts SET stamps = ?, lifetime_stamps = lifetime_stamps + 1, streak_month = ?, streak_count = ?,
                 last_activity_at = ?, points_expiry_warned_at = NULL WHERE user_id = ?',
                [$stamp['stamps'], $month, min(255, $count), $this->clock->sql(), $userId],
            );
            if ($orderId !== null) {
                $this->db->run('UPDATE orders SET points_earned = ?, loyalty_processed_at = ? WHERE id = ?', [$points, $this->clock->sql(), $orderId]);
            }
            return ['points' => $points, 'voucher' => $voucher, 'streakBonus' => $streakBonus, 'stamps' => $stamp['stamps']];
        });
        if ($result === null) {
            return;
        }

        if ($result['points'] > 0) {
            $this->notifier->notify($userId, 'points', "You earned {$result['points']} points", "Thank you for dining with us. {$result['points']} points from {$reference} are in your Interest Account.", ['reference' => $reference]);
        }
        if ($result['voucher']) {
            $title = $result['voucher']['title'];
            $this->notifier->notify($userId, 'stamp_reward', "Stamp card reward: {$title}", "Your stamp card earned you a {$title}. Use code {$result['voucher']['code']} on your next order.", ['code' => $result['voucher']['code']], [
                'subject' => "You’ve earned a {$title} — Small Africa",
                'heading' => "A {$title}, on us",
                'body' => "Your stamp card just paid off. Use code {$result['voucher']['code']} at checkout within " . self::VOUCHER_DAYS . ' days.',
            ]);
        }
        if ($result['streakBonus'] > 0) {
            $this->notifier->notify($userId, 'streak', "Streak bonus: +{$result['streakBonus']} points", 'Three visits this month! Your streak bonus has been added.');
        }
        $this->recalculateTier($userId, false);
    }

    /** Food spend on completed orders and recorded dine-in bills over the last 12 months (decides the tier). */
    public function spend12m(int $userId): int
    {
        $since = $this->clock->sql($this->clock->now()->modify('-12 months'));
        return (int) $this->db->scalar(
            "SELECT COALESCE(SUM(subtotal_kobo - discount_kobo - voucher_discount_kobo), 0) FROM orders
             WHERE user_id = ? AND payment_status = 'paid' AND status IN ('delivered', 'completed') AND placed_at >= ?",
            [$userId, $since],
        ) + (int) $this->db->scalar('SELECT COALESCE(SUM(amount_kobo), 0) FROM dine_in_visits WHERE user_id = ? AND visited_at >= ?', [$userId, $since]);
    }

    /**
     * A dine-in bill recorded by the front desk: points, a stamp, streak and tier, like an order.
     *
     * @return array{reference: string, points: int}
     */
    public function recordVisit(int $userId, int $amountKobo, int $actorId, ?string $note = null): array
    {
        if (!$this->db->scalar("SELECT 1 FROM users WHERE id = ? AND role = 'customer' AND is_active = 1", [$userId])) {
            throw HttpError::notFound('We couldn’t find that member.');
        }
        if ($amountKobo < 100000 || $amountKobo > 500000000) {
            throw ValidationError::field('amount_naira', 'Enter the bill amount (₦1,000 to ₦5,000,000).');
        }
        // Guard against recording the same bill twice by accident.
        $recent = $this->db->scalar(
            'SELECT 1 FROM dine_in_visits WHERE user_id = ? AND amount_kobo = ? AND visited_at >= ?',
            [$userId, $amountKobo, $this->clock->sql($this->clock->now()->modify('-10 minutes'))],
        );
        if ($recent) {
            throw HttpError::conflict('That bill was already recorded a moment ago.');
        }
        do {
            $reference = Crypto::code(6, 'DINE-');
        } while ($this->db->scalar('SELECT 1 FROM dine_in_visits WHERE reference = ?', [$reference]));
        $now = $this->clock->now();
        $id = $this->db->insert('dine_in_visits', [
            'reference' => $reference, 'user_id' => $userId, 'amount_kobo' => $amountKobo, 'note' => $note,
            'recorded_by_user_id' => $actorId, 'visited_at' => $this->clock->sql($now), 'created_at' => $this->clock->sql($now),
        ]);
        $this->recordSpend($userId, $reference, [['amountKobo' => $amountKobo, 'featured' => false]], $now);
        $points = (int) $this->db->scalar('SELECT points FROM points_ledger WHERE idempotency_key = ?', ["earn:{$reference}"]);
        $this->db->run('UPDATE dine_in_visits SET points_earned = ? WHERE id = ?', [$points, $id]);
        $this->audit->record($actorId, 'loyalty.visit_recorded', 'user', $userId, ['reference' => $reference, 'amount_kobo' => $amountKobo]);
        return ['reference' => $reference, 'points' => $points];
    }

    /**
     * Upgrades happen as soon as spend allows; downgrades only in the monthly review.
     *
     * @return string|null the new tier when it changed
     */
    public function recalculateTier(int $userId, bool $allowDowngrade): ?string
    {
        $rules = $this->rules();
        $spend = $this->spend12m($userId);
        $change = $this->db->transaction(function () use ($userId, $spend, $rules, $allowDowngrade): ?array {
            $account = $this->ledger->lockAccount($userId);
            $current = (string) $account['tier'];
            $earned = $rules->tierFor($spend);
            $up = $rules->tierRank($earned) > $rules->tierRank($current);
            $down = $rules->tierRank($earned) < $rules->tierRank($current);
            if ($up || ($down && $allowDowngrade)) {
                $this->db->run('UPDATE loyalty_accounts SET tier = ?, spend_12m_kobo = ?, tier_updated_at = ? WHERE user_id = ?', [$earned, $spend, $this->clock->sql(), $userId]);
                return ['from' => $current, 'to' => $earned, 'up' => $up];
            }
            $this->db->run('UPDATE loyalty_accounts SET spend_12m_kobo = ? WHERE user_id = ?', [$spend, $userId]);
            return null;
        });
        if ($change === null) {
            return null;
        }
        $this->audit->record(null, 'loyalty.tier_changed', 'user', $userId, $change);
        $tier = array_values(array_filter($rules->tiers(), static fn ($t) => $t['key'] === $change['to']))[0] ?? null;
        if ($change['up'] && $tier) {
            $perks = implode(', ', $tier['perks']);
            $this->notifier->notify($userId, 'tier_upgrade', "Welcome to {$tier['name']}", "You’re now a {$tier['name']} member. Your perks: {$perks}.", ['tier' => $tier['key']], [
                'subject' => "You’re now {$tier['name']} — Small Africa",
                'heading' => "Welcome to {$tier['name']}",
                'body' => "Thank you for dining with us so often. As a {$tier['name']} member you now enjoy: {$perks}.",
            ]);
        }
        return $change['to'];
    }

    /* ------------------------------------------------------------- redemptions */

    /** @return array{type: string, creditKobo?: int, voucher?: array<string, mixed>, pointsBalance: int} */
    public function redeem(int $userId, string $slug, ?string $idempotencyKey): array
    {
        $this->limiter->hit("redeem:uid:{$userId}", 10, 3600);
        $reward = $this->db->one('SELECT * FROM rewards_catalog WHERE slug = ? AND is_active = 1', [$slug]);
        if (!$reward) {
            throw HttpError::notFound('That reward isn’t available.');
        }
        $min = (int) $this->rules()->settings()['min_points_to_redeem'];
        if ((int) $reward['points_cost'] < $min) {
            throw ValidationError::field('reward', "Rewards start at {$min} points.");
        }
        $key = $idempotencyKey !== null ? "redeem:{$userId}:{$idempotencyKey}" : null;
        $result = $this->db->transaction(function () use ($userId, $reward, $key): array {
            $entry = $this->ledger->points($userId, 'debit', 'redeem', (int) $reward['points_cost'], "Redeemed: {$reward['name']}", $reward['slug'], $key);
            if ($entry['replayed']) {
                return ['type' => 'replayed', 'pointsBalance' => $entry['balanceAfter']];
            }
            $out = ['type' => $reward['reward_type'], 'pointsBalance' => $entry['balanceAfter']];
            if ($reward['reward_type'] === 'credit') {
                $credit = (int) $reward['credit_kobo'];
                $this->ledger->wallet($userId, 'credit', 'reward_redemption', $credit, "{$reward['name']} (from points)", $reward['slug'], "redeem-credit:{$entry['id']}");
                $out['creditKobo'] = $credit;
            } else {
                $out['voucher'] = $this->issueVoucher(
                    $userId, 'points', $reward['name'], (int) $reward['id'],
                    $reward['dish_id'] !== null ? (int) $reward['dish_id'] : null, $reward['category_slug'],
                    (bool) $reward['dine_in_only'], self::VOUCHER_DAYS, (int) $reward['points_cost'],
                );
            }
            $this->db->run('UPDATE loyalty_accounts SET last_activity_at = ?, points_expiry_warned_at = NULL WHERE user_id = ?', [$this->clock->sql(), $userId]);
            return $out;
        });
        if ($result['type'] !== 'replayed') {
            $this->audit->record($userId, 'loyalty.redeemed', 'reward', $reward['slug'], ['points' => (int) $reward['points_cost']]);
            $this->notifier->notify($userId, 'redeemed', "Redeemed: {$reward['name']}", isset($result['voucher'])
                ? "Your voucher code is {$result['voucher']['code']}."
                : 'Your dining credit is ready to spend.');
        }
        return $result;
    }

    /** @return array{code: string, title: string, expiresAt: string, dineInOnly: bool} */
    public function issueVoucher(int $userId, string $source, string $title, ?int $rewardId, ?int $dishId, ?string $category, bool $dineInOnly, int $days, int $pointsSpent = 0): array
    {
        do {
            $code = Crypto::code(6, 'RW-');
        } while ($this->db->scalar('SELECT 1 FROM reward_vouchers WHERE code = ?', [$code]));
        $expires = $this->clock->sql($this->clock->now()->modify("+{$days} days"));
        $this->db->insert('reward_vouchers', [
            'user_id' => $userId,
            'source' => $source,
            'reward_id' => $rewardId,
            'dish_id' => $dishId,
            'category_slug' => $category,
            'dine_in_only' => $dineInOnly ? 1 : 0,
            'title' => mb_substr($title, 0, 120),
            'code' => $code,
            'points_spent' => $pointsSpent,
            'expires_at' => $expires,
            'created_at' => $this->clock->sql(),
        ]);
        return ['code' => $code, 'title' => $title, 'expiresAt' => $expires, 'dineInOnly' => $dineInOnly];
    }

    /* --------------------------------------------------------------- referrals */

    /**
     * Pays the referral credit once the friend has a completed order and a verified email,
     * after the anti-abuse checks. Unverified friends stay pending (the daily job retries).
     */
    public function maybeRewardReferral(int $referredUserId): void
    {
        $referral = $this->db->one("SELECT * FROM referrals WHERE referred_user_id = ? AND status = 'pending'", [$referredUserId]);
        if (!$referral) {
            return;
        }
        $friend = $this->db->one('SELECT * FROM users WHERE id = ?', [$referredUserId]);
        $referrer = $this->db->one('SELECT * FROM users WHERE id = ?', [$referral['referrer_user_id']]);
        $firstOrder = $this->db->scalar(
            "SELECT id FROM orders WHERE user_id = ? AND payment_status = 'paid' AND status IN ('delivered','completed') ORDER BY placed_at LIMIT 1",
            [$referredUserId],
        );
        if (!$friend || !$referrer || !$firstOrder) {
            return;
        }
        if ($friend['email_verified_at'] === null) {
            return; // waits for verification
        }
        $digits = static fn (?string $p): string => substr(preg_replace('/\D/', '', (string) $p) ?? '', -10);
        $phone = $digits($referral['referred_phone'] ?? $friend['phone']);
        $monthStart = $this->clock->sql($this->clock->now()->modify('first day of this month')->setTime(0, 0));
        $rules = $this->rules();
        $reason = $rules->referralRejection([
            'self_referral' => (int) $referrer['id'] === (int) $friend['id'] || strcasecmp($referrer['email'], $friend['email']) === 0,
            'email_verified' => true,
            'same_phone_as_referrer' => $phone !== '' && $phone === $digits($referrer['phone']),
            'phone_used_by_other_referral' => $phone !== '' && (bool) $this->db->scalar(
                "SELECT 1 FROM referrals r JOIN users u ON u.id = r.referred_user_id WHERE r.id <> ? AND r.status = 'rewarded'
                 AND RIGHT(REGEXP_REPLACE(COALESCE(r.referred_phone, u.phone, ''), '[^0-9]', ''), 10) = ?",
                [$referral['id'], $phone],
            ),
            'device_used_by_other_referral' => $referral['device_hash'] !== null && (bool) $this->db->scalar(
                "SELECT 1 FROM referrals WHERE id <> ? AND device_hash = ? AND status = 'rewarded'",
                [$referral['id'], $referral['device_hash']],
            ),
            'referrer_rewards_this_month' => (int) $this->db->scalar(
                "SELECT COUNT(*) FROM referrals WHERE referrer_user_id = ? AND status = 'rewarded' AND rewarded_at >= ?",
                [$referrer['id'], $monthStart],
            ),
        ]);
        if ($reason !== null) {
            $this->db->run("UPDATE referrals SET status = 'rejected', reject_reason = ? WHERE id = ? AND status = 'pending'", [$reason, $referral['id']]);
            $this->audit->record(null, 'loyalty.referral_rejected', 'referral', (int) $referral['id'], ['reason' => $reason]);
            return;
        }
        $credit = $rules->referralCreditKobo();
        $paid = $this->db->transaction(function () use ($referral, $referrer, $friend, $credit, $firstOrder): bool {
            $locked = $this->db->one('SELECT status FROM referrals WHERE id = ? FOR UPDATE', [$referral['id']]);
            if (($locked['status'] ?? '') !== 'pending') {
                return false;
            }
            $this->ledger->wallet((int) $referrer['id'], 'credit', 'referral_bonus', $credit, "Referral: {$friend['first_name']} joined and dined", 'REF-' . $referral['id'], "referral:{$referral['id']}:referrer");
            $this->ledger->wallet((int) $friend['id'], 'credit', 'referral_bonus', $credit, "Welcome credit from {$referrer['first_name']}’s invitation", 'REF-' . $referral['id'], "referral:{$referral['id']}:friend");
            $this->db->run(
                "UPDATE referrals SET status = 'rewarded', rewarded_at = ?, qualifying_order_id = ? WHERE id = ?",
                [$this->clock->sql(), $firstOrder, $referral['id']],
            );
            return true;
        });
        if (!$paid) {
            return;
        }
        $amount = Notifier::naira($credit);
        $this->audit->record(null, 'loyalty.referral_rewarded', 'referral', (int) $referral['id'], ['credit_kobo' => $credit]);
        $this->notifier->notify((int) $referrer['id'], 'referral', "{$amount} referral credit", "{$friend['first_name']} enjoyed their first order. {$amount} dining credit is in your wallet.", [], [
            'subject' => "You’ve earned {$amount} dining credit — Small Africa",
            'heading' => 'Thank you for sharing the table',
            'body' => "{$friend['first_name']} joined with your code and enjoyed their first order, so {$amount} of dining credit is now in your Interest Account.",
        ]);
        $this->notifier->notify((int) $friend['id'], 'referral', "{$amount} welcome credit", "A thank-you from {$referrer['first_name']} and us: {$amount} dining credit is in your wallet.");
    }

    /* ------------------------------------------------------------ admin tools */

    /**
     * Manual correction by a Super Admin. Reason required; always audit-logged.
     *
     * @return array{balanceAfter: int}
     */
    public function adjust(int $actorId, int $userId, string $kind, string $direction, int $amount, string $reason): array
    {
        if (mb_strlen(trim($reason)) < 5) {
            throw ValidationError::field('reason', 'Please give a reason (at least 5 characters).');
        }
        $entry = $kind === 'points'
            ? $this->ledger->points($userId, $direction, 'adjustment', $amount, 'Adjustment: ' . trim($reason), null, null, $actorId)
            : $this->ledger->wallet($userId, $direction, 'adjustment', $amount, 'Adjustment: ' . trim($reason), null, null, $actorId);
        $this->audit->record($actorId, 'loyalty.adjustment', 'user', $userId, ['kind' => $kind, 'direction' => $direction, 'amount' => $amount, 'reason' => trim($reason)]);
        return ['balanceAfter' => $entry['balanceAfter']];
    }

    /* ------------------------------------------------------ notification centre */

    /** @return array{items: list<array<string, mixed>>, unread: int} */
    public function notifications(int $userId): array
    {
        $rows = $this->db->all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30', [$userId]);
        return [
            'items' => array_map(static fn ($n) => [
                'id' => (int) $n['id'],
                'type' => $n['type'],
                'title' => $n['title'],
                'body' => $n['body'],
                'read' => $n['read_at'] !== null,
                'at' => $n['created_at'],
            ], $rows),
            'unread' => (int) $this->db->scalar('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$userId]),
        ];
    }

    /** @param list<int>|null $ids null marks everything read */
    public function markRead(int $userId, ?array $ids): void
    {
        if ($ids === []) {
            return;
        }
        $sql = 'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL';
        $params = [$this->clock->sql(), $userId];
        if ($ids !== null) {
            $sql .= ' AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
            array_push($params, ...array_map('intval', $ids));
        }
        $this->db->run($sql, $params);
    }
}
