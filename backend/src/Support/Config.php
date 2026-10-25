<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Typed access to environment configuration. Values come from .env (loaded once at boot)
 * or the real process environment, which always wins.
 */
final class Config
{
    /** @param array<string, string> $values */
    public function __construct(private array $values)
    {
    }

    public static function fromEnvironment(): self
    {
        $values = [];
        foreach ([$_ENV, $_SERVER] as $source) {
            foreach ($source as $key => $value) {
                if (is_string($value)) {
                    $values[$key] = $value;
                }
            }
        }
        return new self($values);
    }

    public function str(string $key, ?string $default = null): string
    {
        $value = $this->values[$key] ?? $default;
        if ($value === null) {
            throw new \RuntimeException("Missing required configuration: {$key}");
        }
        return $value;
    }

    public function int(string $key, int $default): int
    {
        return isset($this->values[$key]) && $this->values[$key] !== '' ? (int) $this->values[$key] : $default;
    }

    public function bool(string $key, bool $default = false): bool
    {
        if (!isset($this->values[$key]) || $this->values[$key] === '') {
            return $default;
        }
        return in_array(strtolower($this->values[$key]), ['1', 'true', 'yes', 'on'], true);
    }

    /** @return list<string> */
    public function list(string $key): array
    {
        $raw = $this->values[$key] ?? '';
        return array_values(array_filter(array_map('trim', explode(',', $raw)), static fn ($v) => $v !== ''));
    }

    public function isProduction(): bool
    {
        return $this->str('APP_ENV', 'production') === 'production';
    }

    public function with(string $key, string $value): self
    {
        $copy = clone $this;
        $copy->values[$key] = $value;
        return $copy;
    }
}
