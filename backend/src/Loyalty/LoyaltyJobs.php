<?php

declare(strict_types=1);

namespace App\Loyalty;

use App\Security\Crypto;
use App\Services\OrderService;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Logger;

/**
 * The daily scheduled run (bin/loyalty.php daily). Every step is idempotent, so running it
 * twice in a day, or catching up after a missed day, never double-rewards anyone.
 */
final class LoyaltyJobs
{
    public function __construct(
        private Database $db,
        private LoyaltyService $loyalty,
        private InterestService $interest,
        private OrderService $orders,
        private Ledger $ledger,
        private Notifier $notifier,
        private Clock $clock,
        private Logger $logger,
        private string $frontendUrl,
    ) {
    }

    /** @return array<string, mixed> what each step did */
    public function daily(): array
    {
        $report = [];
        $steps = [
            'expiredUnpaidOrders' => fn () => $this->orders->expireUnpaid(),
            'catchUpCompletedOrders' => fn () => $this->catchUpCompletedOrders(),
            'interest' => fn () => $this->monthlyInterest(),
            'tierReview' => fn () => $this->clock->now()->format('j') === '1' ? $this->tierReview() : 'not the 1st',
            'pointsExpiry' => fn () => $this->pointsExpiry(),
            'birthdays' => fn () => $this->birthdays(),
            'anniversaries' => fn () => $this->anniversaries(),
            'referrals' => fn () => $this->pendingReferrals(),
            'welcomeBonuses' => fn () => $this->pendingWelcomeBonuses(),
            'winBack' => fn () => $this->winBack(),
            'kitchenOffers' => fn () => $this->kitchenOffers(),
        ];
        foreach ($steps as $name => $step) {
            try {
                $report[$name] = $step();
            } catch (\Throwable $e) {
                // One failing step must not stop the others; it is retried tomorrow.
                $this->logger->error('Loyalty job step failed', ['step' => $name, 'error' => $e->getMessage()]);
                $report[$name] = 'error: ' . $e->getMessage();
            }
        }
        return $report;
    }

    /** On the 1st, pay last month's interest. Already-paid months are skipped. */
    public function monthlyInterest(): mixed
    {
        $period = $this->interest->previousPeriod();
        $done = $this->db->scalar("SELECT 1 FROM interest_runs WHERE period = ? AND status = 'completed'", [$period]);
        if ($done) {
            return "{$period} already paid";
        }
        return $this->interest->run($period, 'cron');
    }

    /** Completed orders whose points weren't processed (e.g. an error at the time). */
    public function catchUpCompletedOrders(): int
    {
        $rows = $this->db->all(
            "SELECT id FROM orders WHERE user_id IS NOT NULL AND payment_status = 'paid' AND status IN ('delivered','completed')
             AND loyalty_processed_at IS NULL ORDER BY id LIMIT 500",
        );
        foreach ($rows as $r) {
            $this->loyalty->onOrderCompleted((int) $r['id']);
        }
        return count($rows);
    }

    /** Monthly review: tiers follow the last 12 months of spend, so they can also go down. */
    public function tierReview(): int
    {
        $changed = 0;
        foreach ($this->db->all("SELECT a.user_id FROM loyalty_accounts a JOIN users u ON u.id = a.user_id WHERE u.role = 'customer'") as $r) {
            $changed += $this->loyalty->recalculateTier((int) $r['user_id'], true) !== null ? 1 : 0;
        }
        return $changed;
    }

    /** @return array{warned: int, expired: int} */
    public function pointsExpiry(): array
    {
        $rules = $this->loyalty->rules();
        $now = $this->clock->now();
        $warned = 0;
        $expired = 0;
        foreach ($this->db->all('SELECT user_id, points_balance, last_activity_at, points_expiry_warned_at FROM loyalty_accounts WHERE points_balance > 0 AND last_activity_at IS NOT NULL') as $a) {
            $state = $rules->expiryState(new \DateTimeImmutable($a['last_activity_at'], Clock::zone()), $now);
            $userId = (int) $a['user_id'];
            if ($state === 'expire') {
                $points = (int) $a['points_balance'];
                $entry = $this->ledger->points($userId, 'debit', 'expire', $points, 'Points expired after 12 months without activity', null, "expire:{$userId}:{$a['last_activity_at']}");
                if (!$entry['replayed']) {
                    $expired++;
                    $this->notifier->notify($userId, 'points_expired', 'Your points have expired', "{$points} points expired after 12 months without a visit or order. We’d love to see you again.");
                }
            } elseif ($state === 'warn' && $a['points_expiry_warned_at'] === null) {
                $months = (int) ($rules->settings()['points_expiry_months'] ?? 12);
                $date = (new \DateTimeImmutable($a['last_activity_at'], Clock::zone()))->modify("+{$months} months")->format('j F Y');
                $this->db->run('UPDATE loyalty_accounts SET points_expiry_warned_at = ? WHERE user_id = ?', [$this->clock->sql(), $userId]);
                $this->notifier->notify($userId, 'points_expiring', 'Your points expire soon', "Your {$a['points_balance']} points expire on {$date}. Any order or visit keeps them alive.", [], [
                    'subject' => 'Your Small Africa points expire soon',
                    'heading' => "{$a['points_balance']} points expire on {$date}",
                    'body' => 'Any order or visit before then keeps every point alive. You can also swap them for dining credit or a treat from the Rewards Menu.',
                    'cta' => 'See my rewards',
                ]);
                $warned++;
            }
        }
        return ['warned' => $warned, 'expired' => $expired];
    }

    /** Birthday: a free dessert voucher (and 2× points all week, applied when earning). */
    public function birthdays(): int
    {
        $now = $this->clock->now();
        $year = (int) $now->format('Y');
        $count = 0;
        $md = $now->format('m-d');
        $leapFallback = $md === '02-28' && !checkdate(2, 29, $year);
        $rows = $this->db->all(
            "SELECT u.id, u.first_name FROM users u JOIN loyalty_accounts a ON a.user_id = u.id
             WHERE u.role = 'customer' AND u.is_active = 1 AND u.birthday IS NOT NULL
             AND (DATE_FORMAT(u.birthday, '%m-%d') = ? OR (? AND DATE_FORMAT(u.birthday, '%m-%d') = '02-29'))
             AND (a.birthday_rewarded_year IS NULL OR a.birthday_rewarded_year < ?)",
            [$md, $leapFallback ? 1 : 0, $year],
        );
        foreach ($rows as $u) {
            $userId = (int) $u['id'];
            $voucher = $this->db->transaction(function () use ($userId, $year): ?array {
                $a = $this->ledger->lockAccount($userId);
                if ((int) $a['birthday_rewarded_year'] >= $year) {
                    return null;
                }
                $this->db->run('UPDATE loyalty_accounts SET birthday_rewarded_year = ? WHERE user_id = ?', [$year, $userId]);
                return $this->loyalty->issueVoucher($userId, 'birthday', 'Birthday dessert', null, null, 'desserts', false, 14);
            });
            if ($voucher) {
                $count++;
                $this->notifier->notify($userId, 'birthday', "Happy birthday, {$u['first_name']}!", "A dessert on us (code {$voucher['code']}) and double points all week.", ['code' => $voucher['code']], [
                    'subject' => "Happy birthday from Small Africa, {$u['first_name']}",
                    'heading' => "Happy birthday, {$u['first_name']}",
                    'body' => "Celebrate with a dessert on us: use code {$voucher['code']} within 14 days. You also earn double points on everything this week.",
                    'cta' => 'Order or book a table',
                    'path' => '/menu',
                ]);
            }
        }
        return $count;
    }

    /** Anniversary of joining: bonus points. */
    public function anniversaries(): int
    {
        $now = $this->clock->now();
        $year = (int) $now->format('Y');
        $bonus = (int) ($this->loyalty->rules()->settings()['anniversary_points'] ?? 250);
        $count = 0;
        $rows = $this->db->all(
            "SELECT u.id, u.first_name, YEAR(u.created_at) AS joined FROM users u JOIN loyalty_accounts a ON a.user_id = u.id
             WHERE u.role = 'customer' AND u.is_active = 1 AND DATE_FORMAT(u.created_at, '%m-%d') = ? AND YEAR(u.created_at) < ?
             AND (a.anniversary_rewarded_year IS NULL OR a.anniversary_rewarded_year < ?)",
            [$now->format('m-d'), $year, $year],
        );
        foreach ($rows as $u) {
            $userId = (int) $u['id'];
            $entry = $this->ledger->points($userId, 'credit', 'bonus', $bonus, 'Anniversary bonus: thank you for ' . ($year - (int) $u['joined']) . ' year(s) with us', (string) $year, "anniversary:{$userId}:{$year}");
            $this->db->run('UPDATE loyalty_accounts SET anniversary_rewarded_year = ? WHERE user_id = ?', [$year, $userId]);
            if (!$entry['replayed']) {
                $count++;
                $this->notifier->notify($userId, 'anniversary', "Happy anniversary, {$u['first_name']}", "{$bonus} bonus points to celebrate another year at our table.");
            }
        }
        return $count;
    }

    /** Welcome bonuses that were waiting for the customer to verify their email. Returns how many are still waiting. */
    public function pendingWelcomeBonuses(): int
    {
        foreach ($this->db->all("SELECT user_id FROM loyalty_accounts WHERE welcome_bonus_status = 'pending'") as $row) {
            $this->loyalty->maybeAwardWelcomeBonus((int) $row['user_id']);
        }
        return (int) $this->db->scalar("SELECT COUNT(*) FROM loyalty_accounts WHERE welcome_bonus_status = 'pending'");
    }

    public function pendingReferrals(): int
    {
        $rows = $this->db->all("SELECT referred_user_id FROM referrals WHERE status = 'pending'");
        foreach ($rows as $r) {
            $this->loyalty->maybeRewardReferral((int) $r['referred_user_id']);
        }
        return (int) $this->db->scalar("SELECT COUNT(*) FROM referrals WHERE status = 'rewarded' AND rewarded_at >= ?", [$this->clock->sql($this->clock->now()->setTime(0, 0))]);
    }

    /**
     * "We miss you": members with no order or visit for N days get a personal single-use
     * coupon (once per lapse). Email only for members who opted in to marketing.
     */
    public function winBack(): int
    {
        $s = $this->loyalty->rules()->settings();
        $days = (int) ($s['winback_after_days'] ?? 30);
        $percent = (int) ($s['winback_offer_percent'] ?? 15);
        $cutoff = $this->clock->sql($this->clock->now()->modify("-{$days} days"));
        $rows = $this->db->all(
            "SELECT u.id, u.first_name, u.marketing_opt_in FROM users u JOIN loyalty_accounts a ON a.user_id = u.id
             WHERE u.role = 'customer' AND u.is_active = 1 AND a.last_activity_at IS NOT NULL AND a.last_activity_at < ?
             AND (a.winback_sent_at IS NULL OR a.winback_sent_at < a.last_activity_at) LIMIT 500",
            [$cutoff],
        );
        foreach ($rows as $u) {
            $userId = (int) $u['id'];
            $expires = $this->clock->now()->modify('+14 days');
            do {
                $code = Crypto::code(6, 'MISS-');
            } while ($this->db->scalar('SELECT 1 FROM coupons WHERE code = ?', [$code]));
            $this->db->transaction(function () use ($userId, $code, $percent, $expires, $u): void {
                $couponId = $this->db->insert('coupons', [
                    'code' => $code, 'description' => "{$percent}% off your next order (welcome back, {$u['first_name']})",
                    'discount_type' => 'percent', 'discount_value' => $percent, 'max_discount_kobo' => 1000000,
                    'usage_limit' => 1, 'per_user_limit' => 1, 'ends_at' => $this->clock->sql($expires),
                ]);
                $this->db->insert('customer_offers', [
                    'user_id' => $userId, 'kind' => 'winback', 'coupon_id' => $couponId,
                    'headline' => "We miss you, {$u['first_name']}",
                    'message' => "It’s been a while! Here’s {$percent}% off your next order with code {$code}, valid until " . $expires->format('j M') . '.',
                    'whatsapp_text' => "Hi {$u['first_name']}, it’s Small Africa! We’ve missed you at the table. Enjoy {$percent}% off your next order with code {$code} (valid until " . $expires->format('j M') . "): {$this->frontendUrl}/menu",
                    'sent_at' => $this->clock->sql(), 'expires_at' => $this->clock->sql($expires), 'created_at' => $this->clock->sql(),
                ]);
                $this->db->run('UPDATE loyalty_accounts SET winback_sent_at = ? WHERE user_id = ?', [$this->clock->sql(), $userId]);
            });
            $email = $u['marketing_opt_in'] ? [
                'subject' => "We miss you, {$u['first_name']} — {$percent}% off at Small Africa",
                'heading' => "We miss you, {$u['first_name']}",
                'body' => "It’s been a while since your last visit. Come back to the table with {$percent}% off your next order: use code {$code} by " . $expires->format('j F') . '.',
                'cta' => 'See the menu',
                'path' => '/menu',
                'footnote' => 'You’re receiving this because you opted in to offers. Change this any time in your account settings.',
            ] : null;
            $this->notifier->notify($userId, 'offer', "We miss you: {$percent}% off", "Use code {$code} on your next order.", ['code' => $code], $email);
        }
        return count($rows);
    }

    /**
     * Once a month, members with a clear favourite kitchen get that kitchen's offer
     * (e.g. Polish lovers get Pierogi Friday). In-app only.
     */
    public function kitchenOffers(): int
    {
        $month = $this->clock->now()->format('Y-m');
        $offers = [
            'polish' => ['PIEROGI15', 'Pierogi Friday is calling', 'You love our Polish kitchen: enjoy 15% off Polish dishes with code PIEROGI15.'],
            'nigerian' => ['JOLLOFFRIDAY', 'Jollof Friday, just for you', 'Our Nigerian kitchen is your favourite: 20% off Nigerian dishes every Friday with code JOLLOFFRIDAY.'],
            'continental' => ['CONTINENTAL10', 'A little Continental indulgence', 'For our Continental regulars: 10% off Continental dishes with code CONTINENTAL10.'],
        ];
        $rows = $this->db->all(
            "SELECT o.user_id, k.slug, SUM(oi.quantity) AS qty FROM orders o
             JOIN order_items oi ON oi.order_id = o.id JOIN kitchens k ON k.id = oi.kitchen_id
             JOIN loyalty_accounts a ON a.user_id = o.user_id
             WHERE o.user_id IS NOT NULL AND o.payment_status = 'paid' AND o.placed_at >= ?
             AND (a.affinity_offer_month IS NULL OR a.affinity_offer_month < ?)
             GROUP BY o.user_id, k.slug",
            [$this->clock->sql($this->clock->now()->modify('-6 months')), $month],
        );
        $byUser = [];
        foreach ($rows as $r) {
            $byUser[(int) $r['user_id']][$r['slug']] = (int) $r['qty'];
        }
        $sent = 0;
        foreach ($byUser as $userId => $kitchens) {
            arsort($kitchens);
            $top = array_key_first($kitchens);
            $total = array_sum($kitchens);
            // A clear favourite: at least 3 items and 60% of everything ordered.
            if ($total < 3 || $kitchens[$top] / $total < 0.6 || !isset($offers[$top])) {
                continue;
            }
            [$code, $headline, $message] = $offers[$top];
            $couponId = $this->db->scalar('SELECT id FROM coupons WHERE code = ? AND is_active = 1', [$code]);
            if (!$couponId) {
                continue;
            }
            $this->db->insert('customer_offers', [
                'user_id' => $userId, 'kind' => 'kitchen_affinity', 'coupon_id' => $couponId, 'headline' => $headline, 'message' => $message,
                'sent_at' => $this->clock->sql(), 'expires_at' => $this->clock->sql($this->clock->now()->modify('+30 days')), 'created_at' => $this->clock->sql(),
            ]);
            $this->db->run('UPDATE loyalty_accounts SET affinity_offer_month = ? WHERE user_id = ?', [$month, $userId]);
            $this->notifier->notify($userId, 'offer', $headline, $message, ['code' => $code]);
            $sent++;
        }
        return $sent;
    }
}
