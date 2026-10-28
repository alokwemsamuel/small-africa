<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Social\AppleProvider;
use App\Social\FacebookProvider;
use App\Social\GoogleProvider;
use App\Social\IdTokenVerifier;
use App\Social\SocialError;
use App\Support\Clock;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestKeys;

/**
 * Runs each provider class through the real league/oauth2-client libraries with the provider's
 * HTTP answers faked: proves the wiring (authorization URL, PKCE, token exchange, claims) without
 * any network or developer account.
 */
final class ProviderLibrariesTest extends TestCase
{
    private const REDIRECT = 'https://smallafrica.test/api/auth/oauth/%s/callback';
    /** @var list<array{request: \Psr\Http\Message\RequestInterface}> */
    private array $history = [];

    /** @param list<Response> $responses */
    private function http(array $responses): Client
    {
        $stack = HandlerStack::create(new MockHandler($responses));
        $stack->push(Middleware::history($this->history));
        return new Client(['handler' => $stack]);
    }

    private function json(array $body): Response
    {
        return new Response(200, ['Content-Type' => 'application/json'], json_encode($body));
    }

    private function verifier(array $jwks): IdTokenVerifier
    {
        return new IdTokenVerifier(static fn (): array => $jwks, new Clock());
    }

    /** @return array<string, string> */
    private function query(string $url): array
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
        return $q;
    }

    /** @return array<string, string> */
    private function form(int $requestIndex): array
    {
        parse_str((string) $this->history[$requestIndex]['request']->getBody(), $f);
        return $f;
    }

    private function claims(string $iss, string $aud, array $extra = []): array
    {
        return $extra + ['iss' => $iss, 'aud' => $aud, 'sub' => 'sub-1', 'nonce' => 'N-123', 'iat' => time() - 10, 'exp' => time() + 600];
    }

    public function testGoogleStartsWithStateNoncePkceAndTheRightScopes(): void
    {
        $provider = new GoogleProvider('cid', 'secret', $this->verifier(['keys' => []]));
        $start = $provider->start(sprintf(self::REDIRECT, 'google'), 'STATE-1', 'N-123');
        $q = $this->query($start['url']);
        self::assertStringStartsWith('https://accounts.google.com/', $start['url']);
        self::assertSame('cid', $q['client_id']);
        self::assertSame('STATE-1', $q['state']);
        self::assertSame('N-123', $q['nonce']);
        self::assertSame('code', $q['response_type']);
        self::assertSame(sprintf(self::REDIRECT, 'google'), $q['redirect_uri']);
        self::assertSame('S256', $q['code_challenge_method']);
        self::assertSame(rtrim(strtr(base64_encode(hash('sha256', $start['pkceVerifier'], true)), '+/', '-_'), '='), $q['code_challenge']);
        self::assertStringContainsString('openid', $q['scope']);
        self::assertStringContainsString('email', $q['scope']);
    }

    public function testGoogleExchangesTheCodeOnTheServerAndReadsTheVerifiedClaims(): void
    {
        $key = TestKeys::rsa('google-1');
        $idToken = TestKeys::idToken($key, $this->claims('https://accounts.google.com', 'cid', [
            'email' => 'Ada@Example.com', 'email_verified' => 'true', 'given_name' => 'Ada', 'family_name' => 'Okafor',
        ]));
        $http = $this->http([$this->json(['access_token' => 'at', 'token_type' => 'Bearer', 'expires_in' => 3600, 'id_token' => $idToken])]);
        $provider = new GoogleProvider('cid', 'secret', $this->verifier($key['jwks']), true, ['httpClient' => $http]);

        $identity = $provider->finish(sprintf(self::REDIRECT, 'google'), 'the-code', 'my-verifier', 'N-123', []);

        self::assertSame('google', $identity->provider);
        self::assertSame('sub-1', $identity->subject);
        self::assertSame('ada@example.com', $identity->email);
        self::assertTrue($identity->emailVerified);
        self::assertSame(['Ada', 'Okafor'], [$identity->firstName, $identity->lastName]);
        $sent = $this->form(0);
        self::assertSame('authorization_code', $sent['grant_type']);
        self::assertSame('the-code', $sent['code']);
        self::assertSame('my-verifier', $sent['code_verifier'], 'PKCE: the verifier goes to the provider from the server');
        self::assertSame('secret', $sent['client_secret']);
    }

    public function testGoogleRefusesAnIdTokenForAnotherSignInOrAnotherApp(): void
    {
        $key = TestKeys::rsa('google-1');
        foreach ([['nonce' => 'someone-elses-nonce'], ['aud' => 'another-app'], ['iss' => 'https://evil.example']] as $override) {
            $idToken = TestKeys::idToken($key, array_replace($this->claims('https://accounts.google.com', 'cid', ['email' => 'a@example.com']), $override));
            $http = $this->http([$this->json(['access_token' => 'at', 'token_type' => 'Bearer', 'id_token' => $idToken])]);
            $provider = new GoogleProvider('cid', 'secret', $this->verifier($key['jwks']), true, ['httpClient' => $http]);
            try {
                $provider->finish(sprintf(self::REDIRECT, 'google'), 'code', 'v', 'N-123', []);
                self::fail('Expected the token to be refused: ' . json_encode($override));
            } catch (SocialError $e) {
                self::assertSame(SocialError::FAILED, $e->reason);
            }
        }
    }

    public function testGoogleTurnsAProviderErrorIntoAFailedSignIn(): void
    {
        $http = $this->http([new Response(400, ['Content-Type' => 'application/json'], '{"error":"invalid_grant"}')]);
        $provider = new GoogleProvider('cid', 'secret', $this->verifier(['keys' => []]), true, ['httpClient' => $http]);
        $this->expectException(SocialError::class);
        $provider->finish(sprintf(self::REDIRECT, 'google'), 'bad-code', 'v', 'N-123', []);
    }

    public function testAppleStartsWithAFormPostAndNameAndEmailScopes(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'p8');
        file_put_contents($file, TestKeys::ecPem());
        try {
            $provider = new AppleProvider('ng.smallafrica.web', 'TEAM123456', 'KEY1234567', $file, $this->verifier(['keys' => []]));
            $start = $provider->start(sprintf(self::REDIRECT, 'apple'), 'STATE-2', 'N-123');
            $q = $this->query($start['url']);
            self::assertStringStartsWith('https://appleid.apple.com/auth/authorize', $start['url']);
            self::assertSame('form_post', $q['response_mode'], 'Apple answers with a cross-site POST when name and email are asked for');
            self::assertSame('STATE-2', $q['state']);
            self::assertSame('N-123', $q['nonce']);
            self::assertSame('S256', $q['code_challenge_method']);
            self::assertStringContainsString('name', $q['scope']);
            self::assertStringContainsString('email', $q['scope']);
        } finally {
            unlink($file);
        }
    }

    public function testAppleExchangesTheCodeAndReadsTheSignedTokenPlusTheFirstSignInName(): void
    {
        $key = TestKeys::rsa('apple-1');
        $idToken = TestKeys::idToken($key, $this->claims('https://appleid.apple.com', 'ng.smallafrica.web', [
            'email' => 'x7k2.relay@privaterelay.appleid.com', 'email_verified' => 'true', 'is_private_email' => 'true',
        ]));
        // The library asks Apple for its public keys after the token call: both answers are faked.
        $http = $this->http([
            $this->json(['access_token' => 'at', 'token_type' => 'Bearer', 'expires_in' => 3600, 'refresh_token' => 'rt', 'id_token' => $idToken]),
            $this->json($key['jwks']),
        ]);
        $file = tempnam(sys_get_temp_dir(), 'p8');
        file_put_contents($file, TestKeys::ecPem());
        try {
            $provider = new AppleProvider('ng.smallafrica.web', 'TEAM123456', 'KEY1234567', $file, $this->verifier($key['jwks']), true, ['httpClient' => $http]);
            $posted = ['user' => json_encode(['name' => ['firstName' => 'Kasia', 'lastName' => "Nowak<script>"]])];
            $identity = $provider->finish(sprintf(self::REDIRECT, 'apple'), 'the-code', 'my-verifier', 'N-123', $posted);
        } finally {
            unlink($file);
        }
        self::assertSame('apple', $identity->provider);
        self::assertSame('sub-1', $identity->subject);
        self::assertSame('x7k2.relay@privaterelay.appleid.com', $identity->email);
        self::assertTrue($identity->emailVerified);
        self::assertSame('Kasia', $identity->firstName);
        self::assertSame('Nowakscript', $identity->lastName, 'the unsigned name is cleaned');
        $sent = $this->form(0);
        self::assertSame('the-code', $sent['code']);
        self::assertSame('my-verifier', $sent['code_verifier']);
        self::assertStringStartsWith('eyJ', $sent['client_secret'], 'the client secret is a signed JWT made from the .p8 key');
    }

    public function testFacebookStartsWithStateAndPkceAndTheEmailScope(): void
    {
        $provider = new FacebookProvider('app-id', 'app-secret');
        $start = $provider->start(sprintf(self::REDIRECT, 'facebook'), 'STATE-3', 'ignored');
        $q = $this->query($start['url']);
        self::assertStringContainsString('facebook.com', $start['url']);
        self::assertSame('app-id', $q['client_id']);
        self::assertSame('STATE-3', $q['state']);
        self::assertSame('S256', $q['code_challenge_method']);
        self::assertStringContainsString('email', $q['scope']);
    }

    public function testFacebookReadsTheProfileFromTheGraphApiAndNeverTrustsItsEmailForLinking(): void
    {
        $http = $this->http([
            $this->json(['access_token' => 'fb-token', 'token_type' => 'bearer', 'expires_in' => 5000]),
            $this->json(['id' => 'fb-77', 'name' => 'Tunde Bello', 'first_name' => 'Tunde', 'last_name' => 'Bello', 'email' => 'Tunde@Example.com']),
        ]);
        $provider = new FacebookProvider('app-id', 'app-secret', true, 'v21.0', ['httpClient' => $http]);
        $identity = $provider->finish(sprintf(self::REDIRECT, 'facebook'), 'the-code', 'my-verifier', 'ignored', []);
        self::assertSame('facebook', $identity->provider);
        self::assertSame('fb-77', $identity->subject);
        self::assertSame('tunde@example.com', $identity->email);
        self::assertFalse($identity->emailVerified, 'Facebook does not say the address is confirmed');
        self::assertSame(['Tunde', 'Bello'], [$identity->firstName, $identity->lastName]);
        self::assertSame('my-verifier', $this->form(0)['code_verifier']);
        self::assertStringContainsString('/me', (string) $this->history[1]['request']->getUri());
    }

    public function testFacebookWithoutAnEmailStillGivesAnIdentity(): void
    {
        $http = $this->http([
            $this->json(['access_token' => 'fb-token', 'token_type' => 'bearer']),
            $this->json(['id' => 'fb-78', 'first_name' => 'Tunde', 'last_name' => 'Bello']),
        ]);
        $identity = (new FacebookProvider('app-id', 'app-secret', true, 'v21.0', ['httpClient' => $http]))
            ->finish(sprintf(self::REDIRECT, 'facebook'), 'c', 'v', 'n', []);
        self::assertNull($identity->email);
    }
}
