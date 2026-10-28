<?php

declare(strict_types=1);

namespace App\Social;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\ValidationError;
use App\Repositories\UserRepository;
use App\Security\PasswordPolicy;
use App\Services\AuthService;
use App\Support\Clock;
use App\Support\Database;

/**
 * What a verified provider identity means for a Small Africa account. The provider part (talking to
 * Google, Apple or Facebook, checking tokens) is in the Provider classes; this is the rules:
 *
 *  - An identity we have seen before signs in to the account it belongs to.
 *  - A new identity whose email the provider CONFIRMS, and which matches an existing account, is
 *    linked to that account. If the provider doesn't confirm the email, nothing is linked: the
 *    customer signs in with their password first and connects the provider from their account.
 *  - Otherwise a new customer account is created (no password), who finishes the welcome step.
 *  - Staff and admin accounts never use social sign-in: they keep password plus two-step sign-in.
 */
final class SocialAuthService
{
    public function __construct(
        private Database $db,
        private UserRepository $users,
        private AuthService $auth,
        private AuditLogger $audit,
        private Clock $clock,
    ) {
    }

    /**
     * Signs the person in (creating or linking an account when needed).
     *
     * @return array{user: array<string, mixed>, isNew: bool} the user's database row
     * @throws SocialError
     */
    public function signIn(Identity $identity): array
    {
        $row = $this->identityRow($identity->provider, $identity->subject);
        if ($row !== null) {
            $user = $this->users->find((int) $row['user_id']) ?? throw new SocialError(SocialError::FAILED);
            $this->guard($user);
            $this->db->run('UPDATE user_identities SET last_used_at = ?, email = ? WHERE id = ?', [$this->clock->sql(), $identity->email, $row['id']]);
            $this->audit->record((int) $user['id'], 'auth.social_login', 'user', (int) $user['id'], ['provider' => $identity->provider]);
            $this->auth->signInAs($user);
            return ['user' => $user, 'isNew' => false];
        }

        $existing = $identity->email !== null ? $this->users->findByEmail($identity->email) : null;
        if ($existing !== null) {
            $this->guard($existing);
            if (!$identity->emailVerified) {
                throw new SocialError(SocialError::EMAIL_UNVERIFIED);
            }
            $this->attach($existing, $identity);
            if ($existing['email_verified_at'] === null) {
                // The provider confirmed this address, so it is confirmed here too.
                $this->users->update((int) $existing['id'], ['email_verified_at' => $this->clock->sql()]);
                $existing = $this->users->find((int) $existing['id']);
            }
            $this->audit->record((int) $existing['id'], 'auth.social_link', 'user', (int) $existing['id'], ['provider' => $identity->provider]);
            $this->auth->signInAs($existing);
            return ['user' => $existing, 'isNew' => false];
        }

        $user = $this->createCustomer($identity);
        $this->audit->record((int) $user['id'], 'auth.register', 'user', (int) $user['id'], ['provider' => $identity->provider]);
        $this->audit->record((int) $user['id'], 'auth.social_login', 'user', (int) $user['id'], ['provider' => $identity->provider]);
        $this->auth->signInAs($user);
        return ['user' => $user, 'isNew' => true];
    }

    /**
     * Connects a provider to the signed-in customer's account (from the account page).
     *
     * @param array<string, mixed> $user
     * @throws SocialError
     */
    public function link(array $user, Identity $identity): void
    {
        $this->guard($user);
        $row = $this->identityRow($identity->provider, $identity->subject);
        if ($row !== null) {
            if ((int) $row['user_id'] !== (int) $user['id']) {
                throw new SocialError(SocialError::IN_USE);
            }
            $this->db->run('UPDATE user_identities SET last_used_at = ?, email = ? WHERE id = ?', [$this->clock->sql(), $identity->email, $row['id']]);
            return;
        }
        $this->attach($user, $identity);
        $this->audit->record((int) $user['id'], 'auth.social_connected', 'user', (int) $user['id'], ['provider' => $identity->provider]);
    }

    /**
     * Disconnects a provider, unless it is the customer's only way to sign in.
     *
     * @param array<string, mixed> $user
     */
    public function disconnect(array $user, string $provider): void
    {
        $this->assertCustomer($user);
        $row = $this->db->one('SELECT id FROM user_identities WHERE user_id = ? AND provider = ?', [$user['id'], $provider]);
        if ($row === null) {
            throw HttpError::notFound('That account isn’t connected.');
        }
        $methods = (int) $this->db->scalar('SELECT COUNT(*) FROM user_identities WHERE user_id = ?', [$user['id']])
            + ($user['password_hash'] !== null ? 1 : 0);
        if ($methods <= 1) {
            throw HttpError::conflict('This is your only way to sign in. Set a password first, then you can disconnect it.', 'last_sign_in_method');
        }
        $this->db->run('DELETE FROM user_identities WHERE id = ?', [$row['id']]);
        $this->audit->record((int) $user['id'], 'auth.social_disconnected', 'user', (int) $user['id'], ['provider' => $provider]);
    }

    /**
     * @param array<string, mixed> $user
     * @return array{identities: list<array<string, mixed>>, hasPassword: bool}
     */
    public function connections(array $user): array
    {
        $this->assertCustomer($user);
        $rows = $this->db->all('SELECT provider, email, created_at, last_used_at FROM user_identities WHERE user_id = ? ORDER BY created_at', [$user['id']]);
        return [
            'identities' => array_map(static fn (array $r): array => [
                'provider' => $r['provider'], 'email' => $r['email'], 'connectedAt' => $r['created_at'], 'lastUsedAt' => $r['last_used_at'],
            ], $rows),
            'hasPassword' => $user['password_hash'] !== null,
        ];
    }

    /**
     * Gives a customer who signed up with a provider a password, so they can also sign in with their
     * email (and disconnect the provider later if they want to).
     *
     * @param array<string, mixed> $user
     */
    public function setPassword(array $user, string $password): void
    {
        $this->assertCustomer($user);
        if ($user['password_hash'] !== null) {
            throw HttpError::conflict('You already have a password. Use “Change password” instead.', 'has_password');
        }
        $problems = PasswordPolicy::problems($password, [$user['first_name'], $user['last_name'], strstr($user['email'], '@', true) ?: '']);
        if ($problems) {
            throw ValidationError::field('new_password', implode(' ', $problems));
        }
        $this->users->update((int) $user['id'], ['password_hash' => PasswordPolicy::hash($password)]);
        $this->audit->record((int) $user['id'], 'auth.password_set', 'user', (int) $user['id']);
    }

    /**
     * The "welcome" step after a first sign-up with a provider: the phone number (for deliveries and
     * reservation reminders), the Terms, and the optional birthday and referral code.
     *
     * @param array<string, mixed> $user
     * @param array<string, mixed> $data validated input (phone, accept_terms, birthday_day, birthday_month, referral_code, device_id, email)
     * @return array<string, mixed> the public user
     */
    public function completeWelcome(array $user, array $data, string $ip): array
    {
        if (($user['signup_provider'] ?? null) === null || $user['onboarded_at'] !== null) {
            throw HttpError::conflict('There is nothing left to finish.', 'nothing_to_finish');
        }
        if (($data['accept_terms'] ?? false) !== true) {
            throw ValidationError::field('accept_terms', 'Please accept the Terms, Privacy Policy and Rewards Terms to continue.');
        }
        $now = $this->clock->sql();
        $fields = ['phone' => $data['phone'], 'terms_accepted_at' => $now, 'onboarded_at' => $now];

        $needsEmail = str_ends_with((string) $user['email'], '@' . UserRepository::PLACEHOLDER_EMAIL_DOMAIN);
        if ($needsEmail) {
            $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
            if ($email === '') {
                throw ValidationError::field('email', 'Enter your email address.');
            }
            if ($this->users->findByEmail($email) !== null) {
                throw ValidationError::field('email', 'An account with this email already exists. Sign in to that account, then connect this one from your account page.');
            }
            $fields['email'] = $email;
            $fields['email_verified_at'] = null;
        }

        $day = $data['birthday_day'] ?? null;
        $month = $data['birthday_month'] ?? null;
        if (($day === null) !== ($month === null)) {
            throw ValidationError::field('birthday_day', 'Choose both the day and the month, or leave both empty.');
        }
        if ($day !== null) {
            // Day and month only: 2000 is a leap year, so 29 February is a valid birthday.
            if (!checkdate((int) $month, (int) $day, 2000)) {
                throw ValidationError::field('birthday_day', 'That date doesn’t exist.');
            }
            $fields['birthday'] = sprintf('2000-%02d-%02d', (int) $month, (int) $day);
        }

        $referrer = null;
        if (!empty($data['referral_code'])) {
            $referrer = $this->users->findByReferralCode((string) $data['referral_code']);
            if ($referrer === null || (int) $referrer['id'] === (int) $user['id']) {
                throw ValidationError::field('referral_code', 'That referral code isn’t valid.');
            }
        }

        $this->db->transaction(function () use ($user, $fields, $referrer, $data, $ip): void {
            if ($referrer !== null) {
                $fields['referred_by_user_id'] = $referrer['id'];
            }
            $this->users->update((int) $user['id'], $fields);
            if ($referrer !== null) {
                $this->auth->recordReferral((int) $referrer['id'], (int) $user['id'], $data['device_id'] ?? null, $ip, $data['phone']);
            }
        });
        $fresh = $this->users->find((int) $user['id']);
        if ($needsEmail) {
            $this->auth->sendVerification($fresh);
        }
        $this->audit->record((int) $user['id'], 'auth.welcome_completed', 'user', (int) $user['id']);
        return UserRepository::toPublic($fresh);
    }

    /** @return array<string, mixed>|null */
    private function identityRow(string $provider, string $subject): ?array
    {
        return $this->db->one('SELECT * FROM user_identities WHERE provider = ? AND provider_user_id = ?', [$provider, $subject]);
    }

    /** @param array<string, mixed> $user @throws SocialError */
    private function guard(array $user): void
    {
        if (in_array($user['role'], AuthService::STAFF_ROLES, true)) {
            throw new SocialError(SocialError::STAFF);
        }
        if (!(bool) $user['is_active']) {
            throw new SocialError(SocialError::INACTIVE);
        }
    }

    /** @param array<string, mixed> $user */
    private function assertCustomer(array $user): void
    {
        if (in_array($user['role'], AuthService::STAFF_ROLES, true)) {
            throw HttpError::forbidden('Staff accounts sign in with email, password and two-step verification.');
        }
    }

    /** @param array<string, mixed> $user @throws SocialError */
    private function attach(array $user, Identity $identity): void
    {
        $already = $this->db->scalar('SELECT 1 FROM user_identities WHERE user_id = ? AND provider = ?', [$user['id'], $identity->provider]);
        if ($already) {
            // A different account at the same provider is already connected to this customer.
            throw new SocialError(SocialError::IN_USE);
        }
        $this->db->insert('user_identities', [
            'user_id' => $user['id'],
            'provider' => $identity->provider,
            'provider_user_id' => $identity->subject,
            'email' => $identity->email,
            'last_used_at' => $this->clock->sql(),
        ]);
    }

    /** @return array<string, mixed> */
    private function createCustomer(Identity $identity): array
    {
        $email = $identity->email;
        $placeholder = $email === null || $email === '';
        if ($placeholder) {
            // Facebook may give no email. The account still gets made; the welcome step asks for one.
            $email = sprintf('%s-%s@%s', $identity->provider, substr(hash('sha256', $identity->subject), 0, 16), UserRepository::PLACEHOLDER_EMAIL_DOMAIN);
        }
        $first = mb_substr(trim($identity->firstName), 0, 80);
        if ($first === '') {
            $local = $placeholder ? '' : ucfirst((string) strstr($email, '@', true));
            $first = mb_substr($local !== '' ? $local : 'Guest', 0, 80);
        }
        $last = mb_substr(trim($identity->lastName), 0, 80);

        $id = $this->db->transaction(function () use ($identity, $email, $placeholder, $first, $last): int {
            $id = $this->users->create([
                'role' => 'customer',
                'first_name' => $first,
                'last_name' => $last,
                'email' => $email,
                'phone' => null,
                'password_hash' => null,
                'signup_provider' => $identity->provider,
                'email_verified_at' => !$placeholder && $identity->emailVerified ? $this->clock->sql() : null,
                'referral_code' => $this->auth->newReferralCode($first),
                'marketing_opt_in' => 0,
            ]);
            $this->db->insert('loyalty_accounts', ['user_id' => $id]);
            $this->db->insert('user_identities', [
                'user_id' => $id,
                'provider' => $identity->provider,
                'provider_user_id' => $identity->subject,
                'email' => $identity->email,
                'last_used_at' => $this->clock->sql(),
            ]);
            return $id;
        });
        $user = $this->users->find($id);
        if (!$placeholder && !$identity->emailVerified) {
            $this->auth->sendVerification($user);
        }
        return $user;
    }
}
