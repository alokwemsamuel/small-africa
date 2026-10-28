<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Loyalty\Ledger;
use App\Http\ValidationError;
use App\Loyalty\LoyaltyJobs;
use App\Loyalty\LoyaltyService;
use App\Loyalty\LoyaltySettingsValidator;
use App\Security\PasswordPolicy;
use App\Services\OrderService;
use App\Social\Identity;
use App\Social\SocialAuthService;
use App\Support\Settings;

/**
 * The welcome bonus: points after a new customer's first completed order, once per customer,
 * with the same anti-abuse checks as referrals. Clock: Tuesday 20 Oct 2026, 12:00.
 */
final class WelcomeBonusTest extends IntegrationTestCase
{
    private const PASSWORD = 'Lagos-Table-2026!x';

    private function bonusRows(int $userId): int
    {
        return (int) $this->db->scalar("SELECT COUNT(*) FROM points_ledger WHERE user_id = ? AND entry_type = 'bonus'", [$userId]);
    }

    private function bonusStatus(int $userId): ?string
    {
        $s = $this->db->scalar('SELECT welcome_bonus_status FROM loyalty_accounts WHERE user_id = ?', [$userId]);
        return $s === null || $s === false ? null : (string) $s;
    }

    /** @return array{id: int, headers: array<string, string>} */
    private function signUp(string $email, string $phone, bool $verified = true): array
    {
        $this->session->destroy();
        [$res, $reg] = $this->request('POST', '/api/auth/register', [
            'first_name' => 'Ada', 'last_name' => 'Newcomer', 'email' => $email, 'phone' => $phone,
            'password' => self::PASSWORD, 'accept_terms' => true,
        ], $this->spaHeaders());
        self::assertSame(201, $res->getStatusCode(), json_encode($reg));
        $id = (int) $reg['user']['id'];
        if ($verified) {
            $this->db->run('UPDATE users SET email_verified_at = ? WHERE id = ?', ['2026-10-20 12:00:00', $id]);
        }
        return ['id' => $id, 'headers' => ['X-CSRF-Token' => $reg['csrfToken'], 'Origin' => 'http://localhost:5173']];
    }

    /** Places, pays and completes one order for the signed-in member. */
    private function completeOrder(string $email, array $headers): void
    {
        $order = [
            'items' => [['dish_id' => (int) $this->db->scalar("SELECT id FROM dishes WHERE slug = 'smoky-party-jollof'"), 'quantity' => 2]],
            'fulfilment' => 'pickup', 'name' => 'Ada Newcomer', 'email' => $email, 'phone' => '08030000003',
        ];
        [, $placed] = $this->request('POST', '/api/orders', $order, $headers + ['Idempotency-Key' => bin2hex(random_bytes(12))]);
        $ref = $placed['order']['reference'];
        $this->request('POST', '/api/payments/simulate', ['reference' => $ref, 'outcome' => 'success'], $this->spaHeaders());
        foreach (['preparing', 'ready', 'completed'] as $s) {
            $this->c->get(OrderService::class)->updateStatus($ref, $s, null);
        }
    }

    private function setBonus(int $points): void
    {
        $this->db->run("UPDATE settings SET setting_value = JSON_SET(setting_value, '$.welcome_bonus_points', ?) WHERE setting_key = 'loyalty'", [$points]);
        $this->c->get(Settings::class)->forget(); // settings are cached per request
    }

    public function testAnEmailSignUpGetsTheBonusAfterTheFirstCompletedOrderOnlyOnce(): void
    {
        $m = $this->signUp('first@example.com', '08031112222');
        self::assertSame(0, $this->bonusRows($m['id']));

        $this->completeOrder('first@example.com', $m['headers']);
        self::assertSame('awarded', $this->bonusStatus($m['id']));
        self::assertSame(1, $this->bonusRows($m['id']));
        self::assertSame(200, (int) $this->db->scalar("SELECT points FROM points_ledger WHERE user_id = ? AND entry_type = 'bonus'", [$m['id']]));

        // A second order earns its normal points but no second bonus.
        $this->completeOrder('first@example.com', $m['headers']);
        self::assertSame(1, $this->bonusRows($m['id']));
        self::assertTrue($this->c->get(Ledger::class)->reconcile($m['id'])['ok']);
    }

    public function testASocialSignUpGetsTheBonusToo(): void
    {
        $result = $this->c->get(SocialAuthService::class)->signIn(new Identity('google', 'g-welcome', 'kasia.social@example.com', true, 'Kasia', 'Social'));
        $id = (int) $result['user']['id'];
        // Orders need the usual sign-in token, so give this member a password and sign in with it.
        $this->db->run('UPDATE users SET password_hash = ? WHERE id = ?', [PasswordPolicy::hash(self::PASSWORD), $id]);
        $this->session->destroy();
        [, $login] = $this->request('POST', '/api/auth/login', ['email' => 'kasia.social@example.com', 'password' => self::PASSWORD], $this->spaHeaders());
        $headers = ['X-CSRF-Token' => $login['csrfToken'], 'Origin' => 'http://localhost:5173'];

        $this->completeOrder('kasia.social@example.com', $headers);
        self::assertSame('awarded', $this->bonusStatus($id));
        self::assertSame(1, $this->bonusRows($id));
    }

    public function testAnOrderThatIsNotCompletedEarnsNothing(): void
    {
        $m = $this->signUp('unpaid@example.com', '08037778888');
        $order = [
            'items' => [['dish_id' => (int) $this->db->scalar("SELECT id FROM dishes WHERE slug = 'smoky-party-jollof'"), 'quantity' => 1]],
            'fulfilment' => 'pickup', 'name' => 'Ada', 'email' => 'unpaid@example.com', 'phone' => '08037778888',
        ];
        $this->request('POST', '/api/orders', $order, $m['headers'] + ['Idempotency-Key' => bin2hex(random_bytes(12))]);
        self::assertNull($this->bonusStatus($m['id']));
        self::assertSame(0, $this->bonusRows($m['id']));
    }

    public function testCustomersWhoOrderedBeforeTheBonusExistedNeverQualify(): void
    {
        $m = $this->signUp('veteran@example.com', '08039990000');
        $this->setBonus(0);
        $this->completeOrder('veteran@example.com', $m['headers']);
        $this->setBonus(200);
        $this->completeOrder('veteran@example.com', $m['headers']);
        self::assertNull($this->bonusStatus($m['id']));
        self::assertSame(0, $this->bonusRows($m['id']));
    }

    public function testZeroSwitchesTheBonusOff(): void
    {
        $this->setBonus(0);
        $m = $this->signUp('off@example.com', '08031230000');
        $this->completeOrder('off@example.com', $m['headers']);
        self::assertNull($this->bonusStatus($m['id']));
        [, $catalog] = $this->request('GET', '/api/site');
        self::assertSame(0, $catalog['loyalty']['welcomeBonusPoints']);
    }

    public function testTheSiteSettingsShowTheAmount(): void
    {
        [, $catalog] = $this->request('GET', '/api/site');
        self::assertSame(200, $catalog['loyalty']['welcomeBonusPoints']);
        $this->setBonus(350);
        [, $changed] = $this->request('GET', '/api/site');
        self::assertSame(350, $changed['loyalty']['welcomeBonusPoints']);
    }

    public function testAnUnverifiedEmailWaitsThenTheDailyJobPaysIt(): void
    {
        $m = $this->signUp('late@example.com', '08034560000', false);
        $this->completeOrder('late@example.com', $m['headers']);
        self::assertSame('pending', $this->bonusStatus($m['id']));
        self::assertSame(0, $this->bonusRows($m['id']));

        $jobs = $this->c->get(LoyaltyJobs::class);
        self::assertSame(1, $jobs->pendingWelcomeBonuses(), 'still waiting');

        $this->db->run('UPDATE users SET email_verified_at = ? WHERE id = ?', ['2026-10-20 12:00:00', $m['id']]);
        self::assertSame(0, $jobs->pendingWelcomeBonuses());
        self::assertSame('awarded', $this->bonusStatus($m['id']));
        $jobs->pendingWelcomeBonuses(); // running it again pays nothing more
        self::assertSame(1, $this->bonusRows($m['id']));
    }

    public function testAPhoneNumberAlreadyUsedForABonusIsRefused(): void
    {
        $a = $this->signUp('one@example.com', '0803 444 5555');
        $this->completeOrder('one@example.com', $a['headers']);
        self::assertSame('awarded', $this->bonusStatus($a['id']));

        $b = $this->signUp('two@example.com', '+234 803 444 5555');
        $this->completeOrder('two@example.com', $b['headers']);
        self::assertSame('rejected', $this->bonusStatus($b['id']));
        self::assertStringContainsString('Phone', (string) $this->db->scalar('SELECT welcome_bonus_reason FROM loyalty_accounts WHERE user_id = ?', [$b['id']]));
        self::assertSame(0, $this->bonusRows($b['id']));
    }

    public function testTheSettingIsRangeCheckedWhenTheAdminSavesIt(): void
    {
        $settings = $this->c->get(LoyaltyService::class)->rules()->settings();
        $fieldErrors = static function (int $points) use ($settings): array {
            try {
                LoyaltySettingsValidator::validate(['welcome_bonus_points' => $points] + $settings, []);
                return [];
            } catch (ValidationError $e) {
                return $e->errors;
            }
        };
        self::assertArrayNotHasKey('welcome_bonus_points', $fieldErrors(350));
        self::assertArrayNotHasKey('welcome_bonus_points', $fieldErrors(0));
        self::assertArrayHasKey('welcome_bonus_points', $fieldErrors(-5));
        self::assertArrayHasKey('welcome_bonus_points', $fieldErrors(100001));
    }
}
