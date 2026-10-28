<?php

declare(strict_types=1);

namespace App\Social;

use GuzzleHttp\Client;

/** Downloads a provider's public signing keys (JWKS) and keeps them for an hour in storage/cache. */
final class JwksFetcher
{
    private const TTL_SECONDS = 3600;

    public function __construct(private string $cacheDir, private ?Client $http = null)
    {
    }

    /** @return array<string, mixed> */
    public function __invoke(string $uri, bool $fresh = false): array
    {
        $file = $this->cacheDir . '/jwks-' . hash('sha256', $uri) . '.json';
        if (!$fresh && is_file($file) && filemtime($file) > time() - self::TTL_SECONDS) {
            $cached = json_decode((string) file_get_contents($file), true);
            if (is_array($cached) && isset($cached['keys'])) {
                return $cached;
            }
        }
        $client = $this->http ?? new Client(['timeout' => 5, 'connect_timeout' => 3]);
        try {
            $body = (string) $client->get($uri, ['headers' => ['Accept' => 'application/json']])->getBody();
        } catch (\Throwable $e) {
            throw new SocialError(SocialError::FAILED, "Could not download the provider's keys: " . $e->getMessage());
        }
        $keys = json_decode($body, true);
        if (!is_array($keys) || !isset($keys['keys'])) {
            throw new SocialError(SocialError::FAILED, 'The provider returned no keys.');
        }
        if (!is_dir($this->cacheDir)) {
            @mkdir($this->cacheDir, 0750, true);
        }
        @file_put_contents($file, $body, LOCK_EX);
        return $keys;
    }
}
