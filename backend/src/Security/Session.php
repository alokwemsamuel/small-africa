<?php

declare(strict_types=1);

namespace App\Security;

/**
 * Session facade. Production uses PHP's native session with an httpOnly, Secure,
 * SameSite=Lax cookie; tests swap in the in-memory store.
 */
interface Session
{
    public function start(): void;

    public function get(string $key, mixed $default = null): mixed;

    public function set(string $key, mixed $value): void;

    public function remove(string $key): void;

    /** New session id, same data: call on every privilege change (login, 2FA, logout). */
    public function regenerate(): void;

    public function destroy(): void;
}
