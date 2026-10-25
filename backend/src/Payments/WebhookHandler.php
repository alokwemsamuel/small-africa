<?php

declare(strict_types=1);

namespace App\Payments;

use App\Http\HttpError;
use App\Loyalty\WalletService;
use App\Services\OrderService;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Logger;

/**
 * Paystack → us. Authenticated by signature, de-duplicated by event, and never trusted on
 * its own: the payment is re-verified with the Paystack API before anything is credited.
 */
final class WebhookHandler
{
    public function __construct(
        private Database $db,
        private PaymentGateway $gateway,
        private PaymentAttempts $attempts,
        private OrderService $orders,
        private WalletService $wallet,
        private Clock $clock,
        private Logger $logger,
    ) {
    }

    public function handle(string $rawBody, string $signature): void
    {
        $valid = $this->gateway->verifyWebhookSignature($rawBody, $signature);
        $event = json_decode($rawBody, true);
        if (!$valid || !is_array($event)) {
            $this->logger->warning('Rejected webhook', ['valid_signature' => $valid]);
            throw HttpError::unauthorized('Invalid signature.');
        }
        $reference = (string) ($event['data']['reference'] ?? '');
        $key = substr(($event['event'] ?? 'unknown') . ':' . $reference . ':' . ($event['data']['id'] ?? ''), 0, 120);
        try {
            $this->db->insert('webhook_events', ['provider' => $this->gateway->name(), 'event_key' => $key, 'signature_valid' => 1, 'payload' => $rawBody]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') {
                return; // already processed: retries are harmless
            }
            throw $e;
        }
        if (($event['event'] ?? '') === 'charge.success' && $reference !== '') {
            $payment = $this->attempts->byReference($reference);
            if ($payment && $payment['status'] !== 'success') {
                $result = $this->attempts->check($payment);
                if ($result['status'] === 'success') {
                    match ($payment['purpose']) {
                        'order' => $this->orders->markPaid($reference, $result),
                        'wallet_topup' => $this->wallet->credit($reference, $result),
                        default => $this->logger->warning('Webhook for unhandled payment purpose', ['reference' => $reference, 'purpose' => $payment['purpose']]),
                    };
                }
            }
        }
        $this->db->run('UPDATE webhook_events SET processed_at = ? WHERE provider = ? AND event_key = ?', [$this->clock->sql(), $this->gateway->name(), $key]);
    }
}
