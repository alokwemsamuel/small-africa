<?php

declare(strict_types=1);

namespace App\Support;

/** Typed access to the JSON `settings` table, cached per request. */
final class Settings
{
    /** @var array<string, array<string, mixed>> */
    private array $cache = [];

    public function __construct(private Database $db)
    {
    }

    /** @return array<string, mixed> */
    public function group(string $key): array
    {
        if (!array_key_exists($key, $this->cache)) {
            $raw = $this->db->scalar('SELECT setting_value FROM settings WHERE setting_key = ?', [$key]);
            $this->cache[$key] = $raw ? (array) json_decode((string) $raw, true) : [];
        }
        return $this->cache[$key];
    }

    public function get(string $group, string $key, mixed $default = null): mixed
    {
        return $this->group($group)[$key] ?? $default;
    }

    /**
     * Opening window for a date, or null when closed. Times are Africa/Lagos.
     *
     * @return array{opens: \DateTimeImmutable, closes: \DateTimeImmutable}|null
     */
    public function openingWindow(\DateTimeImmutable $date): ?array
    {
        $row = $this->db->one('SELECT * FROM opening_hours WHERE day_of_week = ?', [(int) $date->format('w')]);
        if (!$row || $row['is_closed'] || !$row['opens_at'] || !$row['closes_at']) {
            return null;
        }
        $day = $date->format('Y-m-d');
        return [
            'opens' => new \DateTimeImmutable("{$day} {$row['opens_at']}", Clock::zone()),
            'closes' => new \DateTimeImmutable("{$day} {$row['closes_at']}", Clock::zone()),
        ];
    }

    public function forget(): void
    {
        $this->cache = [];
    }
}
