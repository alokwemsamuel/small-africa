<?php

declare(strict_types=1);

namespace App\Social;

use League\OAuth2\Client\Provider\AbstractProvider;
use League\OAuth2\Client\Provider\Facebook;

/**
 * Facebook Login (authorization code flow with PKCE). Facebook sends no ID token: the code is
 * exchanged on the server and the person's id, name and email are read from the Graph API with the
 * access token we received, never from the browser.
 *
 * Facebook doesn't say whether an email address is confirmed, so it is treated as NOT confirmed:
 * it can start a new account (which then confirms the address by email) but is never used to
 * attach a sign-in to an existing account.
 */
final class FacebookProvider implements Provider
{
    /** @param array<string, mixed> $collaborators passed to the OAuth library (tests give it a fake HTTP client) */
    public function __construct(
        private string $appId,
        private string $appSecret,
        private bool $pkce = true,
        private string $graphApiVersion = 'v21.0',
        private array $collaborators = [],
    ) {
    }

    public function name(): string
    {
        return 'facebook';
    }

    private function client(string $redirectUri): Facebook
    {
        $options = [
            'clientId' => $this->appId,
            'clientSecret' => $this->appSecret,
            'redirectUri' => $redirectUri,
            'graphApiVersion' => $this->graphApiVersion,
        ];
        // PKCE is switched on by overriding getPkceMethod(): the library has no option for it.
        return $this->pkce
            ? new class($options, $this->collaborators) extends Facebook {
                protected function getPkceMethod()
                {
                    return self::PKCE_METHOD_S256;
                }
            }
            : new Facebook($options, $this->collaborators);
    }

    public function start(string $redirectUri, string $state, string $nonce): array
    {
        $client = $this->client($redirectUri);
        $url = $client->getAuthorizationUrl(['state' => $state, 'scope' => ['public_profile', 'email']]);
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
            $owner = $client->getResourceOwner($token);
        } catch (\Throwable $e) {
            throw new SocialError(SocialError::FAILED, 'Facebook refused the sign-in: ' . $e->getMessage());
        }
        $id = (string) $owner->getId();
        if ($id === '') {
            throw new SocialError(SocialError::FAILED, 'Facebook sent no user id.');
        }
        $email = $owner->getEmail();
        return new Identity(
            'facebook',
            $id,
            is_string($email) && $email !== '' ? mb_strtolower($email) : null,
            false,
            (string) $owner->getFirstName(),
            (string) $owner->getLastName(),
        );
    }
}
