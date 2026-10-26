<?php

declare(strict_types=1);

namespace App\Seeds;

use App\Loyalty\LoyaltyRules;
use App\Security\Crypto;
use App\Security\PasswordPolicy;
use App\Support\Clock;
use App\Support\Database;

/**
 * DEMO / PRESENTATION DATA ONLY: invented members with past orders and Interest Account
 * history, so the dashboard, rewards analytics and the guest's membership card look real.
 *
 * Everything is generated from real menu prices and the same LoyaltyRules the app uses:
 * every cached balance matches its ledger, and each interest credit is exactly what the
 * monthly job would have paid. The demo guest ends at Gold tier, ₦68,500 in the wallet,
 * 2,340 points and 7 of 10 stamps, with four months of ledger history.
 */
final class DemoLoyaltySeeder
{
    private const GUEST_EMAIL = 'guest@smallafrica.demo';
    private const GUEST_WALLET_KOBO = 6850000;
    private const GUEST_POINTS = 2340;
    private const GUEST_ORDERS = 17; // 17 stamps lifetime = 7 on the current card

    /** name, tier, spend target (naira), wallet top-ups (days ago => naira), favourite kitchen */
    private const MEMBERS = [
        ['Funmilayo', 'Adeyemi', 'black_diamond', 1900000, [100 => 100000, 40 => 100000], 'nigerian'],
        ['Tunde', 'Ogunleye', 'black_diamond', 1650000, [110 => 50000], 'continental'],
        ['Katarzyna', 'Wiśniewska', 'gold', 780000, [95 => 50000, 30 => 25000], 'polish'],
        ['Emeka', 'Nwosu', 'gold', 560000, [80 => 100000], 'nigerian'],
        ['Halima', 'Bello', 'gold', 640000, [], 'continental'],
        ['Piotr', 'Nowicki', 'silver', 320000, [70 => 25000], 'polish'],
        ['Ngozi', 'Eze', 'silver', 210000, [60 => 50000], 'nigerian'],
        ['Oluwaseun', 'Bakare', 'silver', 410000, [], 'continental'],
        ['Marta', 'Kowalczyk', 'silver', 175000, [45 => 10000], 'polish'],
        ['Chidi', 'Okonkwo', 'silver', 260000, [100 => 25000, 20 => 25000], 'nigerian'],
        ['Aisha', 'Lawal', 'bronze', 85000, [25 => 10000], 'nigerian'],
        ['David', 'Mensah', 'bronze', 42000, [], 'continental'],
        ['Zainab', 'Yusuf', 'bronze', 120000, [50 => 25000], 'nigerian'],
        ['Jakub', 'Zieliński', 'bronze', 60000, [], 'polish'],
        ['Bisola', 'Coker', 'bronze', 25000, [], 'continental'],
        ['Ifeanyi', 'Obi', 'bronze', 0, [], 'nigerian'],
        ['Agnieszka', 'Mazur', 'silver', 230000, [55 => 25000], 'polish'],
        ['Kunle', 'Afolabi', 'gold', 690000, [90 => 50000], 'nigerian'],
        ['Ewa', 'Krawczyk', 'bronze', 95000, [], 'polish'],
        ['Temitope', 'Alabi', 'silver', 180000, [35 => 10000], 'continental'],
        ['Tomasz', 'Wróbel', 'bronze', 70000, [], 'polish'],
        ['Adaobi', 'Nnaji', 'bronze', 110000, [15 => 25000], 'nigerian'],
        ['Seun', 'Oladipo', 'silver', 300000, [], 'nigerian'],
        ['Magdalena', 'Dąbrowska', 'gold', 520000, [65 => 100000], 'polish'],
        ['Chukwuma', 'Eze', 'bronze', 30000, [], 'nigerian'],
        ['Natalia', 'Jankowska', 'bronze', 55000, [], 'continental'],
        ['Yetunde', 'Fashola', 'silver', 260000, [40 => 25000], 'continental'],
        ['Paweł', 'Szymański', 'bronze', 15000, [], 'polish'],
        ['Hauwa', 'Garba', 'bronze', 0, [], 'nigerian'],
    ];

    private LoyaltyRules $rules;
    private \DateTimeImmutable $now;
    /** @var list<array<string, mixed>> */
    private array $dishes = [];
    /** @var array<string, int> */
    private array $kitchenIds = [];
    /** @var array<int, list<array<string, mixed>>> extra wallet events by user (referrals) */
    private array $extraEvents = [];

    public function __construct(private Database $db)
    {
    }

    public function run(): void
    {
        mt_srand(2026);
        $this->now = new \DateTimeImmutable('now', Clock::zone());
        $this->rules = new LoyaltyRules((array) json_decode((string) $this->db->scalar("SELECT setting_value FROM settings WHERE setting_key = 'loyalty'"), true));
        $this->dishes = $this->db->all(
            "SELECT d.id, d.name, d.price_kobo, d.kitchen_id, d.is_featured, d.contains_pork, k.slug AS kitchen, c.slug AS category
             FROM dishes d JOIN categories c ON c.id = d.category_id LEFT JOIN kitchens k ON k.id = d.kitchen_id
             WHERE c.slug NOT IN ('tasting') AND d.is_alcoholic = 0 AND d.deleted_at IS NULL",
        );
        foreach ($this->db->all('SELECT id, slug FROM kitchens') as $k) {
            $this->kitchenIds[$k['slug']] = (int) $k['id'];
        }

        $this->db->transaction(function (): void {
            $guestId = (int) $this->db->scalar('SELECT id FROM users WHERE email = ?', [self::GUEST_EMAIL]);
            $memberIds = [];
            foreach (self::MEMBERS as $i => $m) {
                $memberIds[] = $this->createMember($m, $i);
            }
            // The guest invited two friends, who both completed a first order.
            foreach ([0 => 110, 1 => 70] as $idx => $daysAgo) {
                $friendId = $memberIds[$idx + 6];
                $this->referral($guestId, $friendId, $this->daysAgo($daysAgo));
            }
            $this->seedGuest($guestId);
            foreach (self::MEMBERS as $i => $m) {
                $this->seedMember($memberIds[$i], $m);
            }
            $this->interestRuns();
        });
    }

    /* ------------------------------------------------------------------ people */

    /** @param array{0: string, 1: string, 2: string, 3: int, 4: array<int, int>, 5: string} $m */
    private function createMember(array $m, int $i): int
    {
        [$first, $last] = $m;
        $email = strtolower(iconv('UTF-8', 'ASCII//TRANSLIT', "{$first}.{$last}") ?: "member{$i}") . '@guests.smallafrica.demo';
        $email = preg_replace('/[^a-z0-9.@]/', '', $email) ?? $email;
        $joined = $this->daysAgo(420 - $i * 3);
        $id = $this->db->insert('users', [
            'role' => 'customer',
            'first_name' => $first,
            'last_name' => $last,
            'email' => $email,
            'phone' => '+23480' . str_pad((string) (31000000 + $i * 7919), 8, '0', STR_PAD_LEFT),
            // Demo members can't sign in: their password is random and never shown.
            'password_hash' => PasswordPolicy::hash(Crypto::token(24)),
            'email_verified_at' => $this->sql($joined),
            'referral_code' => strtoupper(substr(preg_replace('/[^A-Za-z]/', '', iconv('UTF-8', 'ASCII//TRANSLIT', $first) ?: 'MEMBER') ?? 'MEMBER', 0, 6)) . (100 + $i),
            'favourite_kitchen_id' => $this->kitchenIds[$m[5]] ?? null,
            'birthday' => sprintf('%04d-%02d-%02d', 1968 + ($i * 3) % 34, 1 + ($i * 5) % 12, 1 + ($i * 7) % 28),
            'marketing_opt_in' => $i % 3 === 0 ? 0 : 1,
            'created_at' => $this->sql($joined),
        ]);
        $this->db->insert('loyalty_accounts', ['user_id' => $id, 'created_at' => $this->sql($joined)]);
        return $id;
    }

    private function referral(int $referrerId, int $friendId, \DateTimeImmutable $at): void
    {
        $id = $this->db->insert('referrals', [
            'referrer_user_id' => $referrerId, 'referred_user_id' => $friendId, 'status' => 'rewarded',
            'rewarded_at' => $this->sql($at), 'created_at' => $this->sql($at->modify('-6 days')),
        ]);
        $this->db->run('UPDATE users SET referred_by_user_id = ? WHERE id = ?', [$referrerId, $friendId]);
        $credit = $this->rules->referralCreditKobo();
        $name = (string) $this->db->scalar('SELECT first_name FROM users WHERE id = ?', [$friendId]);
        $referrer = (string) $this->db->scalar('SELECT first_name FROM users WHERE id = ?', [$referrerId]);
        $this->extraEvents[$referrerId][] = ['at' => $at, 'kind' => 'wallet', 'dir' => 'credit', 'type' => 'referral_bonus', 'amount' => $credit, 'desc' => "Referral: {$name} joined and dined", 'ref' => "REF-{$id}", 'key' => "referral:{$id}:referrer"];
        $this->extraEvents[$friendId][] = ['at' => $at, 'kind' => 'wallet', 'dir' => 'credit', 'type' => 'referral_bonus', 'amount' => $credit, 'desc' => "Welcome credit from {$referrer}’s invitation", 'ref' => "REF-{$id}", 'key' => "referral:{$id}:friend"];
    }

    /* -------------------------------------------------------------- the guest */

    private function seedGuest(int $userId): void
    {
        $user = $this->db->one('SELECT * FROM users WHERE id = ?', [$userId]);
        $this->db->run('UPDATE users SET created_at = ? WHERE id = ?', [$this->sql($this->daysAgo(400)), $userId]);
        // Window orders (last four months), several paid partly or fully with dining credit.
        $window = [[118, 26000, 0], [104, 31000, 1], [96, 18500, 1], [83, 24000, 0], [71, 22000, 1], [57, 27500, 1], [44, 19500, 0], [33, 29000, 1], [20, 23500, 0], [9, 21000, 1]];
        $orders = [];
        foreach ($window as [$days, $target, $wallet]) {
            $orders[] = ['at' => $this->daysAgo($days, 13 + $days % 7), 'target' => $target * 100, 'wallet' => (bool) $wallet, 'kitchen' => 'nigerian'];
        }
        // Earlier orders build the 12-month spend that makes the guest Gold.
        $older = self::GUEST_ORDERS - count($window) - 1; // the final order is added below
        for ($i = 0; $i < $older; $i++) {
            $orders[] = ['at' => $this->daysAgo(320 - $i * 28, 19), 'target' => 5200000 + ($i % 3) * 600000, 'wallet' => false, 'kitchen' => ['nigerian', 'polish', 'continental'][$i % 3]];
        }
        // Today-ish order this month that lands the wallet exactly on the demo balance.
        $orders[] = ['at' => $this->recent(), 'target' => 2400000, 'wallet' => 'final', 'kitchen' => 'polish'];

        $events = [
            ['at' => $this->daysAgo(120, 10), 'kind' => 'topup', 'amount' => 10000000],
            ['at' => $this->daysAgo(75, 11), 'kind' => 'topup', 'amount' => 5000000],
            ['at' => $this->daysAgo(40, 18), 'kind' => 'topup', 'amount' => 2500000],
            ['at' => $this->daysAgo(52, 12), 'kind' => 'redeem', 'points' => 500, 'credit' => 500000, 'name' => '₦5,000 dining credit'],
            ['at' => $this->daysAgo(27, 15), 'kind' => 'redeem_item', 'points' => 350, 'name' => 'Free Chapman'],
        ];
        // Birthday reward (14 July): dessert voucher and 2× points that week (applied to orders).
        $birthday = $this->birthdayThisYear((string) $user['birthday']);
        if ($birthday !== null && $birthday < $this->now && $birthday > $this->daysAgo(125)) {
            $events[] = ['at' => $birthday->setTime(0, 15), 'kind' => 'birthday'];
        }
        $this->simulate($userId, $orders, $events, self::GUEST_WALLET_KOBO, self::GUEST_POINTS);
    }

    /* ------------------------------------------------------------- other members */

    /** @param array{0: string, 1: string, 2: string, 3: int, 4: array<int, int>, 5: string} $m */
    private function seedMember(int $userId, array $m): void
    {
        [, , , $spendNaira, $topups, $kitchen] = $m;
        $orders = [];
        if ($spendNaira > 0) {
            $count = max(1, min(30, intdiv($spendNaira, 45000)));
            $per = intdiv($spendNaira * 100, $count);
            for ($i = 0; $i < $count; $i++) {
                $days = (int) round(330 * ($count - $i) / ($count + 1)) + mt_rand(0, 6);
                $orders[] = ['at' => $this->daysAgo(max(2, $days), 12 + mt_rand(0, 8)), 'target' => $per, 'wallet' => mt_rand(0, 2) === 0, 'kitchen' => mt_rand(0, 3) > 0 ? $kitchen : null];
            }
        }
        $events = [];
        foreach ($topups as $days => $naira) {
            $events[] = ['at' => $this->daysAgo($days, 10), 'kind' => 'topup', 'amount' => $naira * 100];
        }
        $this->simulate($userId, $orders, $events, null, null);
    }

    /* --------------------------------------------------------------- the engine */

    /**
     * Plays a member's history forward in time: orders, top-ups, redemptions and the monthly
     * interest the job would have paid, writing ledgers, orders and the account cache.
     *
     * @param list<array<string, mixed>> $orders
     * @param list<array<string, mixed>> $events
     */
    private function simulate(int $userId, array $orders, array $events, ?int $finalWallet, ?int $finalPoints): void
    {
        $user = $this->db->one('SELECT * FROM users WHERE id = ?', [$userId]) ?? [];
        $windowStart = $this->daysAgo(122)->setTime(0, 0);
        foreach ($orders as $o) {
            $events[] = ['at' => $o['at'], 'kind' => 'order', 'order' => $o];
        }
        foreach ($this->extraEvents[$userId] ?? [] as $e) {
            $events[] = $e;
        }
        usort($events, static fn ($a, $b) => $a['at'] <=> $b['at']);

        $wallet = 0;
        $points = 0;
        $lowestInMonth = 0;
        $month = null;
        $tier = 'bronze';
        $stamps = 0;
        $lifetime = 0;
        $streak = ['month' => null, 'count' => 0];
        $lastActivity = null;
        $walletRows = [];
        $pointRows = [];
        $openingPoints = 0;

        $walletMove = function (\DateTimeImmutable $at, string $dir, string $type, int $amount, string $desc, ?string $ref, ?string $key) use (&$wallet, &$lowestInMonth, &$walletRows): void {
            $wallet += $dir === 'credit' ? $amount : -$amount;
            $lowestInMonth = min($lowestInMonth, $wallet);
            $walletRows[] = [$at, $dir, $type, $amount, $wallet, $ref, $desc, $key];
        };
        $pointsMove = function (\DateTimeImmutable $at, string $dir, string $type, int $amount, string $desc, ?string $ref, ?string $key) use (&$points, &$pointRows, &$openingPoints, $windowStart): void {
            if ($at < $windowStart) {
                // Before the four-month window, points are summarised in one opening entry.
                $openingPoints += $dir === 'credit' ? $amount : -$amount;
                return;
            }
            $points += $dir === 'credit' ? $amount : -$amount;
            $pointRows[] = [$at, $dir, $type, $amount, $ref, $desc, $key];
        };

        // Month boundaries crossed: pay the interest the cron would have paid on the 1st.
        $closeMonths = function (string $m) use (&$month, &$lowestInMonth, &$wallet, $walletMove, $userId): void {
            while ($month !== null && $month < $m) {
                $start = new \DateTimeImmutable("{$month}-01 00:00:00", Clock::zone());
                $interest = $this->rules->interest($lowestInMonth);
                $lowestInMonth = $wallet;
                if ($interest > 0) {
                    $walletMove($start->modify('+1 month')->setTime(0, 10), 'credit', 'interest', $interest, 'Interest for ' . $start->format('F Y') . ' (dining credit)', $month, "interest:{$month}:{$userId}");
                }
                $month = $start->modify('+1 month')->format('Y-m');
            }
        };

        foreach ($events as $e) {
            $at = $e['at'];
            $m = $at->format('Y-m');
            $closeMonths($m);
            if ($month === null) {
                $month = $m;
                $lowestInMonth = $wallet;
            }

            switch ($e['kind']) {
                case 'topup':
                    $ref = $this->topupRow($userId, $e['amount'], $this->rules->topupBonus($e['amount']), $at);
                    $walletMove($at, 'credit', 'topup', $e['amount'], 'Wallet top-up', $ref, "topup:{$ref}");
                    $bonus = $this->rules->topupBonus($e['amount']);
                    if ($bonus > 0) {
                        $walletMove($at, 'credit', 'topup_bonus', $bonus, 'Top-up bonus (' . rtrim(rtrim(number_format($bonus * 100 / $e['amount'], 1), '0'), '.') . '%)', $ref, "topup-bonus:{$ref}");
                    }
                    $lastActivity = $at;
                    break;
                case 'redeem':
                    $pointsMove($at, 'debit', 'redeem', $e['points'], "Redeemed: {$e['name']}", 'credit-5000', null);
                    $walletMove($at, 'credit', 'reward_redemption', $e['credit'], "{$e['name']} (from points)", 'credit-5000', null);
                    $lastActivity = $at;
                    break;
                case 'redeem_item':
                    $pointsMove($at, 'debit', 'redeem', $e['points'], "Redeemed: {$e['name']}", 'free-chapman', null);
                    $this->voucher($userId, 'points', $e['name'], $at, true, $e['points']);
                    $lastActivity = $at;
                    break;
                case 'birthday':
                    $this->voucher($userId, 'birthday', 'Birthday dessert', $at, true, 0, 'desserts');
                    $this->db->insert('notifications', ['user_id' => $userId, 'type' => 'birthday', 'title' => "Happy birthday, {$user['first_name']}!", 'body' => 'A dessert on us and double points all week.', 'read_at' => $this->sql($at->modify('+3 hours')), 'created_at' => $this->sql($at)]);
                    break;
                case 'wallet':
                    $walletMove($at, $e['dir'], $e['type'], $e['amount'], $e['desc'], $e['ref'], $e['key']);
                    break;
                case 'order':
                    $o = $e['order'];
                    $fulfilment = mt_rand(0, 2) === 0 ? 'pickup' : 'delivery';
                    $fees = 50000 + ($fulfilment === 'delivery' && !in_array($tier, ['gold', 'black_diamond'], true) ? 250000 : 0);
                    $needed = $o['wallet'] === 'final' && $finalWallet !== null ? $wallet - $finalWallet : 0;
                    if ($o['wallet'] === 'final' && $needed <= 0) {
                        throw new \RuntimeException('Demo seed: guest wallet is already below the target before the final order.');
                    }
                    $lines = $this->pickLines(max($o['target'], $needed - $fees), $o['kitchen']);
                    while (array_sum(array_column($lines, 'total')) + $fees < $needed) {
                        $lines = array_merge($lines, $this->pickLines(500000, $o['kitchen']));
                    }
                    $subtotal = array_sum(array_column($lines, 'total'));
                    $grand = $subtotal + $fees;
                    $walletPart = 0;
                    if ($o['wallet'] === 'final') {
                        $walletPart = $needed; // paid partly with dining credit, the rest by card
                    } elseif ($o['wallet'] === true && $wallet > 0) {
                        // Members usually split the bill: part dining credit, the rest by card.
                        $walletPart = min($wallet, (int) round($grand * 0.6 / 100) * 100);
                    }
                    $pointLines = array_map(static fn ($l) => ['amountKobo' => $l['total'], 'featured' => $l['featured']], $lines);
                    $earned = $this->rules->pointsFor($pointLines, (int) $at->format('w'), $tier, LoyaltyRules::inBirthdayWeek($user['birthday'] ?? null, $at));
                    $ref = $this->orderRow($userId, $user, $at, $lines, $subtotal, $fees, $walletPart, $earned, $fulfilment);
                    if ($walletPart > 0) {
                        $walletMove($at, 'debit', 'payment', $walletPart, "Order {$ref}", $ref, "order-wallet:{$ref}");
                    }
                    $done = $at->modify('+70 minutes');
                    $pointsMove($done, 'credit', 'earn', $earned, "Points for {$ref}", $ref, "earn:{$ref}");
                    $stamp = $this->rules->addStamp($stamps);
                    $stamps = $stamp['stamps'];
                    $lifetime++;
                    if ($stamp['reward'] !== null) {
                        $this->voucher($userId, 'stamp_card', $stamp['reward']['reward'], $done, $done < $this->daysAgo(30), 0, $stamp['reward']['category'] ?? null);
                    }
                    $streak = $streak['month'] === $at->format('Y-m') ? ['month' => $streak['month'], 'count' => $streak['count'] + 1] : ['month' => $at->format('Y-m'), 'count' => 1];
                    if ($this->rules->streakReached($streak['count'])) {
                        $bonus = (int) ($this->rules->settings()['streak_bonus_points'] ?? 200);
                        $pointsMove($done, 'credit', 'streak', $bonus, "Monthly streak bonus: {$streak['count']} visits in " . $at->format('F'), $streak['month'], "streak:{$userId}:{$streak['month']}");
                    }
                    $spend = (int) $this->db->scalar(
                        "SELECT COALESCE(SUM(subtotal_kobo - discount_kobo - voucher_discount_kobo), 0) FROM orders WHERE user_id = ? AND placed_at >= ? AND placed_at <= ?",
                        [$userId, $this->sql($at->modify('-12 months')), $this->sql($at)],
                    );
                    $earnedTier = $this->rules->tierFor($spend);
                    if ($this->rules->tierRank($earnedTier) > $this->rules->tierRank($tier)) {
                        $tier = $earnedTier;
                    }
                    $lastActivity = $done;
                    break;
            }
        }

        $closeMonths($this->now->format('Y-m'));

        // Points: one opening entry for everything before the window, tuned for the guest.
        usort($pointRows, static fn ($a, $b) => $a[0] <=> $b[0]);
        $lowestPrefix = static function (array $rows): int {
            $run = 0;
            $min = 0;
            foreach ($rows as $r) {
                $run += $r[1] === 'credit' ? $r[3] : -$r[3];
                $min = min($min, $run);
            }
            return $min;
        };
        // Other members already spent most of their earlier points on rewards.
        $opening = $finalPoints !== null ? $finalPoints - $points : max(0, intdiv($openingPoints, 3));
        // The opening balance must cover the lowest point of the history. For the guest, any
        // excess is spent on a dessert reward late in the window, keeping the final target.
        while ($finalPoints !== null && $opening + $lowestPrefix($pointRows) < 0) {
            $at = $this->now->modify('-6 days')->setTime(20, 0);
            $pointRows[] = [$at, 'debit', 'redeem', 700, 'free-dessert', 'Redeemed: Free dessert of your choice', null];
            usort($pointRows, static fn ($a, $b) => $a[0] <=> $b[0]);
            $this->voucher($userId, 'points', 'Free dessert of your choice', $at, true, 700, 'desserts');
            $opening += 700;
        }
        $running = 0;
        if ($opening > 0) {
            $running = $opening;
            $this->db->insert('points_ledger', [
                'user_id' => $userId, 'entry_type' => 'bonus', 'direction' => 'credit', 'points' => $opening, 'balance_after' => $running,
                'description' => 'Points carried forward from earlier visits', 'created_at' => $this->sql($windowStart->modify('-1 day')),
            ]);
        }
        usort($pointRows, static fn ($a, $b) => $a[0] <=> $b[0]);
        foreach ($pointRows as [$at, $dir, $type, $amount, $ref, $desc, $key]) {
            if ($amount <= 0) {
                continue;
            }
            $running += $dir === 'credit' ? $amount : -$amount;
            if ($running < 0) {
                throw new \RuntimeException("Demo seed: points for user {$userId} would go negative.");
            }
            $this->db->insert('points_ledger', [
                'user_id' => $userId, 'entry_type' => $type, 'direction' => $dir, 'points' => $amount, 'balance_after' => $running,
                'reference' => $ref, 'description' => $desc, 'idempotency_key' => $key, 'created_at' => $this->sql($at),
            ]);
        }
        usort($walletRows, static fn ($a, $b) => $a[0] <=> $b[0]);
        $balance = 0;
        foreach ($walletRows as [$at, $dir, $type, $amount, , $ref, $desc, $key]) {
            $balance += $dir === 'credit' ? $amount : -$amount;
            $this->db->insert('wallet_ledger', [
                'user_id' => $userId, 'entry_type' => $type, 'direction' => $dir, 'amount_kobo' => $amount, 'balance_after_kobo' => $balance,
                'reference' => $ref, 'description' => $desc, 'idempotency_key' => $key, 'created_at' => $this->sql($at),
            ]);
        }
        if ($finalWallet !== null && $balance !== $finalWallet) {
            throw new \RuntimeException("Demo seed: guest wallet is {$balance}, expected {$finalWallet}.");
        }

        $spend = (int) $this->db->scalar(
            "SELECT COALESCE(SUM(subtotal_kobo - discount_kobo - voucher_discount_kobo), 0) FROM orders WHERE user_id = ? AND placed_at >= ?",
            [$userId, $this->sql($this->now->modify('-12 months'))],
        );
        $thisMonth = $this->now->format('Y-m');
        $this->db->run(
            'UPDATE loyalty_accounts SET tier = ?, spend_12m_kobo = ?, tier_updated_at = ?, wallet_balance_kobo = ?, points_balance = ?, stamps = ?,
             lifetime_stamps = ?, streak_month = ?, streak_count = ?, last_activity_at = ? WHERE user_id = ?',
            [
                $this->rules->tierFor($spend), $spend, $this->sql($this->now), $balance, $running, $stamps, $lifetime,
                $streak['month'], $streak['month'] === $thisMonth ? $streak['count'] : 0, $lastActivity ? $this->sql($lastActivity) : null, $userId,
            ],
        );
    }

    /* ------------------------------------------------------------------ rows */

    /** @return list<array{dish: array<string, mixed>, qty: int, total: int, featured: bool}> */
    private function pickLines(int $targetKobo, ?string $kitchen): array
    {
        $pool = $kitchen ? array_values(array_filter($this->dishes, static fn ($d) => $d['kitchen'] === $kitchen || $d['kitchen'] === null)) : $this->dishes;
        $pool = $pool ?: $this->dishes;
        $lines = [];
        $sum = 0;
        while ($sum < $targetKobo * 0.9 && count($lines) < 8) {
            $dish = $pool[mt_rand(0, count($pool) - 1)];
            $qty = (int) $dish['price_kobo'] < 600000 && mt_rand(0, 1) ? 2 : 1;
            $total = (int) $dish['price_kobo'] * $qty;
            $lines[] = ['dish' => $dish, 'qty' => $qty, 'total' => $total, 'featured' => (bool) $dish['is_featured']];
            $sum += $total;
        }
        return $lines;
    }

    /** @param list<array{dish: array<string, mixed>, qty: int, total: int, featured: bool}> $lines */
    private function orderRow(int $userId, array $user, \DateTimeImmutable $at, array $lines, int $subtotal, int $fees, int $walletPart, int $points, string $fulfilment): string
    {
        do {
            $ref = Crypto::code(6, 'SA-');
        } while ($this->db->scalar('SELECT 1 FROM orders WHERE reference = ?', [$ref]));
        $done = $at->modify('+70 minutes');
        $status = $fulfilment === 'delivery' ? 'delivered' : 'completed';
        $zone = $fulfilment === 'delivery' ? $this->db->one('SELECT id, name FROM delivery_zones ORDER BY RAND() LIMIT 1') : null;
        $orderId = $this->db->insert('orders', [
            'reference' => $ref,
            'user_id' => $userId,
            'customer_name' => "{$user['first_name']} {$user['last_name']}",
            'customer_email' => $user['email'],
            'customer_phone' => $user['phone'] ?? '+2348030000000',
            'fulfilment' => $fulfilment,
            'delivery_zone_id' => $zone['id'] ?? null,
            'address_snapshot' => $zone ? json_encode(['line1' => 'Demo address', 'area' => $zone['name']]) : null,
            'status' => $status,
            'payment_status' => 'paid',
            'subtotal_kobo' => $subtotal,
            'delivery_fee_kobo' => $fees,
            'vat_included_kobo' => intdiv($subtotal * 750, 10750),
            'wallet_applied_kobo' => $walletPart,
            'total_kobo' => $subtotal + $fees - $walletPart,
            'points_earned' => $points,
            'loyalty_processed_at' => $this->sql($done),
            'placed_at' => $this->sql($at),
            'status_updated_at' => $this->sql($done),
            'created_at' => $this->sql($at),
        ]);
        foreach ($lines as $l) {
            $this->db->insert('order_items', [
                'order_id' => $orderId, 'dish_id' => $l['dish']['id'], 'dish_name' => $l['dish']['name'], 'kitchen_id' => $l['dish']['kitchen_id'],
                'unit_price_kobo' => $l['dish']['price_kobo'], 'quantity' => $l['qty'], 'line_total_kobo' => $l['total'],
                'options' => json_encode(['portion' => null, 'addons' => [], 'containsPork' => (bool) $l['dish']['contains_pork']]),
            ]);
        }
        foreach (['pending_payment' => 0, 'received' => 1, 'preparing' => 8, 'ready' => 35, $status => 70] as $s => $min) {
            $this->db->insert('order_status_history', ['order_id' => $orderId, 'status' => $s, 'created_at' => $this->sql($at->modify("+{$min} minutes"))]);
        }
        $card = $subtotal + $fees - $walletPart;
        if ($card > 0) {
            $this->db->insert('payments', [
                'user_id' => $userId, 'purpose' => 'order', 'payable_id' => $orderId, 'provider' => 'simulated', 'reference' => $ref,
                'amount_kobo' => $card, 'status' => 'success', 'verified_at' => $this->sql($at), 'created_at' => $this->sql($at),
            ]);
        }
        return $ref;
    }

    private function topupRow(int $userId, int $amount, int $bonus, \DateTimeImmutable $at): string
    {
        do {
            $ref = Crypto::code(6, 'TU-');
        } while ($this->db->scalar('SELECT 1 FROM wallet_topups WHERE reference = ?', [$ref]));
        $id = $this->db->insert('wallet_topups', [
            'reference' => $ref, 'user_id' => $userId, 'amount_kobo' => $amount, 'bonus_kobo' => $bonus, 'status' => 'paid',
            'paid_at' => $this->sql($at), 'created_at' => $this->sql($at),
        ]);
        $this->db->insert('payments', [
            'user_id' => $userId, 'purpose' => 'wallet_topup', 'payable_id' => $id, 'provider' => 'simulated', 'reference' => $ref,
            'amount_kobo' => $amount, 'status' => 'success', 'verified_at' => $this->sql($at), 'created_at' => $this->sql($at),
        ]);
        return $ref;
    }

    private function voucher(int $userId, string $source, string $title, \DateTimeImmutable $at, bool $used, int $points = 0, ?string $category = null): void
    {
        $expires = $at->modify('+90 days');
        $this->db->insert('reward_vouchers', [
            'user_id' => $userId, 'source' => $source, 'title' => $title, 'category_slug' => $category,
            'code' => Crypto::code(6, 'RW-'), 'points_spent' => $points,
            'status' => $used ? 'used' : ($expires < $this->now ? 'expired' : 'issued'),
            'expires_at' => $this->sql($expires), 'created_at' => $this->sql($at),
        ]);
    }

    /** One completed interest run per month that has interest credits. */
    private function interestRuns(): void
    {
        foreach ($this->db->all("SELECT reference, COUNT(*) AS n, SUM(amount_kobo) AS total, MIN(created_at) AS at FROM wallet_ledger WHERE entry_type = 'interest' GROUP BY reference") as $r) {
            $this->db->insert('interest_runs', [
                'period' => $r['reference'], 'status' => 'completed', 'accounts_credited' => (int) $r['n'], 'total_kobo' => (int) $r['total'],
                'triggered_by' => 'cron', 'started_at' => $r['at'], 'finished_at' => $r['at'],
            ]);
        }
    }

    /* ----------------------------------------------------------------- time */

    private function daysAgo(int $days, int $hour = 12): \DateTimeImmutable
    {
        return $this->now->modify("-{$days} days")->setTime($hour, 30);
    }

    /** A moment earlier this month (or earlier today on the 1st), always in the past. */
    private function recent(): \DateTimeImmutable
    {
        $day = (int) $this->now->format('j');
        $at = $day > 2 ? $this->now->modify('-2 days')->setTime(13, 15) : $this->now->modify('-3 hours');
        return $at < $this->now ? $at : $this->now->modify('-1 hour');
    }

    private function birthdayThisYear(string $birthday): ?\DateTimeImmutable
    {
        if (!preg_match('/^\d{4}-(\d{2})-(\d{2})$/', $birthday, $m)) {
            return null;
        }
        $d = new \DateTimeImmutable($this->now->format('Y') . "-{$m[1]}-{$m[2]} 00:00:00", Clock::zone());
        return $d > $this->now ? $d->modify('-1 year') : $d;
    }

    private function sql(\DateTimeImmutable $at): string
    {
        return $at->format('Y-m-d H:i:s');
    }
}
