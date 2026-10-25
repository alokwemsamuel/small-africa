<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Loyalty\LoyaltyRules;
use App\Support\Clock;
use PHPUnit\Framework\TestCase;

final class LoyaltyRulesTest extends TestCase
{
    private LoyaltyRules $rules;

    protected function setUp(): void
    {
        $this->rules = new LoyaltyRules([
            'earn_points_per_1000_naira' => 5,
            'double_points_weekdays' => [2, 3],
            'featured_dish_points_multiplier' => 2,
            'redeem_points_per_1000_naira' => 100,
            'topup_min_naira' => 5000,
            'topup_max_naira' => 1000000,
            'topup_bonus_tiers' => [['min_naira' => 100000, 'bonus_bp' => 1000], ['min_naira' => 50000, 'bonus_bp' => 500]],
            'interest_rate_bp' => 200,
            'interest_cap_naira' => 5000,
            'interest_min_balance_naira' => 20000,
            'tiers' => [
                ['key' => 'silver', 'name' => 'Silver', 'min_spend_naira' => 150000, 'multiplier' => 1.25, 'perks' => []],
                ['key' => 'bronze', 'name' => 'Bronze', 'min_spend_naira' => 0, 'multiplier' => 1.0, 'perks' => []],
                ['key' => 'gold', 'name' => 'Gold', 'min_spend_naira' => 500000, 'multiplier' => 1.5, 'perks' => []],
                ['key' => 'black_diamond', 'name' => 'Black Diamond', 'min_spend_naira' => 1500000, 'multiplier' => 2.0, 'perks' => []],
            ],
            'stamp_rewards' => [['stamp' => 5, 'reward' => 'Free dessert', 'category' => 'desserts'], ['stamp' => 10, 'reward' => 'Free main course', 'category' => 'mains']],
            'streak_visits_per_month' => 3,
            'birthday_points_multiplier' => 2,
            'referral_credit_naira' => 2000,
            'referral_max_per_month' => 10,
            'points_expiry_months' => 12,
            'points_expiry_warning_days' => 30,
        ]);
    }

    public function testInterestNeedsTheMinimumBalanceAllMonth(): void
    {
        self::assertSame(0, $this->rules->interest(1999900), 'Below ₦20,000: nothing');
        self::assertSame(40000, $this->rules->interest(2000000), '2% of ₦20,000 = ₦400');
        self::assertSame(137000, $this->rules->interest(6850000), '2% of ₦68,500 = ₦1,370');
        self::assertSame(0, $this->rules->interest(-500));
    }

    public function testInterestIsCappedAndRoundedDownToWholeNaira(): void
    {
        self::assertSame(500000, $this->rules->interest(100000000), 'Capped at ₦5,000 on ₦1,000,000');
        self::assertSame(40100, $this->rules->interest(2005050), '₦401.01 rounds down to ₦401');
    }

    public function testTopUpBonusUsesTheHighestBandReached(): void
    {
        self::assertSame(0, $this->rules->topupBonus(4999900));
        self::assertSame(250000, $this->rules->topupBonus(5000000), '₦50,000 → 5%');
        self::assertSame(400000, $this->rules->topupBonus(8000000), '₦80,000 → 5%');
        self::assertSame(1000000, $this->rules->topupBonus(10000000), '₦100,000 → 10%');
        self::assertSame(['min' => 500000, 'max' => 100000000], $this->rules->topupLimits());
    }

    public function testTiersFollowTwelveMonthSpend(): void
    {
        self::assertSame('bronze', $this->rules->tierFor(0));
        self::assertSame('silver', $this->rules->tierFor(15000000));
        self::assertSame('gold', $this->rules->tierFor(50000000));
        self::assertSame('black_diamond', $this->rules->tierFor(200000000));
        self::assertSame(1.5, $this->rules->tierMultiplier('gold'));
        self::assertGreaterThan($this->rules->tierRank('silver'), $this->rules->tierRank('gold'));
    }

    public function testNextTierProgressMatchesTheMembershipCard(): void
    {
        $next = $this->rules->nextTier(45800000); // ₦458,000 spent
        self::assertSame('gold', $next['key']);
        self::assertSame(4200000, $next['remainingKobo'], '“₦42,000 more to reach Gold”');
        self::assertEqualsWithDelta(0.88, $next['progress'], 0.0001);
        self::assertNull($this->rules->nextTier(160000000), 'Nothing above Black Diamond');
    }

    public function testPointsPerThousandNairaWithMultipliers(): void
    {
        $line = [['amountKobo' => 1000000, 'featured' => false]]; // ₦10,000
        self::assertSame(50, $this->rules->pointsFor($line, 1, 'bronze', false), '5 per ₦1,000');
        self::assertSame(100, $this->rules->pointsFor($line, 2, 'bronze', false), 'Double on Tuesday');
        self::assertSame(75, $this->rules->pointsFor($line, 5, 'gold', false), 'Gold 1.5×');
        self::assertSame(100, $this->rules->pointsFor($line, 3, 'black_diamond', false), 'Wednesday and Black Diamond: still 2×, not 4×');
        self::assertSame(100, $this->rules->pointsFor($line, 1, 'bronze', true), 'Birthday week 2×');
        self::assertSame(100, $this->rules->pointsFor([['amountKobo' => 1000000, 'featured' => true]], 1, 'bronze', false), 'Featured dish doubles');
    }

    public function testMultipliersNeverStack(): void
    {
        $featured = [['amountKobo' => 1000000, 'featured' => true]];
        $plain = [['amountKobo' => 1000000, 'featured' => false]];
        self::assertSame(100, $this->rules->pointsFor($featured, 2, 'gold', true), 'Gold + Tuesday + featured + birthday = 2× only');
        self::assertSame(62, $this->rules->pointsFor($plain, 1, 'silver', false), 'Silver alone: 1.25× (62.5 rounded down)');
        self::assertSame(100, $this->rules->pointsFor($featured, 1, 'silver', false), 'Featured 2× beats Silver 1.25×');
        self::assertSame(
            162,
            $this->rules->pointsFor([...$featured, ['amountKobo' => 1000000, 'featured' => false]], 1, 'silver', false),
            'Each line takes its own highest: 100 + 62.5',
        );
        self::assertSame(2.0, $this->rules->orderMultiplier(3, 'gold', false));
        self::assertSame(1.5, $this->rules->orderMultiplier(5, 'gold', false));
        self::assertSame(9, $this->rules->pointsFor([['amountKobo' => 99900, 'featured' => false], ['amountKobo' => 99900, 'featured' => false]], 1, 'bronze', false), 'Two ₦999 lines: 9 points summed, not 4 + 4');
    }

    public function testRedeemingPoints(): void
    {
        self::assertSame(100000, $this->rules->pointsToCreditKobo(100), '100 points = ₦1,000');
        self::assertSame(2340000, $this->rules->pointsToCreditKobo(2340));
    }

    public function testStampCard(): void
    {
        self::assertSame(['stamps' => 3, 'reward' => null], $this->rules->addStamp(2));
        self::assertSame('Free dessert', $this->rules->addStamp(4)['reward']['reward']);
        $tenth = $this->rules->addStamp(9);
        self::assertSame(0, $tenth['stamps'], 'A full card starts again');
        self::assertSame('mains', $tenth['reward']['category']);
        self::assertTrue($this->rules->streakReached(3));
        self::assertFalse($this->rules->streakReached(4), 'The streak bonus is paid once a month');
    }

    public function testPointsExpireAfterTwelveMonthsWithAWarning(): void
    {
        $last = new \DateTimeImmutable('2025-11-01 10:00', Clock::zone());
        self::assertSame('active', $this->rules->expiryState($last, new \DateTimeImmutable('2026-09-30', Clock::zone())));
        self::assertSame('warn', $this->rules->expiryState($last, new \DateTimeImmutable('2026-10-05', Clock::zone())));
        self::assertSame('expire', $this->rules->expiryState($last, new \DateTimeImmutable('2026-11-01 10:00', Clock::zone())));
        self::assertSame('active', $this->rules->expiryState(null, new \DateTimeImmutable('2030-01-01', Clock::zone())));
    }

    public function testBirthdayWeek(): void
    {
        $z = Clock::zone();
        self::assertTrue(LoyaltyRules::inBirthdayWeek('1992-07-14', new \DateTimeImmutable('2026-07-14 09:00', $z)));
        self::assertTrue(LoyaltyRules::inBirthdayWeek('1992-07-14', new \DateTimeImmutable('2026-07-20 23:00', $z)));
        self::assertFalse(LoyaltyRules::inBirthdayWeek('1992-07-14', new \DateTimeImmutable('2026-07-21 00:00', $z)));
        self::assertTrue(LoyaltyRules::inBirthdayWeek('1990-12-30', new \DateTimeImmutable('2027-01-03 12:00', $z)), 'Week spans New Year');
        self::assertTrue(LoyaltyRules::inBirthdayWeek('2000-02-29', new \DateTimeImmutable('2027-02-28 12:00', $z)), 'Leap-day birthdays on 28 Feb');
        self::assertFalse(LoyaltyRules::inBirthdayWeek(null, new \DateTimeImmutable('2026-07-14', $z)));
    }

    public function testReferralAntiAbuseRules(): void
    {
        $ok = [
            'self_referral' => false, 'email_verified' => true, 'same_phone_as_referrer' => false,
            'phone_used_by_other_referral' => false, 'device_used_by_other_referral' => false, 'referrer_rewards_this_month' => 2,
        ];
        self::assertNull($this->rules->referralRejection($ok));
        self::assertSame(200000, $this->rules->referralCreditKobo());
        self::assertSame('Self-referral', $this->rules->referralRejection(['self_referral' => true] + $ok));
        self::assertNotNull($this->rules->referralRejection(['email_verified' => false] + $ok));
        self::assertSame('Same phone number as the referrer', $this->rules->referralRejection(['same_phone_as_referrer' => true] + $ok));
        self::assertSame('Device already used for a referral', $this->rules->referralRejection(['device_used_by_other_referral' => true] + $ok));
        self::assertNotNull($this->rules->referralRejection(['phone_used_by_other_referral' => true] + $ok));
        self::assertSame('Referrer reached the monthly limit', $this->rules->referralRejection(['referrer_rewards_this_month' => 10] + $ok));
    }
}
