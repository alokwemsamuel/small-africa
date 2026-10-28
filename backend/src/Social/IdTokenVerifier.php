<?php

declare(strict_types=1);

namespace App\Social;

use App\Support\Clock;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;

/**
 * Checks an OpenID Connect ID token (Google, Apple) the way the providers require, using the
 * firebase/php-jwt library for the cryptography:
 *  - the signature, against the provider's published public keys (RS256 only: a token that claims
 *    another algorithm, or "none", is refused);
 *  - the issuer (`iss`), the audience (`aud`, our own client id) and the expiry;
 *  - the nonce we generated for this sign-in, so a token can't be replayed from another sign-in.
 */
final class IdTokenVerifier
{
    private const LEEWAY_SECONDS = 60;

    /** @var callable(string, bool): array<string, mixed> */
    private $fetchKeys;

    /**
     * @param callable(string $jwksUri, bool $fresh): array<string, mixed> $fetchKeys returns the provider's key set (JWKS)
     */
    public function __construct(callable $fetchKeys, private Clock $clock)
    {
        $this->fetchKeys = $fetchKeys;
    }

    /**
     * @param list<string> $issuers accepted values of `iss`
     * @return array<string, mixed> the verified claims
     * @throws SocialError
     */
    public function verify(string $idToken, string $jwksUri, array $issuers, string $audience, string $nonce): array
    {
        JWT::$timestamp = $this->clock->now()->getTimestamp();
        JWT::$leeway = self::LEEWAY_SECONDS;
        try {
            try {
                $claims = (array) JWT::decode($idToken, JWK::parseKeySet(($this->fetchKeys)($jwksUri, false), 'RS256'));
            } catch (\UnexpectedValueException $e) {
                // The provider may have rotated its keys since we cached them: look once more.
                if (!str_contains($e->getMessage(), 'kid')) {
                    throw $e;
                }
                $claims = (array) JWT::decode($idToken, JWK::parseKeySet(($this->fetchKeys)($jwksUri, true), 'RS256'));
            }
        } catch (\Throwable $e) {
            throw new SocialError(SocialError::FAILED, 'ID token rejected: ' . $e->getMessage());
        } finally {
            JWT::$timestamp = null;
        }

        if (!in_array($claims['iss'] ?? null, $issuers, true)) {
            throw new SocialError(SocialError::FAILED, 'ID token rejected: wrong issuer');
        }
        $aud = $claims['aud'] ?? null;
        if (!(is_string($aud) ? $aud === $audience : (is_array($aud) && in_array($audience, $aud, true)))) {
            throw new SocialError(SocialError::FAILED, 'ID token rejected: wrong audience');
        }
        if (!isset($claims['exp'])) {
            throw new SocialError(SocialError::FAILED, 'ID token rejected: no expiry');
        }
        if (!is_string($claims['nonce'] ?? null) || !hash_equals($nonce, $claims['nonce'])) {
            throw new SocialError(SocialError::FAILED, 'ID token rejected: nonce does not match');
        }
        if (!is_string($claims['sub'] ?? null) || $claims['sub'] === '') {
            throw new SocialError(SocialError::FAILED, 'ID token rejected: no subject');
        }
        return $claims;
    }
}
