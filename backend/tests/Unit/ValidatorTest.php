<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Http\ValidationError;
use App\Support\Validator;
use PHPUnit\Framework\TestCase;

final class ValidatorTest extends TestCase
{
    public function testReturnsOnlyDeclaredFieldsTrimmedAndNormalised(): void
    {
        $out = Validator::validate(
            ['email' => '  Ada@Example.COM ', 'phone' => '0803 123 4567', 'role' => 'super_admin', 'party' => '4'],
            ['email' => 'required|email', 'phone' => 'nullable|phone', 'party' => 'required|int|min:1|max:12'],
        );
        self::assertSame(['email' => 'ada@example.com', 'phone' => '+2348031234567', 'party' => 4], $out);
        self::assertArrayNotHasKey('role', $out, 'Undeclared fields (mass assignment) must be dropped');
    }

    public function testCollectsAllFieldErrors(): void
    {
        try {
            Validator::validate(['email' => 'nope', 'party' => '40'], [
                'email' => 'required|email', 'party' => 'required|int|max:12', 'name' => 'required|string',
            ]);
            self::fail('Expected ValidationError');
        } catch (ValidationError $e) {
            self::assertSame(422, $e->status);
            self::assertSame(['email', 'party', 'name'], array_keys($e->errors));
        }
    }

    public function testDateTimeAndEnumRules(): void
    {
        $ok = Validator::validate(['d' => '2026-12-31', 't' => '19:30', 'k' => 'polish'], ['d' => 'date', 't' => 'time', 'k' => 'in:nigerian,polish,continental']);
        self::assertSame('19:30', $ok['t']);
        $this->expectException(ValidationError::class);
        Validator::validate(['d' => '2026-02-30'], ['d' => 'date']);
    }

    public function testNonStringValuesAreRejectedForTextRules(): void
    {
        $this->expectException(ValidationError::class);
        Validator::validate(['name' => ['injected' => 'array']], ['name' => 'required|string|max:80']);
    }
}
