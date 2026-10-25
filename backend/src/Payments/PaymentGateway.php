<?php

declare(strict_types=1);

namespace App\Payments;

interface PaymentGateway
{
    public function name(): string;

    /**
     * Starts a transaction. Returns what the browser needs to open the checkout.
     *
     * @param array<string, mixed> $metadata
     * @return array{accessCode: string, authorizationUrl: string|null}
     */
    public function initialize(string $reference, int $amountKobo, string $email, array $metadata, string $callbackUrl): array;

    /**
     * Asks the provider (never the browser) what happened to a transaction.
     *
     * @return array{status: 'success'|'failed'|'abandoned'|'pending', amountKobo: int, currency: string, paidAt: ?string, raw: array<string, mixed>}
     */
    public function verify(string $reference): array;

    /** Authenticates a webhook call from the provider. */
    public function verifyWebhookSignature(string $rawBody, string $signature): bool;
}
