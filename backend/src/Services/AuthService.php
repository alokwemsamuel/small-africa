<?php

declare(strict_types=1);

namespace App\Services;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\ValidationError;
use App\Mail\EmailTemplates;
use App\Mail\Mailer;
use App\Repositories\UserRepository;
use App\Security\Crypto;
use App\Security\Csrf;
use App\Security\PasswordPolicy;
use App\Security\RateLimiter;
use App\Security\Session;
use App\Security\Totp;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Logger;

final class AuthService
{
    public const MAX_FAILED_LOGINS = 5;
    public const LOCKOUT_MINUTES = 15;
    public const STAFF_ROLES = ['super_admin', 'manager', 'staff'];

    /** Hash of a random string: verified against when the email doesn't exist so timing matches. */
    private const DUMMY_HASH = '$argon2id$v=19$m=65536,t=4,p=1$Lk5XQ0FFNkNyLnhBMjJ5Tg$kei24QoDEiijkUz6jktP4x9hD+fQxARlrLMWsKJvkz4';

    public function __construct(
        private Database $db,
        private UserRepository $users,
        private Session $session,
        private Csrf $csrf,
        private RateLimiter $limiter,
        private Mailer $mailer,
        private EmailTemplates $emails,
        private AuditLogger $audit,
        private Crypto $crypto,
        private Clock $clock,
        private Logger $logger,
    ) {
    }

    /**
     * @param array{first_name: string, last_name: string, email: string, phone: ?string, password: string, referral_code?: ?string, marketing_opt_in?: bool} $data
     * @return array<string, mixed> public user
     */
    public function register(array $data, string $ip): array
    {
        $this->limiter->hit("register:ip:{$ip}", 5, 3600);

        $problems = PasswordPolicy::problems($data['password'], [$data['first_name'], $data['last_name'], strstr($data['email'], '@', true) ?: '']);
        if ($problems) {
            throw ValidationError::field('password', implode(' ', $problems));
        }
        if ($this->users->findByEmail($data['email'])) {
            throw ValidationError::field('email', 'An account with this email already exists. Try signing in or resetting your password.');
        }
        $referrer = null;
        if (!empty($data['referral_code'])) {
            $referrer = $this->users->findByReferralCode($data['referral_code']);
            if ($referrer === null) {
                throw ValidationError::field('referral_code', 'That referral code isn’t valid.');
            }
        }

        $userId = $this->db->transaction(function () use ($data, $referrer, $ip): int {
            $id = $this->users->create([
                'role' => 'customer',
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'password_hash' => PasswordPolicy::hash($data['password']),
                'referral_code' => $this->newReferralCode($data['first_name']),
                'referred_by_user_id' => $referrer['id'] ?? null,
                'marketing_opt_in' => !empty($data['marketing_opt_in']) ? 1 : 0,
            ]);
            $this->db->insert('loyalty_accounts', ['user_id' => $id]);
            if ($referrer) {
                // Rewarded only after the friend's first completed order (Interest Account rules).
                $this->db->insert('referrals', [
                    'referrer_user_id' => $referrer['id'],
                    'referred_user_id' => $id,
                    'signup_ip' => $ip,
                ]);
            }
            return $id;
        });

        $user = $this->users->find($userId);
        $this->sendVerification($user);
        $this->audit->record($userId, 'auth.register', 'user', $userId);
        $this->establishSession($user);
        return UserRepository::toPublic($user);
    }

    /** @return array{user?: array<string, mixed>, twoFactorRequired?: bool} */
    public function login(string $email, string $password, string $ip): array
    {
        $email = mb_strtolower(trim($email));
        $this->limiter->hit("login:ip:{$ip}", 20, 600);
        $this->limiter->hit('login:email:' . hash('sha256', $email), 10, 900);

        $user = $this->users->findByEmail($email);
        $now = $this->clock->now();

        if ($user && $user['locked_until'] && $user['locked_until'] > $this->clock->sql($now)) {
            PasswordPolicy::verify($password, self::DUMMY_HASH);
            throw new HttpError(423, 'This account is temporarily locked after several failed sign-in attempts. Try again in 15 minutes or reset your password.', 'account_locked');
        }

        $valid = PasswordPolicy::verify($password, $user['password_hash'] ?? self::DUMMY_HASH);
        if (!$user || !$valid || !$user['is_active']) {
            if ($user) {
                $this->recordFailedLogin($user);
            }
            throw new HttpError(401, 'That email and password combination didn’t work.', 'invalid_credentials');
        }

        $fields = ['failed_logins' => 0, 'locked_until' => null];
        if (PasswordPolicy::needsRehash($user['password_hash'])) {
            $fields['password_hash'] = PasswordPolicy::hash($password);
        }
        $this->users->update((int) $user['id'], $fields);

        if ($user['totp_enabled_at'] !== null) {
            $this->session->regenerate();
            $this->session->set('pending_2fa_uid', (int) $user['id']);
            $this->session->set('pending_2fa_at', $now->getTimestamp());
            return ['twoFactorRequired' => true];
        }

        $this->establishSession($user);
        $this->audit->record((int) $user['id'], 'auth.login', 'user', $user['id']);
        return ['user' => UserRepository::toPublic($this->users->find((int) $user['id']))];
    }

    /** @return array<string, mixed> public user */
    public function completeTwoFactor(string $code, string $ip): array
    {
        $uid = $this->session->get('pending_2fa_uid');
        $startedAt = (int) $this->session->get('pending_2fa_at', 0);
        if (!is_int($uid) || $this->clock->now()->getTimestamp() - $startedAt > 300) {
            $this->session->remove('pending_2fa_uid');
            throw HttpError::unauthorized('Your sign-in expired. Please enter your email and password again.');
        }
        $this->limiter->hit("2fa:uid:{$uid}", 5, 300);

        $user = $this->users->find($uid);
        $step = $user ? $this->verifyTotp($user, $code) : null;
        if ($step === null) {
            $this->audit->record($uid, 'auth.2fa_failed', 'user', $uid, ['ip' => $ip]);
            throw ValidationError::field('code', 'That code didn’t match. Check your authenticator app and try again.');
        }
        $this->users->update($uid, ['totp_last_used_step' => $step]);
        $this->session->remove('pending_2fa_uid');
        $this->session->remove('pending_2fa_at');
        $this->establishSession($user);
        $this->audit->record($uid, 'auth.login', 'user', $uid, ['2fa' => true]);
        return UserRepository::toPublic($this->users->find($uid));
    }

    public function logout(?int $userId): void
    {
        if ($userId) {
            $this->audit->record($userId, 'auth.logout', 'user', $userId);
        }
        $this->session->destroy();
    }

    /** Resolves the signed-in user from the session, or null. Invalidated sessions are cleared. */
    public function currentUser(): ?array
    {
        $uid = $this->session->get('uid');
        if (!is_int($uid)) {
            return null;
        }
        $user = $this->users->find($uid);
        if (!$user || !$user['is_active'] || (int) $user['session_version'] !== (int) $this->session->get('sv')) {
            $this->session->remove('uid');
            $this->session->remove('sv');
            return null;
        }
        return $user;
    }

    /** Always succeeds from the caller's view, so the endpoint can't be used to discover accounts. */
    public function requestPasswordReset(string $email, string $ip): void
    {
        $this->limiter->hit("reset:ip:{$ip}", 5, 900);
        $this->limiter->hit('reset:email:' . hash('sha256', mb_strtolower($email)), 3, 3600);
        $user = $this->users->findByEmail($email);
        if (!$user || !$user['is_active']) {
            return;
        }
        $token = Crypto::token();
        $this->db->run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [$this->clock->sql(), $user['id']]);
        $this->db->insert('password_resets', [
            'user_id' => $user['id'],
            'token_hash' => Crypto::hashToken($token),
            'expires_at' => $this->clock->sql($this->clock->now()->modify('+60 minutes')),
        ]);
        $mail = $this->emails->passwordReset($user['first_name'], $token);
        $this->deliver($user, $mail);
        $this->audit->record((int) $user['id'], 'auth.password_reset_requested', 'user', $user['id']);
    }

    public function resetPassword(string $token, string $password, string $ip): void
    {
        $this->limiter->hit("reset-complete:ip:{$ip}", 10, 900);
        $row = $this->db->one(
            'SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
            [Crypto::hashToken($token), $this->clock->sql()],
        );
        if (!$row) {
            throw HttpError::badRequest('This reset link is invalid or has expired. Please request a new one.', 'invalid_token');
        }
        $user = $this->users->find((int) $row['user_id']);
        $problems = PasswordPolicy::problems($password, [$user['first_name'], $user['last_name'], strstr($user['email'], '@', true) ?: '']);
        if ($problems) {
            throw ValidationError::field('password', implode(' ', $problems));
        }
        $this->db->transaction(function () use ($row, $user, $password): void {
            $this->db->run('UPDATE password_resets SET used_at = ? WHERE id = ?', [$this->clock->sql(), $row['id']]);
            $this->users->update((int) $user['id'], [
                'password_hash' => PasswordPolicy::hash($password),
                'failed_logins' => 0,
                'locked_until' => null,
                // Following the emailed link proves ownership of the address.
                'email_verified_at' => $user['email_verified_at'] ?? $this->clock->sql(),
            ]);
            $this->users->bumpSessionVersion((int) $user['id']);
        });
        $this->deliver($user, $this->emails->passwordChanged($user['first_name']));
        $this->audit->record((int) $user['id'], 'auth.password_reset', 'user', $user['id']);
    }

    /** @param array<string, mixed> $user */
    public function changePassword(array $user, string $current, string $new): void
    {
        $this->limiter->hit("change-password:uid:{$user['id']}", 5, 900);
        if (!PasswordPolicy::verify($current, $user['password_hash'])) {
            throw ValidationError::field('current_password', 'Your current password is incorrect.');
        }
        $problems = PasswordPolicy::problems($new, [$user['first_name'], $user['last_name'], strstr($user['email'], '@', true) ?: '']);
        if ($problems) {
            throw ValidationError::field('new_password', implode(' ', $problems));
        }
        $this->users->update((int) $user['id'], ['password_hash' => PasswordPolicy::hash($new)]);
        // Sign out every other device; keep this one.
        $version = $this->users->bumpSessionVersion((int) $user['id']);
        $this->session->regenerate();
        $this->session->set('sv', $version);
        $this->deliver($user, $this->emails->passwordChanged($user['first_name']));
        $this->audit->record((int) $user['id'], 'auth.password_changed', 'user', $user['id']);
    }

    public function verifyEmail(string $token): void
    {
        $row = $this->db->one(
            'SELECT * FROM email_verifications WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
            [Crypto::hashToken($token), $this->clock->sql()],
        );
        if (!$row) {
            throw HttpError::badRequest('This confirmation link is invalid or has expired. Sign in to request a new one.', 'invalid_token');
        }
        $this->db->transaction(function () use ($row): void {
            $this->db->run('UPDATE email_verifications SET used_at = ? WHERE id = ?', [$this->clock->sql(), $row['id']]);
            $this->db->run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', [$this->clock->sql(), $row['user_id']]);
        });
        $this->audit->record((int) $row['user_id'], 'auth.email_verified', 'user', $row['user_id']);
    }

    /** @param array<string, mixed> $user */
    public function resendVerification(array $user): void
    {
        if ($user['email_verified_at'] !== null) {
            return;
        }
        $this->limiter->hit("verify-resend:uid:{$user['id']}", 3, 3600);
        $this->sendVerification($user);
    }

    /** @param array<string, mixed> $user  @return array{secret: string, otpauthUri: string} */
    public function beginTwoFactorSetup(array $user): array
    {
        if (!in_array($user['role'], self::STAFF_ROLES, true)) {
            throw HttpError::forbidden('Two-factor authentication is available for staff accounts.');
        }
        if ($user['totp_enabled_at'] !== null) {
            throw HttpError::conflict('Two-factor authentication is already on.');
        }
        $secret = Totp::generateSecret();
        $this->session->set('pending_totp_secret', $this->crypto->encrypt($secret));
        return ['secret' => $secret, 'otpauthUri' => Totp::provisioningUri($secret, $user['email'])];
    }

    /** @param array<string, mixed> $user */
    public function confirmTwoFactorSetup(array $user, string $code): void
    {
        $enc = $this->session->get('pending_totp_secret');
        if (!is_string($enc)) {
            throw HttpError::badRequest('Start two-factor setup again.');
        }
        $secret = $this->crypto->decrypt($enc);
        $step = Totp::verify($secret, $code, $this->clock->now()->getTimestamp());
        if ($step === null) {
            throw ValidationError::field('code', 'That code didn’t match. Make sure your phone’s clock is set automatically.');
        }
        $this->users->update((int) $user['id'], [
            'totp_secret_enc' => $enc,
            'totp_enabled_at' => $this->clock->sql(),
            'totp_last_used_step' => $step,
        ]);
        $this->session->remove('pending_totp_secret');
        $this->audit->record((int) $user['id'], 'auth.2fa_enabled', 'user', $user['id']);
    }

    /** @param array<string, mixed> $user */
    public function disableTwoFactor(array $user, string $password, string $code): void
    {
        $this->limiter->hit("2fa-disable:uid:{$user['id']}", 5, 900);
        if (!PasswordPolicy::verify($password, $user['password_hash'])) {
            throw ValidationError::field('password', 'Your password is incorrect.');
        }
        if ($this->verifyTotp($user, $code) === null) {
            throw ValidationError::field('code', 'That code didn’t match.');
        }
        $this->users->update((int) $user['id'], ['totp_secret_enc' => null, 'totp_enabled_at' => null, 'totp_last_used_step' => null]);
        $this->audit->record((int) $user['id'], 'auth.2fa_disabled', 'user', $user['id']);
    }

    /** @param array<string, mixed> $user */
    private function verifyTotp(array $user, string $code): ?int
    {
        if (!$user['totp_secret_enc']) {
            return null;
        }
        $secret = $this->crypto->decrypt($user['totp_secret_enc']);
        $last = $user['totp_last_used_step'] !== null ? (int) $user['totp_last_used_step'] : null;
        return Totp::verify($secret, $code, $this->clock->now()->getTimestamp(), $last);
    }

    /** @param array<string, mixed> $user */
    private function establishSession(array $user): void
    {
        $this->session->regenerate();
        $this->session->set('uid', (int) $user['id']);
        $this->session->set('sv', (int) $user['session_version']);
        $this->session->set('auth_at', $this->clock->now()->getTimestamp());
        $this->csrf->rotate();
        $this->users->update((int) $user['id'], ['last_login_at' => $this->clock->sql()]);
    }

    /** @param array<string, mixed> $user */
    private function recordFailedLogin(array $user): void
    {
        $failed = (int) $user['failed_logins'] + 1;
        $fields = ['failed_logins' => $failed];
        if ($failed >= self::MAX_FAILED_LOGINS) {
            $fields['locked_until'] = $this->clock->sql($this->clock->now()->modify('+' . self::LOCKOUT_MINUTES . ' minutes'));
            $fields['failed_logins'] = 0;
            $this->audit->record((int) $user['id'], 'auth.account_locked', 'user', $user['id']);
        }
        $this->users->update((int) $user['id'], $fields);
    }

    /** @param array<string, mixed> $user */
    private function sendVerification(array $user): void
    {
        $token = Crypto::token();
        $this->db->insert('email_verifications', [
            'user_id' => $user['id'],
            'token_hash' => Crypto::hashToken($token),
            'expires_at' => $this->clock->sql($this->clock->now()->modify('+24 hours')),
        ]);
        $this->deliver($user, $this->emails->verifyEmail($user['first_name'], $token));
    }

    /**
     * Email failures must not break the request (the user can resend), but they are logged.
     *
     * @param array<string, mixed> $user
     * @param array{subject: string, html: string, text: string} $mail
     */
    private function deliver(array $user, array $mail): void
    {
        try {
            $this->mailer->send($user['email'], $user['first_name'] . ' ' . $user['last_name'], $mail['subject'], $mail['html'], $mail['text']);
        } catch (\Throwable $e) {
            $this->logger->error('Email delivery failed', ['to_user' => $user['id'], 'subject' => $mail['subject'], 'error' => $e->getMessage()]);
        }
    }

    private function newReferralCode(string $firstName): string
    {
        $base = strtoupper(preg_replace('/[^A-Za-z]/', '', $firstName)) ?: 'GUEST';
        $base = substr($base, 0, 8);
        do {
            $code = $base . random_int(1000, 9999);
        } while ($this->users->referralCodeExists($code));
        return $code;
    }
}
