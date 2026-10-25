<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Security\Totp;
use PHPUnit\Framework\TestCase;

final class TotpTest extends TestCase
{
    /** RFC 6238 Appendix B SHA-1 secret "12345678901234567890". */
    private const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    /** @return array<string, array{int, string}> */
    public static function rfcVectors(): array
    {
        // 6-digit truncations of the RFC's 8-digit values.
        return [
            't=59' => [59, '287082'],
            't=1111111109' => [1111111109, '081804'],
            't=1111111111' => [1111111111, '050471'],
            't=1234567890' => [1234567890, '005924'],
            't=2000000000' => [2000000000, '279037'],
        ];
    }

    /** @dataProvider rfcVectors */
    public function testMatchesRfcVectors(int $time, string $expected): void
    {
        self::assertSame($expected, Totp::at(self::RFC_SECRET, intdiv($time, 30)));
    }

    public function testBase32RoundTrip(): void
    {
        self::assertSame('12345678901234567890', Totp::base32Decode(self::RFC_SECRET));
        $raw = random_bytes(20);
        self::assertSame($raw, Totp::base32Decode(Totp::base32Encode($raw)));
    }

    public function testVerifyAcceptsOneStepOfDriftAndRejectsMore(): void
    {
        $secret = Totp::generateSecret();
        $now = 1_800_000_000;
        $step = intdiv($now, 30);
        self::assertSame($step, Totp::verify($secret, Totp::at($secret, $step), $now));
        self::assertSame($step - 1, Totp::verify($secret, Totp::at($secret, $step - 1), $now));
        self::assertSame($step + 1, Totp::verify($secret, Totp::at($secret, $step + 1), $now));
        self::assertNull(Totp::verify($secret, Totp::at($secret, $step - 3), $now));
        self::assertNull(Totp::verify($secret, 'abcdef', $now));
    }

    public function testReplayOfUsedStepIsRejected(): void
    {
        $secret = Totp::generateSecret();
        $now = 1_800_000_000;
        $step = intdiv($now, 30);
        $code = Totp::at($secret, $step);
        self::assertNull(Totp::verify($secret, $code, $now, lastUsedStep: $step));
    }
}
