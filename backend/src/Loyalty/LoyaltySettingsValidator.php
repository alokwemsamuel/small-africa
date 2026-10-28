<?php

declare(strict_types=1);

namespace App\Loyalty;

use App\Http\ValidationError;

/**
 * Validates the whole Interest Account configuration before it is saved from the admin
 * panel. Field names follow the `loyalty` settings group; anything not listed is dropped.
 */
final class LoyaltySettingsValidator
{
    public const TIER_KEYS = ['bronze', 'silver', 'gold', 'black_diamond'];

    /** Whole-number fields: [min, max, label]. */
    private const INTS = [
        'earn_points_per_1000_naira' => [0, 100, 'Points per ₦1,000'],
        'redeem_points_per_1000_naira' => [10, 10000, 'Points for ₦1,000 credit'],
        'min_points_to_redeem' => [1, 100000, 'Minimum points to redeem'],
        'topup_min_naira' => [100, 1000000, 'Minimum top-up'],
        'topup_max_naira' => [1000, 10000000, 'Maximum top-up'],
        'interest_rate_bp' => [0, 1000, 'Monthly interest rate'],
        'interest_cap_naira' => [0, 1000000, 'Monthly interest cap'],
        'interest_min_balance_naira' => [0, 10000000, 'Minimum balance for interest'],
        'streak_visits_per_month' => [1, 31, 'Visits for the streak bonus'],
        'streak_bonus_points' => [0, 100000, 'Streak bonus points'],
        'anniversary_points' => [0, 100000, 'Anniversary bonus points'],
        'welcome_bonus_points' => [0, 100000, 'Welcome bonus points'],
        'referral_credit_naira' => [0, 100000, 'Referral credit'],
        'referral_max_per_month' => [0, 1000, 'Referral rewards per month'],
        'points_expiry_months' => [1, 60, 'Points expiry'],
        'points_expiry_warning_days' => [1, 90, 'Expiry warning'],
        'winback_after_days' => [7, 365, 'Win-back after'],
        'winback_offer_percent' => [0, 50, 'Win-back discount'],
    ];

    /** Decimal multipliers: [min, max, label]. */
    private const MULTIPLIERS = [
        'featured_dish_points_multiplier' => [1, 5, 'Featured dish multiplier'],
        'birthday_points_multiplier' => [1, 5, 'Birthday week multiplier'],
    ];

    /**
     * @param array<string, mixed> $in
     * @param list<string> $categorySlugs
     * @return array<string, mixed>
     */
    public static function validate(array $in, array $categorySlugs): array
    {
        $errors = [];
        $out = [];
        foreach (self::INTS as $key => [$min, $max, $label]) {
            $v = $in[$key] ?? null;
            if (!is_int($v) && !(is_string($v) && preg_match('/^\d+$/', $v))) {
                $errors[$key] = "{$label} must be a whole number.";
                continue;
            }
            $v = (int) $v;
            if ($v < $min || $v > $max) {
                $errors[$key] = "{$label} must be between {$min} and {$max}.";
                continue;
            }
            $out[$key] = $v;
        }
        foreach (self::MULTIPLIERS as $key => [$min, $max, $label]) {
            $v = $in[$key] ?? null;
            if (!is_numeric($v) || (float) $v < $min || (float) $v > $max) {
                $errors[$key] = "{$label} must be between {$min}× and {$max}×.";
                continue;
            }
            $out[$key] = round((float) $v, 2);
        }
        if (($out['topup_min_naira'] ?? 0) > ($out['topup_max_naira'] ?? PHP_INT_MAX)) {
            $errors['topup_max_naira'] = 'The maximum top-up must be at least the minimum.';
        }

        $days = $in['double_points_weekdays'] ?? [];
        if (!is_array($days) || array_diff(array_map('intval', $days), range(0, 6)) || count($days) > 7) {
            $errors['double_points_weekdays'] = 'Choose days of the week.';
        } else {
            $out['double_points_weekdays'] = array_values(array_unique(array_map('intval', $days)));
        }

        $presets = $in['topup_presets_naira'] ?? [];
        if (!is_array($presets) || count($presets) < 1 || count($presets) > 6 || array_filter($presets, static fn ($p) => !is_numeric($p) || (int) $p < 100)) {
            $errors['topup_presets_naira'] = 'Add one to six preset amounts.';
        } else {
            $out['topup_presets_naira'] = array_values(array_map('intval', $presets));
            sort($out['topup_presets_naira']);
        }

        $bands = $in['topup_bonus_tiers'] ?? [];
        if (!is_array($bands) || count($bands) > 5) {
            $errors['topup_bonus_tiers'] = 'Up to five bonus levels.';
        } else {
            $out['topup_bonus_tiers'] = [];
            foreach ($bands as $b) {
                $minN = is_array($b) ? ($b['min_naira'] ?? null) : null;
                $bp = is_array($b) ? ($b['bonus_bp'] ?? null) : null;
                if (!is_numeric($minN) || !is_numeric($bp) || (int) $minN < 1 || (int) $bp < 0 || (int) $bp > 5000) {
                    $errors['topup_bonus_tiers'] = 'Each bonus level needs an amount and a bonus between 0% and 50%.';
                    break;
                }
                $out['topup_bonus_tiers'][] = ['min_naira' => (int) $minN, 'bonus_bp' => (int) $bp];
            }
            usort($out['topup_bonus_tiers'], static fn ($a, $b) => $b['min_naira'] <=> $a['min_naira']);
        }

        $tiers = $in['tiers'] ?? [];
        if (!is_array($tiers) || array_column($tiers, 'key') !== self::TIER_KEYS) {
            $errors['tiers'] = 'All four tiers are required, in order.';
        } else {
            $out['tiers'] = [];
            $last = -1;
            foreach ($tiers as $i => $t) {
                $name = trim((string) ($t['name'] ?? ''));
                $minSpend = $i === 0 ? 0 : ($t['min_spend_naira'] ?? null);
                $mult = $t['multiplier'] ?? null;
                $perks = $t['perks'] ?? [];
                if ($name === '' || mb_strlen($name) > 40 || !is_numeric($minSpend) || (int) $minSpend <= $last
                    || !is_numeric($mult) || (float) $mult < 1 || (float) $mult > 5
                    || !is_array($perks) || count($perks) > 8 || array_filter($perks, static fn ($p) => !is_string($p) || trim($p) === '' || mb_strlen($p) > 80)) {
                    $errors['tiers'] = 'Each tier needs a name, a higher spend than the one before, a multiplier from 1× to 5× and up to 8 short perks.';
                    break;
                }
                $last = (int) $minSpend;
                $out['tiers'][] = [
                    'key' => $t['key'], 'name' => $name, 'min_spend_naira' => (int) $minSpend,
                    'multiplier' => round((float) $mult, 2), 'perks' => array_values(array_map('trim', $perks)),
                ];
            }
        }

        $stamps = $in['stamp_rewards'] ?? [];
        if (!is_array($stamps) || count($stamps) > 10) {
            $errors['stamp_rewards'] = 'Up to ten stamp rewards.';
        } else {
            $out['stamp_rewards'] = [];
            foreach ($stamps as $s) {
                $n = $s['stamp'] ?? null;
                $reward = trim((string) ($s['reward'] ?? ''));
                $cat = $s['category'] ?? null;
                if (!is_numeric($n) || (int) $n < 1 || (int) $n > 10 || $reward === '' || mb_strlen($reward) > 60 || !in_array($cat, $categorySlugs, true)) {
                    $errors['stamp_rewards'] = 'Each stamp reward needs a stamp (1–10), a name and a menu section.';
                    break;
                }
                $out['stamp_rewards'][] = ['stamp' => (int) $n, 'reward' => $reward, 'category' => $cat];
            }
            usort($out['stamp_rewards'], static fn ($a, $b) => $a['stamp'] <=> $b['stamp']);
        }

        $free = $in['free_delivery_tiers'] ?? [];
        if (!is_array($free) || array_diff($free, self::TIER_KEYS)) {
            $errors['free_delivery_tiers'] = 'Choose tiers.';
        } else {
            $out['free_delivery_tiers'] = array_values(array_intersect(self::TIER_KEYS, $free));
        }

        if ($errors) {
            throw new ValidationError($errors);
        }
        return $out;
    }
}
