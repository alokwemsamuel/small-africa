<?php

declare(strict_types=1);

namespace App\Social;

use League\OAuth2\Client\Provider\AbstractProvider;
use League\OAuth2\Client\Provider\Google;

/** Sign in with Google (OpenID Connect, authorization code flow with PKCE). */
final class GoogleProvider implements Provider
{
    public const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
    private const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

    /** @param array<string, mixed> $collaborators passed to the OAuth library (tests give it a fake HTTP client) */
    public function __construct(
        private string $clientId,
        private string $clientSecret,
        private IdTokenVerifier $verifier,
        private bool $pkce = true,
        private array $collaborators = [],
    ) {
    }

    public function name(): string
    {
        return 'google';
    }

    private function client(string $redirectUri): Google
    {
        $options = [
            'clientId' => $this->clientId,
            'clientSecret' => $this->clientSecret,
            'redirectUri' => $redirectUri,
        ];
        // PKCE is switched on by overriding getPkceMethod(): the library has no option for it.
        return $this->pkce
            ? new class($options, $this->collaborators) extends Google {
                protected function getPkceMethod()
                {
                    return self::PKCE_METHOD_S256;
                }
            }
            : new Google($options, $this->collaborators);
    }

    public function start(string $redirectUri, string $state, string $nonce): array
    {
        $client = $this->client($redirectUri);
        $url = $client->getAuthorizationUrl([
            'state' => $state,
            'nonce' => $nonce,
            'scope' => ['openid', 'email', 'profile'],
            'prompt' => 'select_account',
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
            throw new SocialError(SocialError::FAILED, 'Google refused the code: ' . $e->getMessage());
        }
        $idToken = $token->getValues()['id_token'] ?? null;
        if (!is_string($idToken) || $idToken === '') {
            throw new SocialError(SocialError::FAILED, 'Google sent no ID token.');
        }
        $claims = $this->verifier->verify($idToken, self::JWKS_URI, self::ISSUERS, $this->clientId, $nonce);
        return new Identity(
            'google',
            (string) $claims['sub'],
            isset($claims['email']) ? mb_strtolower((string) $claims['email']) : null,
            filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN),
            (string) ($claims['given_name'] ?? ''),
            (string) ($claims['family_name'] ?? ''),
        );
    }
}
