<?php

declare(strict_types=1);

namespace App\Social;

use App\Security\Crypto;
use App\Support\Clock;

/**
 * Remembers one sign-in attempt between the redirect to the provider and its answer: which provider,
 * the `state` and `nonce`, the PKCE verifier, and where to go afterwards. Sealed (encrypted and
 * authenticated with APP_KEY) in a short-lived HttpOnly cookie, so the browser can carry it but
 * can't read or change it.
 *
 * Why not the session? The session cookie is SameSite=Lax, and Apple answers with a cross-site
 * POST, which doesn't carry Lax cookies. This cookie is SameSite=None (over HTTPS), is only valid
 * for ten minutes, is single-use (cleared at the callback) and is only sent to the sign-in routes.
 */
final class OAuthCookie
{
    public const NAME = 'sa_oauth';
    public const LIFETIME_SECONDS = 600;

    public function __construct(private Crypto $crypto, private Clock $clock, private bool $secure)
    {
    }

    /** @param array<string, mixed> $payload */
    public function seal(array $payload): string
    {
        $payload['exp'] = $this->clock->now()->getTimestamp() + self::LIFETIME_SECONDS;
        return $this->crypto->encrypt(json_encode($payload, JSON_THROW_ON_ERROR));
    }

    /** @return array<string, mixed>|null null when it is missing, forged, damaged or older than ten minutes */
    public function open(?string $sealed): ?array
    {
        if ($sealed === null || $sealed === '') {
            return null;
        }
        try {
            $data = json_decode($this->crypto->decrypt($sealed), true, 8, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return null;
        }
        if (!is_array($data) || ($data['exp'] ?? 0) < $this->clock->now()->getTimestamp()) {
            return null;
        }
        return $data;
    }

    /** The Set-Cookie header: sets the cookie, or (with null) clears it. */
    public function header(?string $sealed, string $path): string
    {
        $parts = [
            self::NAME . '=' . ($sealed === null ? '' : rawurlencode($sealed)),
            'Path=' . $path,
            'Max-Age=' . ($sealed === null ? 0 : self::LIFETIME_SECONDS),
            'HttpOnly',
            'SameSite=' . ($this->secure ? 'None' : 'Lax'),
        ];
        if ($this->secure) {
            $parts[] = 'Secure';
        }
        return implode('; ', $parts);
    }
}
