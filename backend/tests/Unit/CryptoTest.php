<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Security\Crypto;
use PHPUnit\Framework\TestCase;

final class CryptoTest extends TestCase
{
    public function testEncryptDecryptRoundTripWithFreshIv(): void
    {
        $crypto = new Crypto('base64:' . base64_encode(random_bytes(32)));
        $a = $crypto->encrypt('JBSWY3DPEHPK3PXP');
        $b = $crypto->encrypt('JBSWY3DPEHPK3PXP');
        self::assertNotSame($a, $b);
        self::assertSame('JBSWY3DPEHPK3PXP', $crypto->decrypt($a));
    }

    public function testTamperedCiphertextIsRejected(): void
    {
        $crypto = new Crypto('base64:' . base64_encode(random_bytes(32)));
        $raw = base64_decode($crypto->encrypt('secret'));
        $raw[strlen($raw) - 1] = chr(ord($raw[strlen($raw) - 1]) ^ 1);
        $this->expectException(\RuntimeException::class);
        $crypto->decrypt(base64_encode($raw));
    }

    public function testRejectsWeakKeys(): void
    {
        $this->expectException(\RuntimeException::class);
        new Crypto('base64:' . base64_encode('too-short'));
    }

    public function testCodesAvoidAmbiguousCharacters(): void
    {
        for ($i = 0; $i < 50; $i++) {
            self::assertMatchesRegularExpression('/^SA-[A-HJ-KM-NP-Z2-9]{6}$/', Crypto::code(6, 'SA-'));
        }
    }
}
