<?php

declare(strict_types=1);

namespace App\Security;

/** Random tokens, hashing of one-time tokens, and AES-256-GCM for secrets at rest (e.g. TOTP seeds). */
final class Crypto
{
    private string $key;

    public function __construct(string $appKey)
    {
        $raw = str_starts_with($appKey, 'base64:') ? base64_decode(substr($appKey, 7), true) : false;
        if ($raw === false || strlen($raw) !== 32) {
            throw new \RuntimeException('APP_KEY must be "base64:" followed by 32 random bytes. Run: php bin/generate-key.php');
        }
        $this->key = $raw;
    }

    /** URL-safe random token with $bytes of entropy. */
    public static function token(int $bytes = 32): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    /** One-time tokens are stored only as SHA-256 hashes, so a database leak can't be replayed. */
    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /** Human-friendly code without ambiguous characters (0/O, 1/I/L). */
    public static function code(int $length, string $prefix = ''): string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $prefix . $out;
    }

    /**
     * Unforgeable, stable token for a value (e.g. a tracking link for an order reference).
     * Stateless: nothing is stored, and every link for the same value is identical.
     */
    public function mac(string $purpose, string $value): string
    {
        $raw = hash_hmac('sha256', $purpose . '|' . $value, $this->key, true);
        return rtrim(strtr(base64_encode(substr($raw, 0, 24)), '+/', '-_'), '=');
    }

    public function encrypt(string $plaintext): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new \RuntimeException('Encryption failed');
        }
        return base64_encode($iv . $tag . $cipher);
    }

    public function decrypt(string $encoded): string
    {
        $raw = base64_decode($encoded, true);
        if ($raw === false || strlen($raw) < 29) {
            throw new \RuntimeException('Invalid ciphertext');
        }
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        if ($plain === false) {
            throw new \RuntimeException('Decryption failed');
        }
        return $plain;
    }
}
