<?php

declare(strict_types=1);

namespace App\Services;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Mail\EmailTemplates;
use App\Mail\Mailer;
use App\Payments\PaymentGateway;
use App\Security\Crypto;
use App\Security\RateLimiter;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Logger;

final class OrderService
{
    /** Allowed status moves (staff tools in Phase 6 use the same rules). */
    public const TRANSITIONS = [
        'received' => ['preparing', 'cancelled'],
        'preparing' => ['ready', 'cancelled'],
        'ready' => ['out_for_delivery', 'completed'],
        'out_for_delivery' => ['delivered'],
        'delivered' => [],
        'completed' => [],
        'cancelled' => [],
        'pending_payment' => ['cancelled'],
    ];

    public function __construct(
        private Database $db,
        private PricingService $pricing,
        private PaymentGateway $gateway,
        private RateLimiter $limiter,
        private Mailer $mailer,
        private EmailTemplates $emails,
        private AuditLogger $audit,
        private Clock $clock,
        private Logger $logger,
        private Crypto $crypto,
        private string $frontendUrl,
    ) {
    }

    /**
     * Creates a pending order and starts payment. Re-sending the same Idempotency-Key returns
     * the same order instead of creating a duplicate.
     *
     * @param array<string, mixed> $req validated checkout request
     * @param array<string, mixed>|null $user
     * @return array<string, mixed>
     */
    public function create(array $req, ?array $user, string $ip, ?string $idempotencyKey): array
    {
        $this->limiter->hit("checkout:ip:{$ip}", 20, 3600);
        if ($idempotencyKey !== null && !preg_match('/^[A-Za-z0-9_-]{16,80}$/', $idempotencyKey)) {
            throw HttpError::badRequest('Invalid Idempotency-Key header.');
        }
        if ($idempotencyKey !== null) {
            $existing = $this->db->one('SELECT * FROM orders WHERE idempotency_key = ?', [$idempotencyKey]);
            if ($existing) {
                if ($existing['customer_email'] !== $req['email']) {
                    throw HttpError::conflict('This checkout was already submitted.');
                }
                return $this->resume($existing);
            }
        }

        $userId = $user ? (int) $user['id'] : null;
        $quote = $this->pricing->quote($req, $userId);
        $reference = $this->newReference();
        $trackingToken = $this->trackingToken($reference);
        $now = $this->clock->sql();

        $orderId = $this->db->transaction(function () use ($req, $quote, $userId, $reference, $trackingToken, $idempotencyKey, $now): int {
            $orderId = $this->db->insert('orders', [
                'reference' => $reference,
                'user_id' => $userId,
                'customer_name' => $req['name'],
                'customer_email' => $req['email'],
                'customer_phone' => $req['phone'],
                'fulfilment' => $quote['fulfilment'],
                'delivery_zone_id' => $quote['zone']['id'] ?? null,
                'address_snapshot' => $quote['fulfilment'] === 'delivery' ? json_encode($req['address'], JSON_UNESCAPED_UNICODE) : null,
                'scheduled_for' => $quote['scheduledFor'] ? $quote['scheduledFor'] . ':00' : null,
                'status' => 'pending_payment',
                'payment_status' => 'unpaid',
                'subtotal_kobo' => $quote['subtotalKobo'],
                'discount_kobo' => $quote['discountKobo'],
                'delivery_fee_kobo' => $quote['deliveryFeeKobo'] + $quote['packagingFeeKobo'],
                'service_charge_kobo' => $quote['serviceChargeKobo'],
                'vat_included_kobo' => $quote['vatIncludedKobo'],
                'total_kobo' => $quote['totalKobo'],
                'coupon_id' => $quote['coupon']['id'] ?? null,
                'notes' => $req['notes'] ?? null,
                'idempotency_key' => $idempotencyKey,
                'status_updated_at' => $now,
            ]);
            foreach ($quote['lines'] as $l) {
                $this->db->insert('order_items', [
                    'order_id' => $orderId,
                    'dish_id' => $l['dishId'],
                    'dish_name' => $l['name'],
                    'kitchen_id' => $l['kitchenId'],
                    'unit_price_kobo' => $l['unitPriceKobo'],
                    'quantity' => $l['quantity'],
                    'options' => json_encode(['portion' => $l['portion'], 'addons' => $l['addons'], 'containsPork' => $l['containsPork']], JSON_UNESCAPED_UNICODE),
                    'line_total_kobo' => $l['lineTotalKobo'],
                    'notes' => $l['note'],
                ]);
            }
            $this->db->insert('order_status_history', ['order_id' => $orderId, 'status' => 'pending_payment']);
            $this->db->insert('payments', [
                'user_id' => $userId,
                'purpose' => 'order',
                'payable_id' => $orderId,
                'provider' => $this->gateway->name(),
                'reference' => $reference,
                'amount_kobo' => $quote['totalKobo'],
                'status' => 'initialized',
            ]);
            return $orderId;
        });

        $order = $this->db->one('SELECT * FROM orders WHERE id = ?', [$orderId]);
        $result = $this->resume($order);
        $this->audit->record($userId, 'order.created', 'order', $reference, ['total_kobo' => $quote['totalKobo']]);
        return $result;
    }

    /**
     * Payment details for a pending order (new or replayed).
     *
     * @param array<string, mixed> $order
     * @return array<string, mixed>
     */
    private function resume(array $order): array
    {
        $trackingToken = $this->trackingToken($order['reference']);
        $payment = null;
        if ($order['payment_status'] !== 'paid') {
            try {
                $init = $this->gateway->initialize(
                    $order['reference'],
                    (int) $order['total_kobo'],
                    $order['customer_email'],
                    ['order_reference' => $order['reference'], 'purpose' => 'order'],
                    "{$this->frontendUrl}/orders/{$order['reference']}?t={$trackingToken}",
                );
            } catch (\Throwable $e) {
                $this->logger->error('Payment initialisation failed', ['reference' => $order['reference'], 'error' => $e->getMessage()]);
                throw new HttpError(502, 'We couldn’t start the payment. Please try again in a moment.', 'payment_unavailable');
            }
            $payment = ['provider' => $this->gateway->name(), 'reference' => $order['reference']] + $init;
        }
        return ['order' => $this->toPublic($order), 'payment' => $payment, 'trackingToken' => $trackingToken];
    }

    /**
     * Confirms a payment by asking the gateway (never trusting the browser).
     *
     * @return array<string, mixed> public order
     */
    public function verifyPayment(string $reference): array
    {
        $payment = $this->db->one("SELECT * FROM payments WHERE reference = ? AND purpose = 'order'", [$reference]);
        if (!$payment) {
            throw HttpError::notFound('We couldn’t find that payment.');
        }
        if ($payment['status'] !== 'success') {
            $result = $this->gateway->verify($reference);
            if ($result['status'] === 'success') {
                $this->markPaid($reference, $result);
            } elseif (in_array($result['status'], ['failed', 'abandoned'], true)) {
                $this->db->transaction(function () use ($payment, $result): void {
                    $this->db->run("UPDATE payments SET status = ?, provider_payload = ? WHERE id = ? AND status <> 'success'", [$result['status'], json_encode($result['raw']), $payment['id']]);
                    $this->db->run("UPDATE orders SET payment_status = 'failed' WHERE id = ? AND payment_status = 'unpaid'", [$payment['payable_id']]);
                });
            }
        }
        return $this->toPublic($this->db->one('SELECT * FROM orders WHERE id = ?', [$payment['payable_id']]));
    }

    /**
     * Idempotent: the row lock plus the status check mean a payment is applied exactly once,
     * even when the browser callback and the webhook arrive together.
     *
     * @param array{status: string, amountKobo: int, currency: string, paidAt: ?string, raw: array<string, mixed>} $result
     */
    public function markPaid(string $reference, array $result): void
    {
        $orderId = $this->db->transaction(function () use ($reference, $result): ?int {
            $payment = $this->db->one('SELECT * FROM payments WHERE reference = ? FOR UPDATE', [$reference]);
            if (!$payment || $payment['status'] === 'success') {
                return null;
            }
            if ($result['amountKobo'] !== (int) $payment['amount_kobo'] || $result['currency'] !== 'NGN') {
                $this->db->run("UPDATE payments SET status = 'failed', provider_payload = ? WHERE id = ?", [json_encode($result['raw'] + ['mismatch' => true]), $payment['id']]);
                $this->logger->warning('Payment amount/currency mismatch', ['reference' => $reference, 'expected' => $payment['amount_kobo'], 'got' => $result['amountKobo'], 'currency' => $result['currency']]);
                $this->audit->record(null, 'payment.mismatch', 'payment', $reference, ['expected' => (int) $payment['amount_kobo'], 'got' => $result['amountKobo']]);
                return null;
            }
            $now = $this->clock->sql();
            $this->db->run("UPDATE payments SET status = 'success', verified_at = ?, provider_payload = ? WHERE id = ?", [$now, json_encode($result['raw']), $payment['id']]);
            $order = $this->db->one('SELECT * FROM orders WHERE id = ? FOR UPDATE', [$payment['payable_id']]);
            $this->db->run(
                "UPDATE orders SET payment_status = 'paid', status = 'received', placed_at = ?, status_updated_at = ? WHERE id = ?",
                [$now, $now, $order['id']],
            );
            $this->db->insert('order_status_history', ['order_id' => $order['id'], 'status' => 'received']);
            if ($order['coupon_id']) {
                $this->db->insert('coupon_redemptions', [
                    'coupon_id' => $order['coupon_id'], 'user_id' => $order['user_id'], 'order_id' => $order['id'], 'discount_kobo' => $order['discount_kobo'],
                ]);
                $this->db->run('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?', [$order['coupon_id']]);
            }
            $this->db->run(
                'UPDATE dishes d JOIN order_items oi ON oi.dish_id = d.id SET d.popularity = d.popularity + oi.quantity WHERE oi.order_id = ?',
                [$order['id']],
            );
            return (int) $order['id'];
        });
        if ($orderId !== null) {
            $order = $this->db->one('SELECT * FROM orders WHERE id = ?', [$orderId]);
            $this->audit->record($order['user_id'] ? (int) $order['user_id'] : null, 'order.paid', 'order', $order['reference'], ['total_kobo' => (int) $order['total_kobo']]);
            $this->sendConfirmation($order);
        }
    }

    /** Paystack webhook: authenticated by signature, de-duplicated, then re-verified via the API. */
    public function handleWebhook(string $rawBody, string $signature): void
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
            $isOrder = $this->db->scalar("SELECT 1 FROM payments WHERE reference = ? AND purpose = 'order'", [$reference]);
            if ($isOrder) {
                $this->verifyPayment($reference);
            }
        }
        $this->db->run('UPDATE webhook_events SET processed_at = ? WHERE provider = ? AND event_key = ?', [$this->clock->sql(), $this->gateway->name(), $key]);
    }

    /**
     * @param array<string, mixed>|null $user
     * @return array<string, mixed>
     */
    public function findForTracking(string $reference, ?array $user, ?string $token): array
    {
        $order = $this->db->one('SELECT * FROM orders WHERE reference = ?', [strtoupper($reference)]);
        $owner = $order && $user && (int) $order['user_id'] === (int) $user['id'];
        $staff = $user && in_array($user['role'], AuthService::STAFF_ROLES, true);
        $tokenOk = $order && $token && hash_equals($this->trackingToken($order['reference']), $token);
        if (!$order || !($owner || $staff || $tokenOk)) {
            // Same answer for "doesn't exist" and "not yours": references can't be probed.
            throw HttpError::notFound('We couldn’t find that order.');
        }
        return $this->toPublic($order, true);
    }

    /** @return list<array<string, mixed>> */
    public function listForUser(int $userId): array
    {
        return array_map(fn ($o) => $this->toPublic($o, true), $this->db->all(
            "SELECT * FROM orders WHERE user_id = ? AND status <> 'pending_payment' ORDER BY created_at DESC LIMIT 50",
            [$userId],
        ));
    }

    /**
     * Changes an order's status along the allowed path (used by staff tools).
     */
    public function updateStatus(string $reference, string $to, ?int $actorId, ?string $note = null): void
    {
        $order = $this->db->one('SELECT * FROM orders WHERE reference = ?', [$reference]);
        if (!$order) {
            throw HttpError::notFound();
        }
        $allowed = self::TRANSITIONS[$order['status']] ?? [];
        if ($to === 'out_for_delivery' && $order['fulfilment'] === 'pickup') {
            $allowed = [];
        }
        if ($to === 'completed' && $order['fulfilment'] === 'delivery') {
            $allowed = [];
        }
        if (!in_array($to, $allowed, true)) {
            throw HttpError::conflict("An order that is {$order['status']} can’t move to {$to}.");
        }
        $this->db->transaction(function () use ($order, $to, $actorId, $note): void {
            $this->db->run('UPDATE orders SET status = ?, status_updated_at = ? WHERE id = ?', [$to, $this->clock->sql(), $order['id']]);
            $this->db->insert('order_status_history', ['order_id' => $order['id'], 'status' => $to, 'note' => $note, 'changed_by_user_id' => $actorId]);
        });
        $this->audit->record($actorId, 'order.status', 'order', $reference, ['from' => $order['status'], 'to' => $to]);
        if (in_array($to, ['ready', 'out_for_delivery'], true)) {
            $this->sendStatusEmail($order, $to);
        }
    }

    /**
     * @param array<string, mixed> $o
     * @return array<string, mixed>
     */
    public function toPublic(array $o, bool $withDetail = false): array
    {
        $zone = $o['delivery_zone_id'] ? $this->db->one('SELECT name, eta_minutes FROM delivery_zones WHERE id = ?', [$o['delivery_zone_id']]) : null;
        $public = [
            'reference' => $o['reference'],
            'status' => $o['status'],
            'paymentStatus' => $o['payment_status'],
            'fulfilment' => $o['fulfilment'],
            'zone' => $zone ? ['name' => $zone['name'], 'etaMinutes' => (int) $zone['eta_minutes']] : null,
            'scheduledFor' => $o['scheduled_for'],
            'placedAt' => $o['placed_at'],
            'createdAt' => $o['created_at'],
            'customerName' => $o['customer_name'],
            'subtotalKobo' => (int) $o['subtotal_kobo'],
            'discountKobo' => (int) $o['discount_kobo'],
            'deliveryFeeKobo' => (int) $o['delivery_fee_kobo'],
            'serviceChargeKobo' => (int) $o['service_charge_kobo'],
            'vatIncludedKobo' => (int) $o['vat_included_kobo'],
            'totalKobo' => (int) $o['total_kobo'],
        ];
        if ($withDetail) {
            $public['items'] = array_map(static function ($i) {
                $opts = (array) json_decode((string) $i['options'], true);
                return [
                    'dishId' => $i['dish_id'] !== null ? (int) $i['dish_id'] : null,
                    'slug' => $i['slug'] ?? null,
                    'name' => $i['dish_name'],
                    'quantity' => (int) $i['quantity'],
                    'unitPriceKobo' => (int) $i['unit_price_kobo'],
                    'lineTotalKobo' => (int) $i['line_total_kobo'],
                    'portion' => $opts['portion'] ?? null,
                    'addons' => $opts['addons'] ?? [],
                    'containsPork' => (bool) ($opts['containsPork'] ?? false),
                    'note' => $i['notes'],
                ];
            }, $this->db->all('SELECT oi.*, d.slug FROM order_items oi LEFT JOIN dishes d ON d.id = oi.dish_id WHERE oi.order_id = ? ORDER BY oi.id', [$o['id']]));
            $public['history'] = array_map(static fn ($h) => ['status' => $h['status'], 'at' => $h['created_at']], $this->db->all(
                'SELECT status, created_at FROM order_status_history WHERE order_id = ? ORDER BY id',
                [$o['id']],
            ));
            $address = $o['address_snapshot'] ? (array) json_decode((string) $o['address_snapshot'], true) : null;
            // Only the area is shown on the tracking page, never the full street address.
            $public['deliveryArea'] = $address ? ($address['area'] ?? $zone['name'] ?? null) : null;
            $public['reviewable'] = in_array($o['status'], ['delivered', 'completed'], true);
        }
        return $public;
    }

    private function newReference(): string
    {
        do {
            $ref = Crypto::code(6, 'SA-');
        } while ($this->db->scalar('SELECT 1 FROM orders WHERE reference = ?', [$ref]));
        return $ref;
    }

    /** @param array<string, mixed> $order */
    private function sendConfirmation(array $order): void
    {
        $detail = $this->toPublic($order, true);
        $rows = array_map(static fn ($i) => [$i['quantity'] . ' × ' . $i['name'] . ($i['portion'] ? " ({$i['portion']['name']})" : ''), $i['lineTotalKobo']], $detail['items']);
        $mail = $this->emails->orderConfirmation($order, $rows, $this->trackUrl($order));
        $this->deliver($order, $mail);
    }

    /** @param array<string, mixed> $order */
    private function sendStatusEmail(array $order, string $status): void
    {
        $mail = $this->emails->orderStatus($order, $status, $this->trackUrl($order));
        $this->deliver($order, $mail);
    }

    /** @param array<string, mixed> $order */
    private function trackUrl(array $order): string
    {
        return "{$this->frontendUrl}/orders/{$order['reference']}?t=" . $this->trackingToken($order['reference']);
    }

    public function trackingToken(string $reference): string
    {
        return $this->crypto->mac('order-track', $reference);
    }

    /**
     * @param array<string, mixed> $order
     * @param array{subject: string, html: string, text: string} $mail
     */
    private function deliver(array $order, array $mail): void
    {
        try {
            $this->mailer->send($order['customer_email'], $order['customer_name'], $mail['subject'], $mail['html'], $mail['text']);
        } catch (\Throwable $e) {
            $this->logger->error('Order email failed', ['reference' => $order['reference'], 'error' => $e->getMessage()]);
        }
    }
}
