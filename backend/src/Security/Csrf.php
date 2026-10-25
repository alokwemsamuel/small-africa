<?php

declare(strict_types=1);

namespace App\Security;

/**
 * Synchronizer-token CSRF protection. The token lives in the session and the SPA sends it
 * back in the X-CSRF-Token header on every state-changing request.
 */
final class Csrf
{
    private const KEY = '_csrf';

    public function __construct(private Session $session)
    {
    }

    public function token(): string
    {
        $token = $this->session->get(self::KEY);
        if (!is_string($token) || $token === '') {
            $token = Crypto::token(32);
            $this->session->set(self::KEY, $token);
        }
        return $token;
    }

    public function isValid(?string $provided): bool
    {
        $expected = $this->session->get(self::KEY);
        return is_string($expected) && $expected !== '' && is_string($provided) && hash_equals($expected, $provided);
    }

    /** Called after login/logout so a token seen before authentication can't be reused. */
    public function rotate(): string
    {
        $this->session->remove(self::KEY);
        return $this->token();
    }
}
