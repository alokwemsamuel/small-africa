<?php

declare(strict_types=1);

namespace App\Social;

/** One sign-in provider (Google, Apple or Facebook). Implementations wrap a maintained OAuth library. */
interface Provider
{
    public function name(): string;

    /**
     * Where to send the browser to sign in.
     *
     * @return array{url: string, pkceVerifier: ?string} the verifier is kept (sealed) until the callback
     */
    public function start(string $redirectUri, string $state, string $nonce): array;

    /**
     * Turns the answer from the provider into a verified Identity, talking to the provider from the
     * server: the code is exchanged here, and nothing the browser sends is trusted for who someone is.
     *
     * @param array<string, mixed> $posted extra fields the provider sent (Apple's first-sign-in name)
     * @throws SocialError
     */
    public function finish(string $redirectUri, string $code, ?string $pkceVerifier, string $nonce, array $posted): Identity;
}
