<?php

declare(strict_types=1);

namespace App\Services;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\ValidationError;
use App\Loyalty\Ledger;
use App\Loyalty\LoyaltyService;
use App\Mail\EmailTemplates;
use App\Mail\Mailer;
use App\Payments\PaymentAttempts;
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

    /** Unpaid orders are cancelled (and any dining credit returned) after this long. */
    public const UNPAID_EXPIRY_MINUTES = 120;

    public function __construct(
        private Database $db,
        private PricingService $pricing,
        private PaymentAttempts $attempts,
        private Ledger $ledger,
        private LoyaltyService $loyalty,
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
     * Creates an order and starts payment. Dining credit and reward vouchers are reserved
     * immediately (and released if the order is cancelled or expires unpaid). Re-sending the
     * same Idempotency-Key returns the same order instead of creating a duplicate.
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
        $now = $this->clock->sql();

        $order = $this->db->transaction(function () use ($req, $quote, $userId, $reference, $idempotencyKey, $now): array {
            $walletApplied = (int) $quote['walletAppliedKobo'];
            $payable = (int) $quote['payableKobo'];
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
                'voucher_discount_kobo' => $quote['voucherDiscountKobo'],
                'delivery_fee_kobo' => $quote['deliveryFeeKobo'] + $quote['packagingFeeKobo'],
                'service_charge_kobo' => $quote['serviceChargeKobo'],
                'vat_included_kobo' => $quote['vatIncludedKobo'],
                'wallet_applied_kobo' => $walletApplied,
                'total_kobo' => $payable,
                'coupon_id' => $quote['coupon']['id'] ?? null,
                'voucher_id' => $quote['voucher']['id'] ?? null,
                'notes' => $req['notes'] ?? null,
                'idempotency_key' => $idempotencyKey,
                'status_updated_at' => $now,
                'created_at' => $now,
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
            $this->db->insert('order_status_history', ['order_id' => $orderId, 'status' => 'pending_payment', 'created_at' => $now]);
            if ($quote['voucher']) {
                $claimed = $this->db->run(
                    "UPDATE reward_vouchers SET status = 'used', used_order_id = ? WHERE id = ? AND user_id = ? AND status = 'issued'",
                    [$orderId, $quote['voucher']['id'], $userId],
                )->rowCount();
                if ($claimed !== 1) {
                    throw ValidationError::field('voucher_code', 'That voucher has just been used.');
                }
            }
            if ($walletApplied > 0) {
                $this->ledger->wallet((int) $userId, 'debit', 'payment', $walletApplied, "Order {$reference}", $reference, "order-wallet:{$reference}");
            }
            if ($payable === 0) {
                // Paid entirely with dining credit: no card payment needed.
                $this->db->insert('payments', [
                    'user_id' => $userId, 'purpose' => 'order', 'payable_id' => $orderId, 'provider' => 'wallet',
                    'reference' => "{$reference}-W", 'amount_kobo' => $walletApplied, 'status' => 'success', 'verified_at' => $now,
                ]);
                $this->applyPaid($this->db->one('SELECT * FROM orders WHERE id = ? FOR UPDATE', [$orderId]) ?? [], $now);
            }
            return $this->db->one('SELECT * FROM orders WHERE id = ?', [$orderId]) ?? [];
        });

        $this->audit->record($userId, 'order.created', 'order', $reference, ['total_kobo' => (int) $order['total_kobo'], 'wallet_kobo' => (int) $order['wallet_applied_kobo']]);
        if ($order['payment_status'] === 'paid') {
            $this->afterPaid($order);
        }
        return $this->resume($order);
    }

    /**
     * Payment details for an order (new or replayed): a fresh or resumed payment attempt.
     *
     * @param array<string, mixed> $order
     * @return array<string, mixed>
     */
    private function resume(array $order): array
    {
        $trackingToken = $this->trackingToken($order['reference']);
        $payment = null;
        if ($order['payment_status'] !== 'paid') {
            if ($order['status'] === 'cancelled') {
                throw HttpError::conflict('This order expired before it was paid. Please place it again.', 'order_expired');
            }
            $payment = $this->attempts->start(
                'order', (int) $order['id'], $order['user_id'] ? (int) $order['user_id'] : null, $order['reference'],
                (int) $order['total_kobo'], $order['customer_email'], ['order_reference' => $order['reference']],
                "{$this->frontendUrl}/orders/{$order['reference']}?t={$trackingToken}",
            );
            $this->db->run("UPDATE orders SET payment_status = 'unpaid' WHERE id = ? AND payment_status = 'failed'", [$order['id']]);
        }
        return ['order' => $this->toPublic($order), 'payment' => $payment, 'trackingToken' => $trackingToken];
    }

    /**
     * Confirms an order's latest payment attempt by asking the gateway (never the browser).
     *
     * @return array<string, mixed> public order
     */
    public function verifyPayment(string $orderReference): array
    {
        $order = $this->db->one('SELECT * FROM orders WHERE reference = ?', [strtoupper($orderReference)]);
        if (!$order) {
            throw HttpError::notFound('We couldn’t find that payment.');
        }
        if ($order['payment_status'] !== 'paid') {
            $payment = $this->attempts->latest('order', (int) $order['id']);
            if ($payment && $payment['status'] !== 'success' && $payment['provider'] !== 'wallet') {
                $result = $this->attempts->check($payment);
                if ($result['status'] === 'success') {
                    $this->markPaid($payment['reference'], $result);
                } elseif ($result['status'] === 'failed') {
                    $this->db->run("UPDATE orders SET payment_status = 'failed' WHERE id = ? AND payment_status = 'unpaid'", [$order['id']]);
                }
            }
        }
        return $this->toPublic($this->db->one('SELECT * FROM orders WHERE id = ?', [$order['id']]) ?? $order);
    }

    /**
     * Applies a verified payment attempt exactly once: the row locks plus status checks mean
     * the browser callback and the webhook can arrive together safely.
     *
     * @param array{status: string, amountKobo: int, currency: string, paidAt: ?string, raw: array<string, mixed>} $result
     */
    public function markPaid(string $paymentReference, array $result): void
    {
        $order = $this->db->transaction(function () use ($paymentReference, $result): ?array {
            $now = $this->clock->sql();
            if (!$this->attempts->markSuccess($paymentReference, $result, $now)) {
                return null;
            }
            $payment = $this->attempts->byReference($paymentReference);
            $order = $this->db->one('SELECT * FROM orders WHERE id = ? FOR UPDATE', [$payment['payable_id']]);
            if (!$order) {
                return null;
            }
            if ($order['payment_status'] === 'paid' || $order['status'] === 'cancelled') {
                // Money arrived for an order that is already paid or was cancelled: flag for refund.
                $this->logger->warning('Payment needs refund', ['reference' => $paymentReference, 'order' => $order['reference'], 'status' => $order['status']]);
                $this->audit->record(null, 'payment.needs_refund', 'payment', $paymentReference, ['order' => $order['reference'], 'amount_kobo' => $result['amountKobo']]);
                return null;
            }
            $this->applyPaid($order, $now);
            return $this->db->one('SELECT * FROM orders WHERE id = ?', [$order['id']]);
        });
        if ($order !== null) {
            $this->afterPaid($order);
        }
    }

    /**
     * Cancels orders left unpaid for too long and returns any dining credit or voucher they held.
     *
     * @return int orders cancelled
     */
    public function expireUnpaid(): int
    {
        $cutoff = $this->clock->sql($this->clock->now()->modify('-' . self::UNPAID_EXPIRY_MINUTES . ' minutes'));
        $count = 0;
        foreach ($this->db->all("SELECT reference FROM orders WHERE status = 'pending_payment' AND created_at < ?", [$cutoff]) as $row) {
            try {
                // A late success still counts: check with the gateway before giving up on it.
                if ($this->verifyPayment($row['reference'])['paymentStatus'] === 'paid') {
                    continue;
                }
            } catch (\Throwable $e) {
                $this->logger->warning('Could not verify stale order', ['reference' => $row['reference'], 'error' => $e->getMessage()]);
                continue;
            }
            $cancelled = $this->db->transaction(function () use ($row): bool {
                $order = $this->db->one('SELECT * FROM orders WHERE reference = ? FOR UPDATE', [$row['reference']]);
                if (!$order || $order['status'] !== 'pending_payment') {
                    return false;
                }
                $now = $this->clock->sql();
                $this->db->run(
                    "UPDATE orders SET status = 'cancelled', cancelled_reason = 'Payment not completed', status_updated_at = ? WHERE id = ?",
                    [$now, $order['id']],
                );
                $this->db->insert('order_status_history', ['order_id' => $order['id'], 'status' => 'cancelled', 'note' => 'Payment not completed', 'created_at' => $now]);
                $this->releaseHolds($order);
                return true;
            });
            $count += $cancelled ? 1 : 0;
        }
        return $count;
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
     * Changes an order's status along the allowed path (used by staff tools). Completing an
     * order earns Interest Account points; cancelling returns held dining credit and vouchers.
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
            $now = $this->clock->sql();
            $this->db->run('UPDATE orders SET status = ?, status_updated_at = ? WHERE id = ?', [$to, $now, $order['id']]);
            $this->db->insert('order_status_history', ['order_id' => $order['id'], 'status' => $to, 'note' => $note, 'changed_by_user_id' => $actorId, 'created_at' => $now]);
            if ($to === 'cancelled') {
                $this->releaseHolds($order);
            }
        });
        $this->audit->record($actorId, 'order.status', 'order', $reference, ['from' => $order['status'], 'to' => $to]);
        if (in_array($to, ['ready', 'out_for_delivery'], true)) {
            $this->sendStatusEmail($order, $to);
        }
        if (in_array($to, ['delivered', 'completed'], true)) {
            try {
                $this->loyalty->onOrderCompleted((int) $order['id']);
            } catch (\Throwable $e) {
                // The order is complete either way; the daily job retries unprocessed orders.
                $this->logger->error('Loyalty processing failed', ['reference' => $reference, 'error' => $e->getMessage()]);
            }
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
            'voucherDiscountKobo' => (int) $o['voucher_discount_kobo'],
            'deliveryFeeKobo' => (int) $o['delivery_fee_kobo'],
            'serviceChargeKobo' => (int) $o['service_charge_kobo'],
            'vatIncludedKobo' => (int) $o['vat_included_kobo'],
            'walletAppliedKobo' => (int) $o['wallet_applied_kobo'],
            'totalKobo' => (int) $o['total_kobo'],
            'pointsEarned' => (int) $o['points_earned'],
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

    /**
     * Marks a locked order paid. Runs inside the caller's transaction.
     *
     * @param array<string, mixed> $order
     */
    private function applyPaid(array $order, string $now): void
    {
        $this->db->run(
            "UPDATE orders SET payment_status = 'paid', status = 'received', placed_at = ?, status_updated_at = ? WHERE id = ?",
            [$now, $now, $order['id']],
        );
        $this->db->insert('order_status_history', ['order_id' => $order['id'], 'status' => 'received', 'created_at' => $now]);
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
    }

    /** @param array<string, mixed> $order */
    private function afterPaid(array $order): void
    {
        $this->audit->record($order['user_id'] ? (int) $order['user_id'] : null, 'order.paid', 'order', $order['reference'], [
            'total_kobo' => (int) $order['total_kobo'], 'wallet_kobo' => (int) $order['wallet_applied_kobo'],
        ]);
        $this->sendConfirmation($order);
    }

    /**
     * Returns dining credit and the voucher held by an order. Idempotent; runs in the caller's transaction.
     *
     * @param array<string, mixed> $order
     */
    private function releaseHolds(array $order): void
    {
        if ((int) $order['wallet_applied_kobo'] > 0 && $order['user_id']) {
            $this->ledger->wallet(
                (int) $order['user_id'], 'credit', 'refund', (int) $order['wallet_applied_kobo'],
                "Returned from cancelled order {$order['reference']}", $order['reference'], "order-wallet-refund:{$order['reference']}",
            );
        }
        if ($order['voucher_id']) {
            $this->db->run(
                "UPDATE reward_vouchers SET status = 'issued', used_order_id = NULL WHERE id = ? AND used_order_id = ?",
                [$order['voucher_id'], $order['id']],
            );
        }
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
