<?php

declare(strict_types=1);

namespace Tests\Support;

use Firebase\JWT\JWT;

/** A throw-away RSA key pair, its public key as a JWKS, and signed ID tokens: real signature checks, no network. */
final class TestKeys
{
    /** @var array<string, array{pem: string, jwks: array<string, mixed>}> */
    private static array $cache = [];

    /** PHP on Windows (XAMPP) needs to be told where OpenSSL's config file is; elsewhere nothing is needed. */
    private static function opensslOptions(): array
    {
        foreach (['C:/xampp/php/extras/ssl/openssl.cnf', 'C:/xampp/apache/conf/openssl.cnf'] as $file) {
            if (!getenv('OPENSSL_CONF') && is_file($file)) {
                return ['config' => $file];
            }
        }
        return [];
    }

    /** @return array{pem: string, jwks: array<string, mixed>} */
    public static function newRsa(string $kid): array
    {
        $options = self::opensslOptions();
        $res = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA] + $options);
        openssl_pkey_export($res, $pem, null, $options);
        $rsa = openssl_pkey_get_details($res)['rsa'];
        $b64 = static fn (string $v): string => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        return [
            'pem' => $pem,
            'jwks' => ['keys' => [['kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => $kid, 'n' => $b64($rsa['n']), 'e' => $b64($rsa['e'])]]],
        ];
    }

    /** @return array{pem: string, jwks: array<string, mixed>, kid: string} the same key every time for the same $kid */
    public static function rsa(string $kid = 'test-key-1'): array
    {
        return (self::$cache[$kid] ??= self::newRsa($kid)) + ['kid' => $kid];
    }

    /** @param array<string, mixed> $claims */
    public static function idToken(array $key, array $claims, string $alg = 'RS256'): string
    {
        return JWT::encode($claims, $alg === 'RS256' ? $key['pem'] : 'not-a-secret-just-a-test-key-0123456789', $alg, $key['kid']);
    }

    /** A P-256 key in PEM form, as Apple's downloadable .p8 file (used to sign the client secret). */
    public static function ecPem(): string
    {
        $options = self::opensslOptions();
        $res = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC] + $options);
        openssl_pkey_export($res, $pem, null, $options);
        return $pem;
    }
}
