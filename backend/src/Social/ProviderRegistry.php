<?php

declare(strict_types=1);

namespace App\Social;

use App\Support\Config;

/**
 * The providers that are switched on. A provider is on only when all of its keys are in the
 * environment (see backend/.env.example), so a button never appears for a sign-in that can't work.
 */
final class ProviderRegistry
{
    public const NAMES = ['google', 'apple', 'facebook'];

    /** @param array<string, Provider> $providers keyed by name */
    public function __construct(private array $providers)
    {
    }

    public static function fromConfig(Config $config, IdTokenVerifier $verifier): self
    {
        $providers = [];
        $flag = static fn (string $key): bool => $config->bool($key, true);

        $googleId = $config->str('GOOGLE_CLIENT_ID', '');
        $googleSecret = $config->str('GOOGLE_CLIENT_SECRET', '');
        if ($googleId !== '' && $googleSecret !== '') {
            $providers['google'] = new GoogleProvider($googleId, $googleSecret, $verifier, $flag('GOOGLE_PKCE'));
        }

        $facebookId = $config->str('FACEBOOK_APP_ID', '');
        $facebookSecret = $config->str('FACEBOOK_APP_SECRET', '');
        if ($facebookId !== '' && $facebookSecret !== '') {
            $providers['facebook'] = new FacebookProvider($facebookId, $facebookSecret, $flag('FACEBOOK_PKCE'));
        }

        $appleId = $config->str('APPLE_CLIENT_ID', '');
        $appleTeam = $config->str('APPLE_TEAM_ID', '');
        $appleKey = $config->str('APPLE_KEY_ID', '');
        $applePath = $config->str('APPLE_PRIVATE_KEY_PATH', '');
        if ($appleId !== '' && $appleTeam !== '' && $appleKey !== '' && $applePath !== '' && is_file($applePath)) {
            $providers['apple'] = new AppleProvider($appleId, $appleTeam, $appleKey, $applePath, $verifier, $flag('APPLE_PKCE'));
        }
        return new self($providers);
    }

    /** @return list<string> in the order the buttons appear */
    public function enabled(): array
    {
        return array_values(array_filter(self::NAMES, fn (string $n): bool => isset($this->providers[$n])));
    }

    /** @throws SocialError when the provider is unknown or switched off */
    public function get(string $name): Provider
    {
        return $this->providers[$name] ?? throw new SocialError(SocialError::DISABLED);
    }
}
