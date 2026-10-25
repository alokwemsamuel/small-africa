<?php

declare(strict_types=1);

namespace App\Support;

use DateTimeImmutable;
use DateTimeZone;

/** Restaurant-local time (Africa/Lagos). Tests can freeze it. */
class Clock
{
    private ?DateTimeImmutable $frozen = null;

    public static function zone(): DateTimeZone
    {
        return new DateTimeZone('Africa/Lagos');
    }

    public function now(): DateTimeImmutable
    {
        return $this->frozen ?? new DateTimeImmutable('now', self::zone());
    }

    public function freeze(DateTimeImmutable|string $at): void
    {
        $this->frozen = is_string($at) ? new DateTimeImmutable($at, self::zone()) : $at;
    }

    public function sql(?DateTimeImmutable $at = null): string
    {
        return ($at ?? $this->now())->format('Y-m-d H:i:s');
    }
}
