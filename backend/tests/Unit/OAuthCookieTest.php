<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Security\Crypto;
use App\Social\OAuthCookie;
use App\Support\Clock;
use PHPUnit\Framework\TestCase;

final class OAuthCookieTest extends TestCase
{
    private Clock $clock;
    private Crypto $crypto;

    protected function setUp(): void
    {
        $this->clock = new Clock();
        $this->clock->freeze('2026-10-20 12:00:00');
        $this->crypto = new Crypto('base64:' . base64_encode(random_bytes(32)));
    }

    public function testSealsAndOpensWhatWasStored(): void
    {
        $cookie = new OAuthCookie($this->crypto, $this->clock, false);
        $opened = $cookie->open($cookie->seal(['s' => 'state-1', 'n' => 'nonce-1', 'v' => 'verifier-1']));
        self::assertSame('state-1', $opened['s']);
        self::assertSame('verifier-1', $opened['v']);
    }

    public function testTheContentsCannotBeReadOrChangedByTheBrowser(): void
    {
        $cookie = new OAuthCookie($this->crypto, $this->clock, false);
        $sealed = $cookie->seal(['s' => 'state-secret-123']);
        self::assertStringNotContainsString('state-secret-123', $sealed);
        self::assertStringNotContainsString('state-secret-123', base64_decode(strtr($sealed, '-_', '+/')));
        self::assertNull($cookie->open(substr($sealed, 0, -3) . 'AAA'));
        self::assertNull($cookie->open('garbage'));
        self::assertNull($cookie->open(''));
        self::assertNull($cookie->open(null));
        // A cookie sealed with another site's key is not ours.
        $foreign = new OAuthCookie(new Crypto('base64:' . base64_encode(random_bytes(32))), $this->clock, false);
        self::assertNull($cookie->open($foreign->seal(['s' => 'x'])));
    }

    public function testExpiresAfterTenMinutes(): void
    {
        $cookie = new OAuthCookie($this->crypto, $this->clock, false);
        $sealed = $cookie->seal(['s' => 'x']);
        $this->clock->freeze('2026-10-20 12:09:59');
        self::assertNotNull($cookie->open($sealed));
        $this->clock->freeze('2026-10-20 12:10:01');
        self::assertNull($cookie->open($sealed));
    }

    public function testCookieAttributesOverHttpsAllowAppleCrossSitePost(): void
    {
        $https = (new OAuthCookie($this->crypto, $this->clock, true))->header('abc', '/api/auth/oauth');
        foreach (['HttpOnly', 'Secure', 'SameSite=None', 'Path=/api/auth/oauth', 'Max-Age=600'] as $part) {
            self::assertStringContainsString($part, $https);
        }
        $http = (new OAuthCookie($this->crypto, $this->clock, false))->header('abc', '/api/auth/oauth');
        self::assertStringContainsString('SameSite=Lax', $http);
        self::assertStringNotContainsString('Secure', $http);
        $cleared = (new OAuthCookie($this->crypto, $this->clock, true))->header(null, '/api/auth/oauth');
        self::assertStringContainsString('Max-Age=0', $cleared);
        self::assertStringStartsWith('sa_oauth=;', $cleared);
    }
}
