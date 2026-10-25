<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Security\PasswordPolicy;
use PHPUnit\Framework\TestCase;

final class PasswordPolicyTest extends TestCase
{
    public function testDemoPasswordsAreAccepted(): void
    {
        foreach (['SmallAfrica@Admin2026', 'SmallAfrica@Manager2026', 'SmallAfrica@Guest2026'] as $pw) {
            self::assertSame([], PasswordPolicy::problems($pw), $pw);
        }
    }

    public function testRejectsShortPasswords(): void
    {
        self::assertNotEmpty(PasswordPolicy::problems('Ab1!'));
    }

    public function testRequiresThreeCharacterClasses(): void
    {
        self::assertNotEmpty(PasswordPolicy::problems('alllowercaseletters'));
        self::assertSame([], PasswordPolicy::problems('lowercase and 123 numbers'));
    }

    public function testRejectsCommonAndRepeatedPasswords(): void
    {
        self::assertNotEmpty(PasswordPolicy::problems('Password123'));
        self::assertNotEmpty(PasswordPolicy::problems('aaaaaaaaaaaa'));
    }

    public function testRejectsPersonalInformation(): void
    {
        self::assertNotEmpty(PasswordPolicy::problems('Chiamaka#2026x', ['Chiamaka', 'Bello']));
    }

    public function testHashesWithArgon2id(): void
    {
        $hash = PasswordPolicy::hash('Correct-Horse-9');
        self::assertStringStartsWith('$argon2id$', $hash);
        self::assertTrue(PasswordPolicy::verify('Correct-Horse-9', $hash));
        self::assertFalse(PasswordPolicy::verify('Correct-Horse-8', $hash));
        self::assertFalse(PasswordPolicy::needsRehash($hash));
    }
}
