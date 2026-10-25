<?php

declare(strict_types=1);

namespace Tests\Integration;

final class HttpSecurityTest extends IntegrationTestCase
{
    public function testSecurityHeadersOnEveryResponseIncludingErrors(): void
    {
        foreach (['/api/health', '/api/does-not-exist'] as $path) {
            [$res] = $this->request('GET', $path);
            self::assertSame("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", $res->getHeaderLine('Content-Security-Policy'), $path);
            self::assertSame('nosniff', $res->getHeaderLine('X-Content-Type-Options'));
            self::assertSame('DENY', $res->getHeaderLine('X-Frame-Options'));
            self::assertSame('no-store', $res->getHeaderLine('Cache-Control'));
            self::assertNotSame('', $res->getHeaderLine('Referrer-Policy'));
            self::assertNotSame('', $res->getHeaderLine('Permissions-Policy'));
        }
    }

    public function testStateChangingRequestsRequireCsrfToken(): void
    {
        [$res, $body] = $this->request('POST', '/api/auth/login', ['email' => 'guest@smallafrica.demo', 'password' => 'SmallAfrica@Guest2026']);
        self::assertSame(403, $res->getStatusCode());
        self::assertSame('csrf_mismatch', $body['error']['code']);
    }

    public function testForeignOriginIsRejectedEvenWithToken(): void
    {
        $headers = ['Origin' => 'https://evil.example'] + $this->spaHeaders();
        [$res] = $this->request('POST', '/api/auth/login', ['email' => 'a@b.co', 'password' => 'x'], $headers);
        self::assertSame(403, $res->getStatusCode());
    }

    public function testCorsOnlyForAllowedOrigins(): void
    {
        [$ok] = $this->request('OPTIONS', '/api/auth/login', null, ['Origin' => 'http://localhost:5173']);
        self::assertSame(204, $ok->getStatusCode());
        self::assertSame('http://localhost:5173', $ok->getHeaderLine('Access-Control-Allow-Origin'));
        self::assertSame('true', $ok->getHeaderLine('Access-Control-Allow-Credentials'));

        [$bad] = $this->request('OPTIONS', '/api/auth/login', null, ['Origin' => 'https://evil.example']);
        self::assertSame('', $bad->getHeaderLine('Access-Control-Allow-Origin'));
    }

    public function testLoginMeLogoutRoundTrip(): void
    {
        [$res, $body] = $this->request('POST', '/api/auth/login', ['email' => 'guest@smallafrica.demo', 'password' => 'SmallAfrica@Guest2026'], $this->spaHeaders());
        self::assertSame(200, $res->getStatusCode());
        self::assertArrayNotHasKey('password_hash', $body['user']);
        self::assertArrayNotHasKey('totp_secret_enc', $body['user']);

        [, $me] = $this->request('GET', '/api/auth/me');
        self::assertSame('guest@smallafrica.demo', $me['user']['email']);

        $headers = ['X-CSRF-Token' => $body['csrfToken'], 'Origin' => 'http://localhost:5173'];
        [$out] = $this->request('POST', '/api/auth/logout', [], $headers);
        self::assertSame(200, $out->getStatusCode());
        [, $after] = $this->request('GET', '/api/auth/me');
        self::assertNull($after['user']);
    }

    public function testProtectedRoutesRequireSignInAndRole(): void
    {
        [$res, $body] = $this->request('PATCH', '/api/account/profile', ['first_name' => 'X'], $this->spaHeaders());
        self::assertSame(401, $res->getStatusCode());
        self::assertSame('unauthenticated', $body['error']['code']);

        [, $login] = $this->request('POST', '/api/auth/login', ['email' => 'guest@smallafrica.demo', 'password' => 'SmallAfrica@Guest2026'], $this->spaHeaders());
        $headers = ['X-CSRF-Token' => $login['csrfToken'], 'Origin' => 'http://localhost:5173'];
        [$staffOnly] = $this->request('POST', '/api/account/2fa/setup', [], $headers);
        self::assertSame(403, $staffOnly->getStatusCode(), 'Customers must not reach staff-only endpoints');
    }

    public function testProfileUpdateIgnoresPrivilegedFields(): void
    {
        [, $login] = $this->request('POST', '/api/auth/login', ['email' => 'guest@smallafrica.demo', 'password' => 'SmallAfrica@Guest2026'], $this->spaHeaders());
        $headers = ['X-CSRF-Token' => $login['csrfToken'], 'Origin' => 'http://localhost:5173'];
        [$res, $body] = $this->request('PATCH', '/api/account/profile', ['first_name' => 'Chi', 'role' => 'super_admin', 'email' => 'x@y.z'], $headers);
        self::assertSame(200, $res->getStatusCode());
        self::assertSame('Chi', $body['user']['firstName']);
        self::assertSame('customer', $body['user']['role']);
        self::assertSame('guest@smallafrica.demo', $body['user']['email']);
    }

    public function testUnexpectedErrorsHideDetails(): void
    {
        [$res, $body] = $this->request('POST', '/api/auth/login', null, $this->spaHeaders() + ['Content-Type' => 'application/json']);
        self::assertSame(422, $res->getStatusCode());
        self::assertArrayNotHasKey('trace', $body['error']);
    }
}
