<?php

declare(strict_types=1);

namespace App\Payments;

use App\Support\Database;

/**
 * Stand-in for Paystack in local development, automated tests and the client demo. No money
 * moves. A payment counts as successful only after the dev-only "simulate" endpoint marks it,
 * mirroring the real flow (browser checkout → server verification). Refused in production.
 */
final class SimulatedGateway implements PaymentGateway
{
    public const WEBHOOK_SECRET = 'simulated-webhook-secret';

    public function __construct(private Database $db)
    {
    }

    public function name(): string
    {
        return 'simulated';
    }

    public function initialize(string $reference, int $amountKobo, string $email, array $metadata, string $callbackUrl): array
    {
        return ['accessCode' => 'sim_' . $reference, 'authorizationUrl' => null];
    }

    public function verify(string $reference): array
    {
        $row = $this->db->one('SELECT amount_kobo, provider_payload FROM payments WHERE reference = ?', [$reference]);
        $payload = $row ? (array) json_decode((string) $row['provider_payload'], true) : [];
        $outcome = $payload['simulated_outcome'] ?? 'pending';
        return [
            'status' => in_array($outcome, ['success', 'failed', 'abandoned'], true) ? $outcome : 'pending',
            'amountKobo' => (int) ($row['amount_kobo'] ?? 0),
            'currency' => 'NGN',
            'paidAt' => $outcome === 'success' ? date(DATE_ATOM) : null,
            'raw' => ['simulated' => true, 'status' => $outcome],
        ];
    }

    public function verifyWebhookSignature(string $rawBody, string $signature): bool
    {
        return $signature !== '' && hash_equals(hash_hmac('sha512', $rawBody, self::WEBHOOK_SECRET), $signature);
    }
}
