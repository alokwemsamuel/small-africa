<?php

declare(strict_types=1);

namespace App\Payments;

/**
 * Paystack (https://paystack.com/docs/api/transaction/). Only the secret key talks to the
 * API, and only from the server. Amounts are in kobo, currency NGN.
 */
final class PaystackGateway implements PaymentGateway
{
    private const API = 'https://api.paystack.co';

    public function __construct(private string $secretKey, private HttpClient $http)
    {
        if (!str_starts_with($secretKey, 'sk_')) {
            throw new \RuntimeException('PAYSTACK_SECRET_KEY is missing or invalid.');
        }
    }

    public function name(): string
    {
        return 'paystack';
    }

    public function initialize(string $reference, int $amountKobo, string $email, array $metadata, string $callbackUrl): array
    {
        $data = $this->call('POST', '/transaction/initialize', [
            'email' => $email,
            'amount' => $amountKobo,
            'currency' => 'NGN',
            'reference' => $reference,
            'callback_url' => $callbackUrl,
            'metadata' => $metadata,
            'channels' => ['card', 'bank', 'ussd', 'bank_transfer'],
        ]);
        return ['accessCode' => (string) $data['access_code'], 'authorizationUrl' => (string) $data['authorization_url']];
    }

    public function verify(string $reference): array
    {
        $data = $this->call('GET', '/transaction/verify/' . rawurlencode($reference));
        $status = match ($data['status'] ?? '') {
            'success' => 'success',
            'failed', 'reversed' => 'failed',
            'abandoned' => 'abandoned',
            default => 'pending',
        };
        return [
            'status' => $status,
            'amountKobo' => (int) ($data['amount'] ?? 0),
            'currency' => (string) ($data['currency'] ?? ''),
            'paidAt' => $data['paid_at'] ?? null,
            // Keep only non-sensitive fields (no card BIN/authorization codes).
            'raw' => array_intersect_key($data, array_flip(['id', 'status', 'reference', 'amount', 'currency', 'channel', 'paid_at', 'gateway_response'])),
        ];
    }

    public function verifyWebhookSignature(string $rawBody, string $signature): bool
    {
        return $signature !== '' && hash_equals(hash_hmac('sha512', $rawBody, $this->secretKey), $signature);
    }

    /**
     * @param array<string, mixed>|null $body
     * @return array<string, mixed>
     */
    private function call(string $method, string $path, ?array $body = null): array
    {
        $res = $this->http->request($method, self::API . $path, [
            'Authorization' => 'Bearer ' . $this->secretKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ], $body !== null ? json_encode($body, JSON_THROW_ON_ERROR) : null);
        $json = json_decode($res['body'], true);
        if ($res['status'] >= 400 || !is_array($json) || empty($json['status'])) {
            throw new \RuntimeException('Paystack error ' . $res['status'] . ': ' . (is_array($json) ? ($json['message'] ?? '') : 'invalid response'));
        }
        return (array) ($json['data'] ?? []);
    }
}
