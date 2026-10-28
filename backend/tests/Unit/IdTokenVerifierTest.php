<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Social\IdTokenVerifier;
use App\Social\SocialError;
use App\Support\Clock;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestKeys;

final class IdTokenVerifierTest extends TestCase
{
    private const URI = 'https://keys.example/jwks';
    private const NOW = 1_792_000_000;

    private Clock $clock;
    /** @var list<bool> the `fresh` flag of every key lookup */
    private array $lookups = [];

    protected function setUp(): void
    {
        $this->clock = new Clock();
        $this->clock->freeze('@' . self::NOW);
    }

    /** @param array<string, mixed> $keys */
    private function verifier(array $keys, ?array $afterRotation = null): IdTokenVerifier
    {
        return new IdTokenVerifier(function (string $uri, bool $fresh) use ($keys, $afterRotation): array {
            $this->lookups[] = $fresh;
            self::assertSame(self::URI, $uri);
            return $fresh && $afterRotation !== null ? $afterRotation : $keys;
        }, $this->clock);
    }

    /** @return array<string, mixed> */
    private function claims(array $override = []): array
    {
        return $override + [
            'iss' => 'https://accounts.google.com', 'aud' => 'my-client-id', 'sub' => 'user-123', 'nonce' => 'the-nonce',
            'iat' => self::NOW - 10, 'exp' => self::NOW + 600, 'email' => 'ada@example.com', 'email_verified' => true,
        ];
    }

    private function check(IdTokenVerifier $v, string $token): array
    {
        return $v->verify($token, self::URI, ['https://accounts.google.com', 'accounts.google.com'], 'my-client-id', 'the-nonce');
    }

    private function assertRejected(callable $run, string $why): void
    {
        try {
            $run();
        } catch (SocialError $e) {
            self::assertSame(SocialError::FAILED, $e->reason);
            self::assertStringContainsString($why, $e->getMessage());
            return;
        }
        self::fail("Expected the token to be rejected ({$why})");
    }

    public function testAcceptsAGoodToken(): void
    {
        $key = TestKeys::rsa();
        $claims = $this->check($this->verifier($key['jwks']), TestKeys::idToken($key, $this->claims()));
        self::assertSame('user-123', $claims['sub']);
        self::assertSame('ada@example.com', $claims['email']);
    }

    public function testAcceptsAnAudienceListThatContainsOurClientId(): void
    {
        $key = TestKeys::rsa();
        $token = TestKeys::idToken($key, $this->claims(['aud' => ['other', 'my-client-id']]));
        self::assertSame('user-123', $this->check($this->verifier($key['jwks']), $token)['sub']);
    }

    public function testRejectsATokenSignedWithAnotherKey(): void
    {
        $real = TestKeys::rsa('real');
        // Same key id, but signed with a different private key.
        $forged = TestKeys::idToken(['pem' => TestKeys::newRsa('real')['pem'], 'kid' => 'real'], $this->claims());
        $this->assertRejected(fn () => $this->check($this->verifier($real['jwks']), $forged), 'ID token rejected');
    }

    public function testRejectsATamperedPayload(): void
    {
        $key = TestKeys::rsa();
        [$h, , $s] = explode('.', TestKeys::idToken($key, $this->claims()));
        $evil = rtrim(strtr(base64_encode(json_encode($this->claims(['sub' => 'someone-else']))), '+/', '-_'), '=');
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), "{$h}.{$evil}.{$s}"), 'ID token rejected');
    }

    public function testRejectsTheWrongIssuer(): void
    {
        $key = TestKeys::rsa();
        $token = TestKeys::idToken($key, $this->claims(['iss' => 'https://evil.example']));
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), $token), 'wrong issuer');
    }

    public function testRejectsTheWrongAudience(): void
    {
        $key = TestKeys::rsa();
        $token = TestKeys::idToken($key, $this->claims(['aud' => 'someone-elses-client']));
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), $token), 'wrong audience');
    }

    public function testRejectsAnExpiredToken(): void
    {
        $key = TestKeys::rsa();
        $token = TestKeys::idToken($key, $this->claims(['iat' => self::NOW - 7200, 'exp' => self::NOW - 3600]));
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), $token), 'Expired');
    }

    public function testRejectsTheWrongOrMissingNonce(): void
    {
        $key = TestKeys::rsa();
        $wrong = TestKeys::idToken($key, $this->claims(['nonce' => 'another-sign-in']));
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), $wrong), 'nonce');
        $claims = $this->claims();
        unset($claims['nonce']);
        $missing = TestKeys::idToken($key, $claims);
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), $missing), 'nonce');
    }

    public function testRejectsATokenWithoutASubject(): void
    {
        $key = TestKeys::rsa();
        $claims = $this->claims();
        unset($claims['sub']);
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), TestKeys::idToken($key, $claims)), 'no subject');
    }

    public function testRejectsAKeyConfusionAttempt(): void
    {
        // A token claiming HS256, "signed" with the public key's text as the secret, must not pass.
        $key = TestKeys::rsa();
        $token = TestKeys::idToken($key, $this->claims(), 'HS256');
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), $token), 'ID token rejected');
    }

    public function testRejectsGarbage(): void
    {
        $key = TestKeys::rsa();
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), 'not.a.token'), 'ID token rejected');
        $this->assertRejected(fn () => $this->check($this->verifier($key['jwks']), ''), 'ID token rejected');
    }

    public function testLooksForRotatedKeysOnceWhenTheKeyIdIsUnknown(): void
    {
        $old = TestKeys::rsa('old-key');
        $new = TestKeys::rsa('new-key');
        $token = TestKeys::idToken($new, $this->claims());
        $claims = $this->check($this->verifier($old['jwks'], $new['jwks']), $token);
        self::assertSame('user-123', $claims['sub']);
        self::assertSame([false, true], $this->lookups, 'cached keys first, then one fresh download');
    }

    public function testGivesUpWhenEvenFreshKeysDoNotMatch(): void
    {
        $old = TestKeys::rsa('old-key');
        $unknown = TestKeys::rsa('never-published');
        $this->assertRejected(
            fn () => $this->check($this->verifier($old['jwks'], $old['jwks']), TestKeys::idToken($unknown, $this->claims())),
            'ID token rejected',
        );
        self::assertSame([false, true], $this->lookups);
    }
}
