<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Support\Database;

final class UserRepository
{
    private const UPDATABLE = [
        'first_name', 'last_name', 'phone', 'password_hash', 'email_verified_at', 'birthday', 'favourite_kitchen_id',
        'marketing_opt_in', 'theme_preference', 'totp_secret_enc', 'totp_enabled_at', 'totp_last_used_step', 'failed_logins',
        'locked_until', 'last_login_at', 'is_active', 'role', 'staff_position',
        // Finishing the welcome step after a social sign-up.
        'email', 'referred_by_user_id', 'onboarded_at', 'terms_accepted_at',
    ];

    /** Stands in for an email address a provider (Facebook) didn't give us, until the customer adds one. */
    public const PLACEHOLDER_EMAIL_DOMAIN = 'noemail.smallafrica.invalid';

    public function __construct(private Database $db)
    {
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        return $this->db->one('SELECT * FROM users WHERE id = ?', [$id]);
    }

    /** @return array<string, mixed>|null */
    public function findByEmail(string $email): ?array
    {
        return $this->db->one('SELECT * FROM users WHERE email = ?', [mb_strtolower(trim($email))]);
    }

    /** @return array<string, mixed>|null */
    public function findByReferralCode(string $code): ?array
    {
        return $this->db->one('SELECT * FROM users WHERE referral_code = ? AND is_active = 1', [strtoupper(trim($code))]);
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        return $this->db->insert('users', $data);
    }

    /** @param array<string, mixed> $fields */
    public function update(int $id, array $fields): void
    {
        $sets = [];
        $params = [];
        foreach ($fields as $col => $value) {
            if (!in_array($col, self::UPDATABLE, true)) {
                throw new \InvalidArgumentException("Column {$col} is not updatable");
            }
            $sets[] = "{$col} = ?";
            $params[] = $value;
        }
        if (!$sets) {
            return;
        }
        $params[] = $id;
        $this->db->run('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
    }

    public function bumpSessionVersion(int $id): int
    {
        $this->db->run('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [$id]);
        return (int) $this->db->scalar('SELECT session_version FROM users WHERE id = ?', [$id]);
    }

    public function referralCodeExists(string $code): bool
    {
        return (bool) $this->db->scalar('SELECT 1 FROM users WHERE referral_code = ?', [$code]);
    }

    /**
     * Shape returned to the client. Never includes hashes, secrets or lockout counters.
     *
     * @param array<string, mixed> $u
     * @return array<string, mixed>
     */
    public static function toPublic(array $u): array
    {
        return [
            'id' => (int) $u['id'],
            'firstName' => $u['first_name'],
            'lastName' => $u['last_name'],
            'email' => $u['email'],
            'phone' => $u['phone'],
            'role' => $u['role'],
            'staffPosition' => $u['staff_position'],
            'emailVerified' => $u['email_verified_at'] !== null,
            'birthday' => $u['birthday'],
            'favouriteKitchenId' => $u['favourite_kitchen_id'] !== null ? (int) $u['favourite_kitchen_id'] : null,
            'referralCode' => $u['referral_code'],
            'marketingOptIn' => (bool) $u['marketing_opt_in'],
            'themePreference' => $u['theme_preference'] ?? null,
            'twoFactorEnabled' => $u['totp_enabled_at'] !== null,
            // Set after a social sign-up until the welcome step (phone, terms) is finished.
            'welcome' => ($u['signup_provider'] ?? null) !== null && ($u['onboarded_at'] ?? null) === null
                ? ['provider' => $u['signup_provider'], 'needsEmail' => str_ends_with((string) $u['email'], '@' . self::PLACEHOLDER_EMAIL_DOMAIN)]
                : null,
            'hasPassword' => $u['password_hash'] !== null,
            'createdAt' => $u['created_at'],
        ];
    }
}
