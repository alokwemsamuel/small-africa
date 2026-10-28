<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Http\HttpError;
use App\Http\ValidationError;
use App\Repositories\UserRepository;
use App\Security\PasswordPolicy;
use App\Services\AuthService;
use App\Social\Identity;
use App\Social\SocialAuthService;
use App\Social\SocialError;

final class SocialAuthServiceTest extends IntegrationTestCase
{
    private SocialAuthService $social;
    private UserRepository $users;
    private AuthService $auth;

    protected function setUp(): void
    {
        parent::setUp();
        $this->social = $this->c->get(SocialAuthService::class);
        $this->users = $this->c->get(UserRepository::class);
        $this->auth = $this->c->get(AuthService::class);
    }

    private function google(string $sub = 'g-100', ?string $email = 'ada@example.com', bool $verified = true, string $first = 'Ada', string $last = 'Okafor'): Identity
    {
        return new Identity('google', $sub, $email, $verified, $first, $last);
    }

    /** @return array<string, mixed> the user row */
    private function member(string $email = 'ada@example.com', ?string $password = 'Jollof&Pierogi-2026'): array
    {
        $id = $this->users->create([
            'role' => 'customer', 'first_name' => 'Ada', 'last_name' => 'Eze', 'email' => $email, 'phone' => '+2348031112222',
            'password_hash' => $password !== null ? PasswordPolicy::hash($password) : null,
            'referral_code' => 'ADA' . random_int(1000, 9999), 'email_verified_at' => null,
        ]);
        $this->db->insert('loyalty_accounts', ['user_id' => $id]);
        return $this->users->find($id);
    }

    private function staff(string $role = 'manager', string $email = 'tomasz@smallafrica.test'): array
    {
        $id = $this->users->create([
            'role' => $role, 'first_name' => 'Tomasz', 'last_name' => 'Kowalski', 'email' => $email,
            'password_hash' => PasswordPolicy::hash('Staff&Pierogi-2026'), 'referral_code' => null, 'email_verified_at' => '2026-01-01 10:00:00',
        ]);
        return $this->users->find($id);
    }

    private function identityCount(?int $userId = null): int
    {
        return (int) ($userId === null
            ? $this->db->scalar('SELECT COUNT(*) FROM user_identities')
            : $this->db->scalar('SELECT COUNT(*) FROM user_identities WHERE user_id = ?', [$userId]));
    }

    public function testANewPersonGetsACustomerAccountWithABronzeCardAndNoPassword(): void
    {
        $result = $this->social->signIn($this->google());
        $user = $result['user'];
        self::assertTrue($result['isNew']);
        self::assertSame('customer', $user['role']);
        self::assertSame('Ada', $user['first_name']);
        self::assertSame('Okafor', $user['last_name']);
        self::assertSame('ada@example.com', $user['email']);
        self::assertNull($user['password_hash']);
        self::assertSame('google', $user['signup_provider']);
        self::assertNotNull($user['email_verified_at'], 'Google confirmed the address');
        self::assertNull($user['onboarded_at']);
        self::assertSame('bronze', $this->db->scalar('SELECT tier FROM loyalty_accounts WHERE user_id = ?', [$user['id']]));
        self::assertSame(1, $this->identityCount((int) $user['id']));
        self::assertSame($user['id'], $this->session->get('uid'), 'signed in with the usual session');
        self::assertGreaterThan(0, $this->session->regenerations, 'session id rotated on sign-in');
        self::assertSame([], $this->mailer->sent, 'no confirmation email needed: the provider confirmed it');
        $public = UserRepository::toPublic($user);
        self::assertSame(['provider' => 'google', 'needsEmail' => false], $public['welcome']);
        self::assertFalse($public['hasPassword']);
    }

    public function testASeenIdentitySignsInToItsOwnAccountEvenIfTheEmailChanged(): void
    {
        $first = $this->social->signIn($this->google('g-100', 'ada@example.com'));
        $this->session->remove('uid');
        $again = $this->social->signIn($this->google('g-100', 'new-address@example.com'));
        self::assertFalse($again['isNew']);
        self::assertSame($first['user']['id'], $again['user']['id']);
        self::assertSame($first['user']['id'], $this->session->get('uid'));
        self::assertSame(1, $this->identityCount());
        self::assertSame('new-address@example.com', $this->db->scalar('SELECT email FROM user_identities WHERE user_id = ?', [$first['user']['id']]));
    }

    public function testAVerifiedEmailThatMatchesAnExistingAccountIsLinkedToIt(): void
    {
        $existing = $this->member('ada@example.com');
        $result = $this->social->signIn($this->google('g-200', 'ada@example.com', true));
        self::assertFalse($result['isNew']);
        self::assertSame($existing['id'], $result['user']['id'], 'signed in to the existing account, no second one');
        self::assertSame(1, $this->identityCount((int) $existing['id']));
        self::assertNotNull($this->users->find((int) $existing['id'])['email_verified_at'], 'the provider confirmed the address');
        self::assertSame(1, (int) $this->db->scalar('SELECT COUNT(*) FROM users WHERE email = ?', ['ada@example.com']));
        self::assertNull($result['user']['signup_provider'], 'an old account has no welcome step to finish');
    }

    public function testAnUnverifiedEmailIsNeverLinkedToAnExistingAccount(): void
    {
        $existing = $this->member('ada@example.com');
        try {
            $this->social->signIn($this->google('g-300', 'ada@example.com', false));
            self::fail('Expected the sign-in to be refused');
        } catch (SocialError $e) {
            self::assertSame(SocialError::EMAIL_UNVERIFIED, $e->reason);
        }
        self::assertSame(0, $this->identityCount());
        self::assertNull($this->session->get('uid'), 'nobody is signed in');
        self::assertNull($this->users->find((int) $existing['id'])['email_verified_at']);
    }

    public function testStaffAndAdminAccountsCannotUseSocialSignIn(): void
    {
        foreach (['manager', 'super_admin', 'staff'] as $i => $role) {
            $staff = $this->staff($role, "staff{$i}@smallafrica.test");
            // By email match (even a verified one)...
            try {
                $this->social->signIn($this->google("g-s{$i}", "staff{$i}@smallafrica.test", true));
                self::fail("A {$role} signed in with a provider");
            } catch (SocialError $e) {
                self::assertSame(SocialError::STAFF, $e->reason);
            }
            // ...and by an identity that somehow exists.
            $this->db->insert('user_identities', ['user_id' => $staff['id'], 'provider' => 'google', 'provider_user_id' => "g-direct-{$i}", 'email' => null]);
            try {
                $this->social->signIn($this->google("g-direct-{$i}", null));
                self::fail("A {$role} signed in with an identity");
            } catch (SocialError $e) {
                self::assertSame(SocialError::STAFF, $e->reason);
            }
        }
        self::assertNull($this->session->get('uid'));
    }

    public function testAnInactiveAccountIsRefused(): void
    {
        $user = $this->member('ada@example.com');
        $this->users->update((int) $user['id'], ['is_active' => 0]);
        try {
            $this->social->signIn($this->google('g-400', 'ada@example.com', true));
            self::fail('Expected a refusal');
        } catch (SocialError $e) {
            self::assertSame(SocialError::INACTIVE, $e->reason);
        }
    }

    public function testAppleSavesTheNameOnFirstSignInAndAcceptsARelayAddress(): void
    {
        $first = new Identity('apple', 'a-001', 'x7k2.relay@privaterelay.appleid.com', true, 'Kasia', 'Nowak');
        $result = $this->social->signIn($first);
        self::assertSame('Kasia', $result['user']['first_name']);
        self::assertSame('Nowak', $result['user']['last_name']);
        self::assertSame('x7k2.relay@privaterelay.appleid.com', $result['user']['email']);
        self::assertNotNull($result['user']['email_verified_at']);
        // Apple sends no name the second time: the saved one stays.
        $this->session->remove('uid');
        $again = $this->social->signIn(new Identity('apple', 'a-001', 'x7k2.relay@privaterelay.appleid.com', true));
        self::assertSame($result['user']['id'], $again['user']['id']);
        self::assertSame('Kasia', $again['user']['first_name']);
        self::assertSame('Nowak', $again['user']['last_name']);
    }

    public function testAnAccountWithNoNameFromTheProviderGetsAFriendlyFirstName(): void
    {
        $user = $this->social->signIn(new Identity('apple', 'a-002', 'kasia.nowak@example.com', true))['user'];
        self::assertSame('Kasia.nowak', $user['first_name']);
        $facebook = $this->social->signIn(new Identity('facebook', 'f-002', null, false))['user'];
        self::assertSame('Guest', $facebook['first_name']);
    }

    public function testFacebookWithoutAnEmailStillMakesAnAccountThatAsksForOneLater(): void
    {
        $result = $this->social->signIn(new Identity('facebook', 'f-100', null, false, 'Tunde', 'Bello'));
        $user = $result['user'];
        self::assertStringEndsWith('@' . UserRepository::PLACEHOLDER_EMAIL_DOMAIN, $user['email']);
        self::assertNull($user['email_verified_at']);
        self::assertSame(['provider' => 'facebook', 'needsEmail' => true], UserRepository::toPublic($user)['welcome']);
        self::assertSame([], $this->mailer->sent, 'nothing to send to yet');

        // The welcome step needs a real email, and refuses one that belongs to someone else.
        $base = ['phone' => '+2348031112222', 'accept_terms' => true];
        $this->member('taken@example.com');
        foreach ([[], ['email' => 'taken@example.com']] as $extra) {
            try {
                $this->social->completeWelcome($user, $base + $extra, '203.0.113.9');
                self::fail('Expected the email to be refused');
            } catch (ValidationError $e) {
                self::assertArrayHasKey('email', $e->errors);
            }
        }
        $public = $this->social->completeWelcome($user, $base + ['email' => 'Tunde@Example.com'], '203.0.113.9');
        self::assertSame('tunde@example.com', $public['email']);
        self::assertFalse($public['emailVerified']);
        self::assertNull($public['welcome']);
        self::assertStringContainsString('Confirm your email', $this->mailer->sent[0]['subject']);
    }

    public function testFacebookEmailStartsAnAccountButWaitsForConfirmation(): void
    {
        $user = $this->social->signIn(new Identity('facebook', 'f-200', 'tunde@example.com', false, 'Tunde', 'Bello'))['user'];
        self::assertSame('tunde@example.com', $user['email']);
        self::assertNull($user['email_verified_at']);
        self::assertStringContainsString('Confirm your email', $this->mailer->sent[0]['subject']);
    }

    public function testTheWelcomeStepSavesThePhoneBirthdayAndTermsAndFinishes(): void
    {
        $user = $this->social->signIn($this->google())['user'];
        $public = $this->social->completeWelcome($user, [
            'phone' => '+2348031234567', 'accept_terms' => true, 'birthday_day' => 14, 'birthday_month' => 7,
        ], '203.0.113.9');
        self::assertSame('+2348031234567', $public['phone']);
        self::assertSame('2000-07-14', $public['birthday']);
        self::assertNull($public['welcome']);
        $row = $this->users->find((int) $user['id']);
        self::assertNotNull($row['terms_accepted_at']);
        self::assertNotNull($row['onboarded_at']);
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'auth.welcome_completed' AND actor_user_id = ?", [$user['id']]));

        // Only once.
        try {
            $this->social->completeWelcome($row, ['phone' => '+2348031234567', 'accept_terms' => true], '203.0.113.9');
            self::fail('Expected a second finish to be refused');
        } catch (HttpError $e) {
            self::assertSame('nothing_to_finish', $e->errorCode);
        }
    }

    public function testTheWelcomeStepNeedsTheTermsAndRealDates(): void
    {
        $user = $this->social->signIn($this->google())['user'];
        $cases = [
            'accept_terms' => ['phone' => '+2348031234567', 'accept_terms' => false],
            'birthday_day (31 April)' => ['phone' => '+2348031234567', 'accept_terms' => true, 'birthday_day' => 31, 'birthday_month' => 4],
            'birthday_day (only a month)' => ['phone' => '+2348031234567', 'accept_terms' => true, 'birthday_month' => 4],
        ];
        foreach ($cases as $field => $data) {
            try {
                $this->social->completeWelcome($user, $data, '203.0.113.9');
                self::fail("Expected {$field} to be refused");
            } catch (ValidationError $e) {
                self::assertArrayHasKey(explode(' ', $field)[0], $e->errors);
            }
        }
        $leap = $this->social->completeWelcome($user, ['phone' => '+2348031234567', 'accept_terms' => true, 'birthday_day' => 29, 'birthday_month' => 2], '203.0.113.9');
        self::assertSame('2000-02-29', $leap['birthday'], '29 February is a real birthday');
    }

    public function testAReferralCodeWorksLikeOnEmailSignUp(): void
    {
        $friend = $this->member('friend@example.com');
        $user = $this->social->signIn($this->google('g-500', 'newbie@example.com'))['user'];
        $this->social->completeWelcome($user, [
            'phone' => '+2348039990000', 'accept_terms' => true, 'referral_code' => strtolower($friend['referral_code']),
            'device_id' => 'abcdef0123456789abcdef',
        ], '198.51.100.7');
        $row = $this->users->find((int) $user['id']);
        self::assertSame((int) $friend['id'], (int) $row['referred_by_user_id']);
        $referral = $this->db->one('SELECT * FROM referrals WHERE referred_user_id = ?', [$user['id']]);
        self::assertSame((int) $friend['id'], (int) $referral['referrer_user_id']);
        self::assertSame('pending', $referral['status'], 'rewarded only after the first completed order');
        self::assertSame('198.51.100.7', $referral['signup_ip']);
        self::assertSame('+2348039990000', $referral['referred_phone']);
        self::assertSame(64, strlen((string) $referral['device_hash']), 'a keyed hash of the device id, never the id');
    }

    public function testABadOrOwnReferralCodeIsRefused(): void
    {
        $user = $this->social->signIn($this->google())['user'];
        foreach (['NOSUCHCODE', $user['referral_code']] as $code) {
            try {
                $this->social->completeWelcome($user, ['phone' => '+2348031234567', 'accept_terms' => true, 'referral_code' => $code], '203.0.113.9');
                self::fail("Expected {$code} to be refused");
            } catch (ValidationError $e) {
                self::assertArrayHasKey('referral_code', $e->errors);
            }
        }
        self::assertSame(0, (int) $this->db->scalar('SELECT COUNT(*) FROM referrals WHERE referred_user_id = ?', [$user['id']]));
    }

    public function testOnlyOneWayInCannotBeDisconnectedUntilAPasswordIsSet(): void
    {
        $user = $this->social->signIn($this->google())['user'];
        try {
            $this->social->disconnect($user, 'google');
            self::fail('Expected the last sign-in method to be protected');
        } catch (HttpError $e) {
            self::assertSame('last_sign_in_method', $e->errorCode);
        }
        self::assertSame(1, $this->identityCount((int) $user['id']));

        $this->social->setPassword($user, 'Jollof&Pierogi-2026');
        $user = $this->users->find((int) $user['id']);
        self::assertStringStartsWith('$argon2id$', $user['password_hash']);
        $this->social->disconnect($user, 'google');
        self::assertSame(0, $this->identityCount((int) $user['id']));
    }

    public function testAProviderCanBeDisconnectedWhenAnotherWayInRemains(): void
    {
        $user = $this->social->signIn($this->google())['user'];
        $this->social->link($user, new Identity('facebook', 'f-900', 'ada@example.com', false));
        self::assertSame(2, $this->identityCount((int) $user['id']));
        $this->social->disconnect($user, 'facebook');
        self::assertSame(1, $this->identityCount((int) $user['id']));
        try {
            $this->social->disconnect($user, 'apple');
            self::fail('Expected a not-found');
        } catch (HttpError $e) {
            self::assertSame(404, $e->status);
        }
    }

    public function testSettingAPasswordFollowsThePolicyAndOnlyWorksOnce(): void
    {
        $user = $this->social->signIn($this->google())['user'];
        try {
            $this->social->setPassword($user, 'short');
            self::fail('Expected the weak password to be refused');
        } catch (ValidationError $e) {
            self::assertArrayHasKey('new_password', $e->errors);
        }
        $this->social->setPassword($user, 'Jollof&Pierogi-2026');
        try {
            $this->social->setPassword($this->users->find((int) $user['id']), 'Another&Pierogi-2027');
            self::fail('Expected a second set to be refused');
        } catch (HttpError $e) {
            self::assertSame('has_password', $e->errorCode);
        }
        // And they can now sign in with it.
        $this->session->remove('uid');
        $signedIn = $this->auth->login('ada@example.com', 'Jollof&Pierogi-2026', '203.0.113.9');
        self::assertSame('Ada', $signedIn['user']['firstName']);
    }

    public function testAProviderAccountThatBelongsToSomeoneElseCannotBeConnected(): void
    {
        $owner = $this->social->signIn($this->google('g-700', 'owner@example.com'))['user'];
        $other = $this->member('other@example.com');
        try {
            $this->social->link($other, $this->google('g-700', 'owner@example.com'));
            self::fail('Expected the connection to be refused');
        } catch (SocialError $e) {
            self::assertSame(SocialError::IN_USE, $e->reason);
        }
        self::assertSame(0, $this->identityCount((int) $other['id']));
        self::assertSame(1, $this->identityCount((int) $owner['id']));
    }

    public function testStaffCannotConnectAProviderOrSeeConnectionsEither(): void
    {
        $staff = $this->staff();
        try {
            $this->social->link($staff, $this->google('g-800', 'tomasz@smallafrica.test'));
            self::fail('Expected a refusal');
        } catch (SocialError $e) {
            self::assertSame(SocialError::STAFF, $e->reason);
        }
        $this->expectException(HttpError::class);
        $this->social->connections($staff);
    }

    public function testConnectionsListWhatIsConnectedAndWhetherThereIsAPassword(): void
    {
        $user = $this->social->signIn($this->google())['user'];
        $list = $this->social->connections($user);
        self::assertFalse($list['hasPassword']);
        self::assertSame('google', $list['identities'][0]['provider']);
        self::assertSame('ada@example.com', $list['identities'][0]['email']);
    }

    public function testAPasswordSignInIsNotPossibleOnAProviderOnlyAccount(): void
    {
        $this->social->signIn($this->google());
        $this->session->remove('uid');
        $this->expectException(HttpError::class);
        $this->auth->login('ada@example.com', 'Jollof&Pierogi-2026', '203.0.113.9');
    }

    public function testChangingAPasswordThatDoesNotExistPointsToSettingOne(): void
    {
        $user = $this->social->signIn($this->google())['user'];
        try {
            $this->auth->changePassword($user, 'anything', 'Jollof&Pierogi-2026');
            self::fail('Expected a validation error');
        } catch (ValidationError $e) {
            self::assertStringContainsString('no password yet', $e->errors['current_password']);
        }
    }
}
