<?php

declare(strict_types=1);

namespace App\Social;

use League\OAuth2\Client\Provider\AbstractProvider;
use League\OAuth2\Client\Provider\Apple;

/**
 * Sign in with Apple (needs the paid Apple Developer Program: see docs/SOCIAL-LOGIN-SETUP.md).
 *
 * Apple answers with a cross-site form POST (`response_mode=form_post`) and only sends the person's
 * name the first time they sign in, in a `user` field that is NOT signed. So the name is only used
 * to fill in a new account's first and last name (cleaned and shortened); who the person is, and
 * their email, come from the signed ID token alone.
 */
final class AppleProvider implements Provider
{
    public const JWKS_URI = 'https://appleid.apple.com/auth/keys';
    private const ISSUER = 'https://appleid.apple.com';

    /** @param array<string, mixed> $collaborators passed to the OAuth library (tests give it a fake HTTP client) */
    public function __construct(
        private string $clientId,
        private string $teamId,
        private string $keyId,
        private string $privateKeyPath,
        private IdTokenVerifier $verifier,
        private bool $pkce = true,
        private array $collaborators = [],
    ) {
    }

    public function name(): string
    {
        return 'apple';
    }

    private function client(string $redirectUri): Apple
    {
        $options = [
            'clientId' => $this->clientId,
            'teamId' => $this->teamId,
            'keyFileId' => $this->keyId,
            'keyFilePath' => $this->privateKeyPath,
            'redirectUri' => $redirectUri,
        ];
        // PKCE is switched on by overriding getPkceMethod(): the library has no option for it.
        return $this->pkce
            ? new class($options, $this->collaborators) extends Apple {
                protected function getPkceMethod()
                {
                    return self::PKCE_METHOD_S256;
                }
            }
            : new Apple($options, $this->collaborators);
    }

    public function start(string $redirectUri, string $state, string $nonce): array
    {
        $client = $this->client($redirectUri);
        $url = $client->getAuthorizationUrl([
            'state' => $state,
            'nonce' => $nonce,
            'scope' => ['name', 'email'],
        ]);
        return ['url' => $url, 'pkceVerifier' => $this->pkce ? $client->getPkceCode() : null];
    }

    public function finish(string $redirectUri, string $code, ?string $pkceVerifier, string $nonce, array $posted): Identity
    {
        $client = $this->client($redirectUri);
        if ($pkceVerifier !== null) {
            $client->setPkceCode($pkceVerifier);
        }
        try {
            $token = $client->getAccessToken('authorization_code', ['code' => $code]);
        } catch (\Throwable $e) {
            throw new SocialError(SocialError::FAILED, 'Apple refused the code: ' . $e->getMessage());
        }
        $idToken = $token->getValues()['id_token'] ?? null;
        if (!is_string($idToken) || $idToken === '') {
            throw new SocialError(SocialError::FAILED, 'Apple sent no ID token.');
        }
        $claims = $this->verifier->verify($idToken, self::JWKS_URI, [self::ISSUER], $this->clientId, $nonce);

        [$first, $last] = $this->nameFrom($posted['user'] ?? null);
        return new Identity(
            'apple',
            (string) $claims['sub'],
            // "Hide my email" gives a relay address, which is a real inbox: accepted as it is.
            isset($claims['email']) ? mb_strtolower((string) $claims['email']) : null,
            filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN),
            $first,
            $last,
        );
    }

    /** @return array{0: string, 1: string} */
    private function nameFrom(mixed $raw): array
    {
        $data = is_string($raw) ? json_decode($raw, true) : (is_array($raw) ? $raw : null);
        $name = is_array($data) && is_array($data['name'] ?? null) ? $data['name'] : [];
        $clean = static fn (mixed $v): string => mb_substr(trim((string) preg_replace('/[\x00-\x1F\x7F<>]/u', '', is_string($v) ? $v : '')), 0, 80);
        return [$clean($name['firstName'] ?? ''), $clean($name['lastName'] ?? '')];
    }
}
