<?php

declare(strict_types=1);

namespace App\Loyalty;

/**
 * Pure Interest Account arithmetic: no database, no clock. Every amount is an integer
 * (kobo or points) and every division rounds down, so the restaurant never over-credits.
 * Settings come from the `loyalty` settings group (admin-configurable).
 */
final class LoyaltyRules
{
    /** @param array<string, mixed> $settings */
    public function __construct(private array $settings)
    {
    }

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return $this->settings;
    }

    /**
     * Monthly interest, paid as dining credit on the lowest balance held through the month.
     * Nothing is paid if that balance ever dipped below the minimum.
     */
    public function interest(int $lowestBalanceKobo): int
    {
        $min = (int) ($this->settings['interest_min_balance_naira'] ?? 20000) * 100;
        if ($lowestBalanceKobo < $min || $lowestBalanceKobo <= 0) {
            return 0;
        }
        $rateBp = (int) ($this->settings['interest_rate_bp'] ?? 200);
        $cap = (int) ($this->settings['interest_cap_naira'] ?? 5000) * 100;
        $kobo = intdiv($lowestBalanceKobo * $rateBp, 10000);
        return min($cap, $kobo - $kobo % 100); // whole naira, rounded down
    }

    /** Bonus dining credit for a top-up: the highest band the amount reaches. */
    public function topupBonus(int $amountKobo): int
    {
        $bands = (array) ($this->settings['topup_bonus_tiers'] ?? []);
        usort($bands, static fn ($a, $b) => $b['min_naira'] <=> $a['min_naira']);
        foreach ($bands as $band) {
            if ($amountKobo >= (int) $band['min_naira'] * 100) {
                return intdiv($amountKobo * (int) $band['bonus_bp'], 10000);
            }
        }
        return 0;
    }

    /** @return array{min: int, max: int} kobo */
    public function topupLimits(): array
    {
        return [
            'min' => (int) ($this->settings['topup_min_naira'] ?? 5000) * 100,
            'max' => (int) ($this->settings['topup_max_naira'] ?? 1000000) * 100,
        ];
    }

    /** @return list<array{key: string, name: string, min_spend_naira: int, multiplier: float, perks: list<string>}> lowest first */
    public function tiers(): array
    {
        $tiers = (array) ($this->settings['tiers'] ?? []);
        usort($tiers, static fn ($a, $b) => $a['min_spend_naira'] <=> $b['min_spend_naira']);
        return $tiers;
    }

    /** The tier earned by 12-month spend. */
    public function tierFor(int $spendKobo): string
    {
        $key = 'bronze';
        foreach ($this->tiers() as $t) {
            if ($spendKobo >= (int) $t['min_spend_naira'] * 100) {
                $key = $t['key'];
            }
        }
        return $key;
    }

    /** @return array{key: string, name: string, remainingKobo: int, progress: float}|null null at the top tier */
    public function nextTier(int $spendKobo): ?array
    {
        $tiers = $this->tiers();
        $current = $this->tierFor($spendKobo);
        $index = (int) array_search($current, array_column($tiers, 'key'), true);
        $next = $tiers[$index + 1] ?? null;
        if ($next === null) {
            return null;
        }
        $from = (int) $tiers[$index]['min_spend_naira'] * 100;
        $to = (int) $next['min_spend_naira'] * 100;
        return [
            'key' => $next['key'],
            'name' => $next['name'],
            'remainingKobo' => max(0, $to - $spendKobo),
            'progress' => $to > $from ? round(min(1, max(0, ($spendKobo - $from) / ($to - $from))), 4) : 1.0,
        ];
    }

    public function tierMultiplier(string $tier): float
    {
        foreach ($this->tiers() as $t) {
            if ($t['key'] === $tier) {
                return (float) $t['multiplier'];
            }
        }
        return 1.0;
    }

    public function tierRank(string $tier): int
    {
        return (int) array_search($tier, array_column($this->tiers(), 'key'), true);
    }

    /**
     * Points for an order. Base: N points per ₦1,000 of food spend (after discounts, before
     * fees). Featured dishes and quiet days double; the tier and birthday week multiply.
     *
     * @param list<array{amountKobo: int, featured: bool}> $lines food spend per line, after discounts
     */
    public function pointsFor(array $lines, int $weekday, string $tier, bool $birthdayWeek): int
    {
        $per1000 = (int) ($this->settings['earn_points_per_1000_naira'] ?? 5);
        $featuredMult = (int) ($this->settings['featured_dish_points_multiplier'] ?? 2);
        // Work in "point-kobo" to avoid rounding each line separately.
        $base = 0;
        foreach ($lines as $l) {
            $base += max(0, $l['amountKobo']) * ($l['featured'] ? $featuredMult : 1);
        }
        $points = intdiv($base * $per1000, 100000);
        $multiplier = $this->tierMultiplier($tier);
        if (in_array($weekday, array_map('intval', (array) ($this->settings['double_points_weekdays'] ?? [])), true)) {
            $multiplier *= 2;
        }
        if ($birthdayWeek) {
            $multiplier *= (float) ($this->settings['birthday_points_multiplier'] ?? 2);
        }
        return (int) floor($points * $multiplier + 1e-9);
    }

    /** Dining credit for points when converting (100 points = ₦1,000 by default). */
    public function pointsToCreditKobo(int $points): int
    {
        $per1000 = max(1, (int) ($this->settings['redeem_points_per_1000_naira'] ?? 100));
        return intdiv($points * 100000, $per1000);
    }

    /**
     * Stamp card: one stamp per completed visit or order, 10 per card.
     *
     * @return array{stamps: int, reward: array{stamp: int, reward: string, category?: string}|null} stamps on the card after this visit (0 = card completed)
     */
    public function addStamp(int $currentStamps): array
    {
        $next = $currentStamps + 1;
        $reward = null;
        foreach ((array) ($this->settings['stamp_rewards'] ?? []) as $r) {
            if ((int) $r['stamp'] === $next) {
                $reward = $r;
            }
        }
        return ['stamps' => $next >= 10 ? 0 : $next, 'reward' => $reward];
    }

    /** True when this visit is the one that reaches the monthly streak target. */
    public function streakReached(int $visitsThisMonthIncludingThis): bool
    {
        return $visitsThisMonthIncludingThis === (int) ($this->settings['streak_visits_per_month'] ?? 3);
    }

    /**
     * Points expire after N months without any activity.
     *
     * @return 'active'|'warn'|'expire'
     */
    public function expiryState(?\DateTimeImmutable $lastActivity, \DateTimeImmutable $now): string
    {
        if ($lastActivity === null) {
            return 'active';
        }
        $months = (int) ($this->settings['points_expiry_months'] ?? 12);
        $warnDays = (int) ($this->settings['points_expiry_warning_days'] ?? 30);
        $expiresAt = $lastActivity->modify("+{$months} months");
        if ($now >= $expiresAt) {
            return 'expire';
        }
        return $now >= $expiresAt->modify("-{$warnDays} days") ? 'warn' : 'active';
    }

    /** Whether `$date` falls in the 7 days starting on the guest's birthday. */
    public static function inBirthdayWeek(?string $birthday, \DateTimeImmutable $date): bool
    {
        if (!$birthday || !preg_match('/^\d{4}-(\d{2})-(\d{2})$/', $birthday, $m)) {
            return false;
        }
        foreach ([(int) $date->format('Y') - 1, (int) $date->format('Y')] as $year) {
            // 29 Feb birthdays are celebrated on 28 Feb in other years.
            $day = ($m[1] === '02' && $m[2] === '29' && !checkdate(2, 29, $year)) ? '28' : $m[2];
            $start = new \DateTimeImmutable("{$year}-{$m[1]}-{$day} 00:00:00", $date->getTimezone());
            if ($date >= $start && $date < $start->modify('+7 days')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Anti-abuse rules for a referral at the moment it would pay out.
     *
     * @param array{email_verified: bool, same_phone_as_referrer: bool, phone_used_by_other_referral: bool,
     *              device_used_by_other_referral: bool, referrer_rewards_this_month: int, self_referral: bool} $facts
     * @return string|null rejection reason, or null when the reward may be paid
     */
    public function referralRejection(array $facts): ?string
    {
        return match (true) {
            $facts['self_referral'] => 'Self-referral',
            !$facts['email_verified'] => 'Friend has not verified their email',
            $facts['same_phone_as_referrer'] => 'Same phone number as the referrer',
            $facts['phone_used_by_other_referral'] => 'Phone number already used for a referral',
            $facts['device_used_by_other_referral'] => 'Device already used for a referral',
            $facts['referrer_rewards_this_month'] >= (int) ($this->settings['referral_max_per_month'] ?? 10) => 'Referrer reached the monthly limit',
            default => null,
        };
    }

    public function referralCreditKobo(): int
    {
        return (int) ($this->settings['referral_credit_naira'] ?? 2000) * 100;
    }
}
