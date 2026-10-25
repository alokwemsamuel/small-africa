<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Http\HttpError;
use App\Http\ValidationError;
use App\Security\Crypto;
use App\Security\Totp;
use App\Services\AuthService;

final class AuthServiceTest extends IntegrationTestCase
{
    private AuthService $auth;

    protected function setUp(): void
    {
        parent::setUp();
        $this->auth = $this->c->get(AuthService::class);
    }

    /** @return array<string, mixed> */
    private function registerAda(array $overrides = []): array
    {
        return $this->auth->register($overrides + [
            'first_name' => 'Ada', 'last_name' => 'Eze', 'email' => 'ada@example.com', 'phone' => '+2348031112222',
            'password' => 'Jollof&Pierogi-2026', 'referral_code' => null, 'marketing_opt_in' => true,
        ], '198.51.100.1');
    }

    public function testRegistrationCreatesCustomerLoyaltyAccountAndSignsIn(): void
    {
        $user = $this->registerAda();
        self::assertSame('customer', $user['role']);
        self::assertFalse($user['emailVerified']);
        self::assertMatchesRegularExpression('/^ADA\d{4}$/', $user['referralCode']);
        self::assertSame($user['id'], $this->session->get('uid'));
        self::assertGreaterThan(0, $this->session->regenerations, 'Session id must be regenerated on sign-in');
        self::assertSame('bronze', $this->db->scalar('SELECT tier FROM loyalty_accounts WHERE user_id = ?', [$user['id']]));
        $hash = $this->db->scalar('SELECT password_hash FROM users WHERE id = ?', [$user['id']]);
        self::assertStringStartsWith('$argon2id$', $hash);
        self::assertStringContainsString('Confirm your email', $this->mailer->sent[0]['subject']);
    }

    public function testRegistrationRejectsDuplicateEmailAndWeakPassword(): void
    {
        $this->registerAda();
        try {
            $this->registerAda(['email' => 'ADA@example.com']);
            self::fail('Duplicate email accepted');
        } catch (ValidationError $e) {
            self::assertArrayHasKey('email', $e->errors);
        }
        $this->expectException(ValidationError::class);
        $this->registerAda(['email' => 'other@example.com', 'password' => 'password123']);
    }

    public function testReferralCodeLinksReferrerAsPending(): void
    {
        $user = $this->registerAda(['referral_code' => 'guest2026']);
        $row = $this->db->one('SELECT r.status, u.email FROM referrals r JOIN users u ON u.id = r.referrer_user_id WHERE r.referred_user_id = ?', [$user['id']]);
        self::assertSame(['status' => 'pending', 'email' => 'guest@smallafrica.demo'], $row);
    }

    public function testEmailVerificationTokenIsSingleUse(): void
    {
        $user = $this->registerAda();
        $token = $this->tokenFromLastEmail();
        self::assertNotSame($token, $this->db->scalar('SELECT token_hash FROM email_verifications WHERE user_id = ?', [$user['id']]), 'Tokens must be stored hashed');
        $this->auth->verifyEmail($token);
        self::assertNotNull($this->db->scalar('SELECT email_verified_at FROM users WHERE id = ?', [$user['id']]));
        $this->expectException(HttpError::class);
        $this->auth->verifyEmail($token);
    }

    public function testLoginWithDemoAccount(): void
    {
        $result = $this->auth->login('Guest@SmallAfrica.demo', 'SmallAfrica@Guest2026', '198.51.100.2');
        self::assertSame('guest@smallafrica.demo', $result['user']['email']);
        self::assertSame('GUEST2026', $result['user']['referralCode']);
    }

    public function testAccountLocksAfterFiveFailedAttempts(): void
    {
        for ($i = 0; $i < AuthService::MAX_FAILED_LOGINS; $i++) {
            try {
                $this->auth->login('guest@smallafrica.demo', 'Wrong-password-1', '198.51.100.3');
                self::fail('Wrong password accepted');
            } catch (HttpError $e) {
                self::assertSame(401, $e->status);
            }
        }
        try {
            $this->auth->login('guest@smallafrica.demo', 'SmallAfrica@Guest2026', '198.51.100.3');
            self::fail('Locked account allowed sign-in');
        } catch (HttpError $e) {
            self::assertSame(423, $e->status);
        }
        $this->clock->freeze($this->clock->now()->modify('+16 minutes'));
        $this->db->run('DELETE FROM rate_limits');
        self::assertArrayHasKey('user', $this->auth->login('guest@smallafrica.demo', 'SmallAfrica@Guest2026', '198.51.100.3'));
    }

    public function testUnknownEmailGivesSameErrorAsWrongPassword(): void
    {
        try {
            $this->auth->login('nobody@example.com', 'Whatever-123', '198.51.100.4');
            self::fail();
        } catch (HttpError $e) {
            self::assertSame('invalid_credentials', $e->errorCode);
        }
    }

    public function testLoginIsRateLimitedPerEmail(): void
    {
        $this->expectExceptionObject(new HttpError(429, 'Too many attempts. Please wait a moment and try again.', 'rate_limited'));
        for ($i = 0; $i < 11; $i++) {
            try {
                $this->auth->login('nobody@example.com', 'Whatever-123', "198.51.100.{$i}");
            } catch (HttpError $e) {
                if ($e->status === 429) {
                    throw $e;
                }
            }
        }
    }

    public function testPasswordResetFlowInvalidatesOtherSessions(): void
    {
        $this->auth->login('guest@smallafrica.demo', 'SmallAfrica@Guest2026', '198.51.100.5');
        self::assertNotNull($this->auth->currentUser());

        $this->auth->requestPasswordReset('guest@smallafrica.demo', '198.51.100.5');
        $token = $this->tokenFromLastEmail();
        $this->auth->resetPassword($token, 'Brand-New-Pass-77', '198.51.100.5');

        self::assertNull($this->auth->currentUser(), 'Existing sessions must be signed out after a reset');
        self::assertArrayHasKey('user', $this->auth->login('guest@smallafrica.demo', 'Brand-New-Pass-77', '198.51.100.5'));
        $this->expectException(HttpError::class);
        $this->auth->resetPassword($token, 'Another-Pass-88', '198.51.100.5');
    }

    public function testPasswordResetForUnknownEmailSendsNothing(): void
    {
        $this->auth->requestPasswordReset('nobody@example.com', '198.51.100.6');
        self::assertSame([], $this->mailer->sent);
    }

    public function testStaffTwoFactorEnrolmentAndLogin(): void
    {
        $login = $this->auth->login('admin@smallafrica.demo', 'SmallAfrica@Admin2026', '198.51.100.7');
        $admin = $this->auth->currentUser();
        $setup = $this->auth->beginTwoFactorSetup($admin);
        self::assertStringStartsWith('otpauth://totp/', $setup['otpauthUri']);

        $now = $this->clock->now()->getTimestamp();
        $this->auth->confirmTwoFactorSetup($admin, Totp::at($setup['secret'], intdiv($now, 30)));
        $stored = $this->db->scalar('SELECT totp_secret_enc FROM users WHERE id = ?', [$admin['id']]);
        self::assertNotSame($setup['secret'], $stored, 'TOTP secret must be encrypted at rest');

        $this->auth->logout((int) $admin['id']);
        $this->clock->freeze($this->clock->now()->modify('+60 seconds'));
        $result = $this->auth->login('admin@smallafrica.demo', 'SmallAfrica@Admin2026', '198.51.100.7');
        self::assertSame(['twoFactorRequired' => true], $result);
        self::assertNull($this->auth->currentUser(), 'No session until the second factor is verified');

        $code = Totp::at($setup['secret'], intdiv($this->clock->now()->getTimestamp(), 30));
        $user = $this->auth->completeTwoFactor($code, '198.51.100.7');
        self::assertTrue($user['twoFactorEnabled']);
        self::assertNotNull($this->auth->currentUser());
        self::assertArrayHasKey('user', $login);
    }

    public function testCustomersCannotEnrolTwoFactor(): void
    {
        $this->auth->login('guest@smallafrica.demo', 'SmallAfrica@Guest2026', '198.51.100.8');
        $this->expectException(HttpError::class);
        $this->auth->beginTwoFactorSetup($this->auth->currentUser());
    }

    public function testAuditLogIsAppendOnly(): void
    {
        $this->auth->login('guest@smallafrica.demo', 'SmallAfrica@Guest2026', '198.51.100.9');
        $id = $this->db->scalar("SELECT id FROM audit_logs WHERE action = 'auth.login' ORDER BY id DESC LIMIT 1");
        self::assertNotNull($id);
        $this->expectException(\PDOException::class);
        $this->db->run('DELETE FROM audit_logs WHERE id = ?', [$id]);
    }

    public function testLedgersRejectUpdatesAndDeletes(): void
    {
        $uid = (int) $this->db->scalar("SELECT id FROM users WHERE email = 'guest@smallafrica.demo'");
        $this->db->insert('wallet_ledger', [
            'user_id' => $uid, 'entry_type' => 'adjustment', 'direction' => 'credit', 'amount_kobo' => 100,
            'balance_after_kobo' => 100, 'description' => 'test', 'idempotency_key' => Crypto::token(8),
        ]);
        foreach (['UPDATE wallet_ledger SET amount_kobo = 999999 WHERE user_id = ?', 'DELETE FROM wallet_ledger WHERE user_id = ?'] as $sql) {
            try {
                $this->db->run($sql, [$uid]);
                self::fail("Ledger allowed: {$sql}");
            } catch (\PDOException $e) {
                self::assertStringContainsString('append-only', $e->getMessage());
            }
        }
    }
}
