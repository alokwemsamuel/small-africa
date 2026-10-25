<?php

declare(strict_types=1);

namespace App\Payments;

use App\Http\HttpError;
use App\Support\Database;
use App\Support\Logger;

/**
 * Payment attempts for anything payable (orders, wallet top-ups).
 *
 * Paystack rejects a transaction reference that was used before, so:
 *  - an attempt the guest abandoned (popup closed) is resumed with its saved access code;
 *  - after a declined or failed attempt, the next one gets a new reference: SA-ABC123-2, -3…
 * The first attempt uses the payable's own reference, so receipts and the dashboard match.
 */
final class PaymentAttempts
{
    public const MAX_ATTEMPTS = 9;

    public function __construct(private Database $db, private PaymentGateway $gateway, private Logger $logger)
    {
    }

    /** @return array<string, mixed>|null */
    public function latest(string $purpose, int $payableId): ?array
    {
        return $this->db->one(
            'SELECT * FROM payments WHERE purpose = ? AND payable_id = ? ORDER BY attempt DESC, id DESC LIMIT 1',
            [$purpose, $payableId],
        );
    }

    /** @return array<string, mixed>|null */
    public function byReference(string $reference): ?array
    {
        return $this->db->one('SELECT * FROM payments WHERE reference = ?', [$reference]);
    }

    /**
     * Returns what the browser needs to open the payment popup.
     *
     * @param array<string, mixed> $metadata
     * @return array{provider: string, reference: string, accessCode: string, authorizationUrl: string|null}
     */
    public function start(string $purpose, int $payableId, ?int $userId, string $baseReference, int $amountKobo, string $email, array $metadata, string $callbackUrl): array
    {
        $attempt = $this->db->transaction(function () use ($purpose, $payableId, $userId, $baseReference, $amountKobo): array {
            $rows = $this->db->all(
                'SELECT * FROM payments WHERE purpose = ? AND payable_id = ? ORDER BY attempt DESC, id DESC FOR UPDATE',
                [$purpose, $payableId],
            );
            $latest = $rows[0] ?? null;
            foreach ($rows as $r) {
                if ($r['status'] === 'success') {
                    throw HttpError::conflict('This has already been paid.');
                }
            }
            if ($latest && $latest['status'] === 'initialized' && (int) $latest['amount_kobo'] === $amountKobo && $latest['provider'] === $this->gateway->name()) {
                return $latest; // resume (saved access code) or first initialisation
            }
            $n = $latest ? (int) $latest['attempt'] + 1 : 1;
            if ($n > self::MAX_ATTEMPTS) {
                throw HttpError::conflict('Too many payment attempts. Please contact us and we’ll help you finish your order.');
            }
            $id = $this->db->insert('payments', [
                'user_id' => $userId,
                'purpose' => $purpose,
                'payable_id' => $payableId,
                'provider' => $this->gateway->name(),
                'reference' => $n === 1 ? $baseReference : "{$baseReference}-{$n}",
                'attempt' => $n,
                'amount_kobo' => $amountKobo,
                'status' => 'initialized',
            ]);
            return $this->db->one('SELECT * FROM payments WHERE id = ?', [$id]) ?? [];
        });

        if ($attempt['access_code']) {
            return $this->publicAttempt($attempt);
        }
        try {
            $init = $this->gateway->initialize($attempt['reference'], (int) $attempt['amount_kobo'], $email, $metadata + ['purpose' => $purpose], $callbackUrl);
        } catch (\Throwable $e) {
            $this->logger->error('Payment initialisation failed', ['reference' => $attempt['reference'], 'error' => $e->getMessage()]);
            // A reference Paystack has already seen can never be initialised again: retire it so
            // the next try gets a fresh one instead of failing forever.
            if (str_contains(strtolower($e->getMessage()), 'duplicate')) {
                $this->db->run("UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'initialized'", [$attempt['id']]);
            }
            throw new HttpError(502, 'We couldn’t start the payment. Please try again in a moment.', 'payment_unavailable');
        }
        $this->db->run(
            'UPDATE payments SET access_code = ?, authorization_url = ? WHERE id = ?',
            [$init['accessCode'], $init['authorizationUrl'], $attempt['id']],
        );
        return ['provider' => $this->gateway->name(), 'reference' => $attempt['reference'], 'accessCode' => $init['accessCode'], 'authorizationUrl' => $init['authorizationUrl']];
    }

    /**
     * Asks the gateway about the latest attempt and records failures. Success is left to the
     * caller, which applies it exactly once under its own lock.
     *
     * @param array<string, mixed> $payment
     * @return array{status: string, amountKobo: int, currency: string, paidAt: ?string, raw: array<string, mixed>}
     */
    public function check(array $payment): array
    {
        $result = $this->gateway->verify($payment['reference']);
        if (in_array($result['status'], ['failed', 'abandoned'], true)) {
            $this->db->run(
                "UPDATE payments SET status = ?, provider_payload = ? WHERE id = ? AND status = 'initialized'",
                [$result['status'], json_encode($result['raw']), $payment['id']],
            );
        }
        return $result;
    }

    /**
     * Marks an attempt successful after checking the amount. Must run inside the caller's
     * transaction; returns false (and records why) when the payment must not be applied.
     *
     * @param array{status: string, amountKobo: int, currency: string, paidAt: ?string, raw: array<string, mixed>} $result
     */
    public function markSuccess(string $reference, array $result, string $now): bool
    {
        $payment = $this->db->one('SELECT * FROM payments WHERE reference = ? FOR UPDATE', [$reference]);
        if (!$payment || $payment['status'] === 'success') {
            return false;
        }
        if ($result['amountKobo'] !== (int) $payment['amount_kobo'] || $result['currency'] !== 'NGN') {
            $this->db->run("UPDATE payments SET status = 'failed', provider_payload = ? WHERE id = ?", [json_encode($result['raw'] + ['mismatch' => true]), $payment['id']]);
            $this->logger->warning('Payment amount/currency mismatch', ['reference' => $reference, 'expected' => $payment['amount_kobo'], 'got' => $result['amountKobo'], 'currency' => $result['currency']]);
            return false;
        }
        $this->db->run("UPDATE payments SET status = 'success', verified_at = ?, provider_payload = ? WHERE id = ?", [$now, json_encode($result['raw']), $payment['id']]);
        return true;
    }

    /** @param array<string, mixed> $p */
    private function publicAttempt(array $p): array
    {
        return ['provider' => $p['provider'], 'reference' => $p['reference'], 'accessCode' => $p['access_code'], 'authorizationUrl' => $p['authorization_url']];
    }
}
