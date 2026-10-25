<?php

declare(strict_types=1);

namespace App\Security;

/**
 * Strong-password rules shared by sign-up, reset and change-password. The frontend mirrors
 * these in Zod, but the server is the authority.
 */
final class PasswordPolicy
{
    public const MIN_LENGTH = 10;
    public const MAX_LENGTH = 128;

    private const COMMON = [
        'password', 'password1', 'password123', '1234567890', '12345678910', 'qwertyuiop', 'iloveyou12',
        'smallafrica', 'smallafrica1', 'welcome123', 'letmein123', 'admin12345', 'abcdefghij', 'naija12345',
    ];

    /**
     * @param list<string> $personal values the password must not contain (name, email local part)
     * @return list<string> problems; empty when the password is acceptable
     */
    public static function problems(string $password, array $personal = []): array
    {
        $problems = [];
        $len = mb_strlen($password);
        if ($len < self::MIN_LENGTH) {
            $problems[] = 'Use at least ' . self::MIN_LENGTH . ' characters.';
        }
        if ($len > self::MAX_LENGTH) {
            $problems[] = 'Use at most ' . self::MAX_LENGTH . ' characters.';
        }
        $classes = (int) preg_match('/[a-z]/', $password) + (int) preg_match('/[A-Z]/', $password)
            + (int) preg_match('/\d/', $password) + (int) preg_match('/[^a-zA-Z\d]/', $password);
        if ($classes < 3) {
            $problems[] = 'Mix at least three of: lowercase, uppercase, numbers and symbols.';
        }
        $lower = mb_strtolower($password);
        if (in_array($lower, self::COMMON, true) || preg_match('/^(.)\1+$/', $password)) {
            $problems[] = 'That password is too common. Choose something more unique.';
        }
        foreach ($personal as $value) {
            $value = mb_strtolower(trim($value));
            if (mb_strlen($value) >= 4 && str_contains($lower, $value)) {
                $problems[] = 'Don’t include your name or email in your password.';
                break;
            }
        }
        return $problems;
    }

    public static function hash(string $password): string
    {
        return password_hash($password, PASSWORD_ARGON2ID);
    }

    public static function verify(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public static function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_ARGON2ID);
    }
}
