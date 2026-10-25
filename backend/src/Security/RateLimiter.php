<?php

declare(strict_types=1);

namespace App\Security;

use App\Http\HttpError;
use App\Support\Clock;
use App\Support\Database;

/**
 * Fixed-window rate limiter backed by the rate_limits table, so limits hold across PHP
 * workers and survive restarts. Buckets look like "login:ip:203.0.113.4".
 */
final class RateLimiter
{
    public function __construct(private Database $db, private Clock $clock)
    {
    }

    /** Counts a hit and throws 429 once the bucket exceeds $max hits in $windowSeconds. */
    public function hit(string $bucket, int $max, int $windowSeconds): void
    {
        $remaining = $this->attempt($bucket, $max, $windowSeconds);
        if ($remaining < 0) {
            throw HttpError::tooManyRequests($this->retryAfter($bucket, $windowSeconds));
        }
    }

    /** Records a hit and returns how many remain (negative when over the limit). */
    public function attempt(string $bucket, int $max, int $windowSeconds): int
    {
        $bucket = substr($bucket, 0, 191);
        $now = $this->clock->now();
        $windowStart = $now->modify("-{$windowSeconds} seconds");

        return $this->db->transaction(function (Database $db) use ($bucket, $max, $now, $windowStart): int {
            $row = $db->one('SELECT hits, window_start FROM rate_limits WHERE bucket = ? FOR UPDATE', [$bucket]);
            if ($row === null) {
                $db->run('INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, ?)', [$bucket, $this->clock->sql($now)]);
                return $max - 1;
            }
            if ($row['window_start'] < $this->clock->sql($windowStart)) {
                $db->run('UPDATE rate_limits SET hits = 1, window_start = ? WHERE bucket = ?', [$this->clock->sql($now), $bucket]);
                return $max - 1;
            }
            $db->run('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?', [$bucket]);
            return $max - ((int) $row['hits'] + 1);
        });
    }

    public function clear(string $bucket): void
    {
        $this->db->run('DELETE FROM rate_limits WHERE bucket = ?', [substr($bucket, 0, 191)]);
    }

    private function retryAfter(string $bucket, int $windowSeconds): int
    {
        $start = $this->db->scalar('SELECT window_start FROM rate_limits WHERE bucket = ?', [substr($bucket, 0, 191)]);
        if (!$start) {
            return $windowSeconds;
        }
        $elapsed = $this->clock->now()->getTimestamp() - (new \DateTimeImmutable($start, Clock::zone()))->getTimestamp();
        return max(1, $windowSeconds - $elapsed);
    }
}
