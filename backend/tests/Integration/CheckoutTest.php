<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Payments\SimulatedGateway;
use App\Services\OrderService;

/** Clock is frozen at Tuesday 20 Oct 2026, 12:00 Lagos (open 12:00–23:00). */
final class CheckoutTest extends IntegrationTestCase
{
    private function dishId(string $slug): int
    {
        return (int) $this->db->scalar('SELECT id FROM dishes WHERE slug = ?', [$slug]);
    }

    private function optionId(string $slug, string $name): int
    {
        return (int) $this->db->scalar('SELECT o.id FROM dish_options o JOIN dishes d ON d.id = o.dish_id WHERE d.slug = ? AND o.name = ?', [$slug, $name]);
    }

    /** @return array<string, mixed> */
    private function checkout(array $over = []): array
    {
        return $over + [
            'items' => [['dish_id' => $this->dishId('smoky-party-jollof'), 'quantity' => 2]],
            'fulfilment' => 'delivery',
            'zone' => 'lekki',
            'name' => 'Ada Eze',
            'email' => 'ada@example.com',
            'phone' => '08031234567',
            'address' => ['line1' => '12 Admiralty Way', 'landmark' => 'Opposite the bank', 'area' => 'Lekki Phase 1'],
        ];
    }

    /** @return array{0: \Psr\Http\Message\ResponseInterface, 1: array<string, mixed>} */
    private function placeOrder(array $body, ?string $key = null): array
    {
        $headers = $this->spaHeaders() + ($key ? ['Idempotency-Key' => $key] : []);
        return $this->request('POST', '/api/orders', $body, $headers);
    }

    private function pay(string $reference, string $outcome = 'success'): array
    {
        [, $body] = $this->request('POST', '/api/payments/simulate', ['reference' => $reference, 'outcome' => $outcome], $this->spaHeaders());
        return $body;
    }

    public function testQuoteUsesServerPricesNotBrowserPrices(): void
    {
        $body = $this->checkout(['items' => [['dish_id' => $this->dishId('smoky-party-jollof'), 'quantity' => 2, 'unit_price_kobo' => 1, 'price' => 1]]]);
        [$res, $data] = $this->request('POST', '/api/checkout/quote', $body, $this->spaHeaders());
        self::assertSame(200, $res->getStatusCode());
        $q = $data['quote'];
        self::assertSame(3700000, $q['subtotalKobo']); // 2 × ₦18,500
        self::assertSame(250000, $q['deliveryFeeKobo']); // Lekki
        self::assertSame(50000, $q['packagingFeeKobo']);
        self::assertSame(3700000 + 250000 + 50000, $q['totalKobo']);
        self::assertSame((int) floor(3700000 * 750 / 10750), $q['vatIncludedKobo']);
    }

    public function testOptionsMustBelongToTheDish(): void
    {
        $foreign = $this->optionId('ribeye-peppercorn', '450g'); // +₦16,000 option from another dish
        [$res, $data] = $this->request('POST', '/api/checkout/quote', $this->checkout(['items' => [
            ['dish_id' => $this->dishId('smoky-party-jollof'), 'quantity' => 1, 'portion_id' => $foreign],
        ]]), $this->spaHeaders());
        self::assertSame(422, $res->getStatusCode());
        self::assertArrayHasKey('items', $data['error']['fields']);
    }

    public function testPortionAndAddonsArePricedFromTheDatabase(): void
    {
        [, $data] = $this->request('POST', '/api/checkout/quote', $this->checkout(['items' => [[
            'dish_id' => $this->dishId('smoky-party-jollof'), 'quantity' => 1,
            'portion_id' => $this->optionId('smoky-party-jollof', 'Large'),
            'addon_ids' => [$this->optionId('smoky-party-jollof', 'Extra dodo'), $this->optionId('smoky-party-jollof', 'Extra dodo')],
        ]]]), $this->spaHeaders());
        self::assertSame(1850000 + 600000 + 250000, $data['quote']['lines'][0]['unitPriceKobo'], 'Duplicate add-ons are counted once');
    }

    public function testBusinessRulesAreEnforced(): void
    {
        $cases = [
            'alcohol needs age confirmation' => [['items' => [['dish_id' => $this->dishId('house-red-wine'), 'quantity' => 1], ['dish_id' => $this->dishId('smoky-party-jollof'), 'quantity' => 1]]], 'confirm_age'],
            'tasting menu is dine-in only' => [['items' => [['dish_id' => $this->dishId('chefs-tasting-menu'), 'quantity' => 2]]], 'items'],
            'delivery minimum' => [['items' => [['dish_id' => $this->dishId('zobo'), 'quantity' => 1]]], 'items'],
            'unknown zone' => [['zone' => 'abuja'], 'zone'],
            'outside opening hours' => [['scheduled_for' => '2026-10-21 08:00'], 'scheduled_for'],
            'too soon' => [['scheduled_for' => '2026-10-20 12:15'], 'scheduled_for'],
            'too far ahead' => [['scheduled_for' => '2026-11-20 19:00'], 'scheduled_for'],
            'quantity limit' => [['items' => [['dish_id' => $this->dishId('smoky-party-jollof'), 'quantity' => 21]]], 'items'],
        ];
        foreach ($cases as $name => [$over, $field]) {
            [$res, $data] = $this->request('POST', '/api/checkout/quote', $this->checkout($over), $this->spaHeaders());
            self::assertSame(422, $res->getStatusCode(), $name);
            self::assertArrayHasKey($field, $data['error']['fields'], $name);
        }
        [$ok] = $this->request('POST', '/api/checkout/quote', $this->checkout(['scheduled_for' => '2026-10-21 19:30']), $this->spaHeaders());
        self::assertSame(200, $ok->getStatusCode(), 'A valid scheduled time is accepted');
    }

    public function testSoldOutTodayCannotBeOrdered(): void
    {
        $this->db->run("UPDATE dishes SET sold_out_until = '2026-10-20' WHERE slug = 'smoky-party-jollof'");
        [$res, $data] = $this->request('POST', '/api/checkout/quote', $this->checkout(), $this->spaHeaders());
        self::assertSame(422, $res->getStatusCode());
        self::assertStringContainsString('sold out', $data['error']['fields']['items']);
    }

    public function testClosedForAsapOrders(): void
    {
        $this->clock->freeze('2026-10-20 08:00:00');
        [$res, $data] = $this->request('POST', '/api/checkout/quote', $this->checkout(), $this->spaHeaders());
        self::assertSame(422, $res->getStatusCode());
        self::assertArrayHasKey('scheduled_for', $data['error']['fields']);
    }

    public function testCouponRules(): void
    {
        [, $welcome] = $this->request('POST', '/api/checkout/quote', $this->checkout(['coupon_code' => 'welcome10', 'email' => 'new@example.com']), $this->spaHeaders());
        self::assertSame(370000, $welcome['quote']['discountKobo'], '10% of ₦37,000');

        [$fri, $friBody] = $this->request('POST', '/api/checkout/quote', $this->checkout(['coupon_code' => 'JOLLOFFRIDAY']), $this->spaHeaders());
        self::assertSame(422, $fri->getStatusCode());
        self::assertStringContainsString('Fridays', $friBody['error']['fields']['coupon_code']);

        [$pierogi, $pierogiBody] = $this->request('POST', '/api/checkout/quote', $this->checkout(['coupon_code' => 'PIEROGI15']), $this->spaHeaders());
        self::assertSame(422, $pierogi->getStatusCode(), 'Polish-only code needs Polish dishes');
        self::assertStringContainsString('Polish', $pierogiBody['error']['fields']['coupon_code']);

        [, $mixed] = $this->request('POST', '/api/checkout/quote', $this->checkout(['coupon_code' => 'PIEROGI15', 'items' => [
            ['dish_id' => $this->dishId('smoky-party-jollof'), 'quantity' => 1],
            ['dish_id' => $this->dishId('pierogi-ruskie'), 'quantity' => 1],
        ]]), $this->spaHeaders());
        self::assertSame(intdiv(1350000 * 15, 100 * 100) * 100, $mixed['quote']['discountKobo'], 'Discount applies to Polish items only');

        $this->clock->freeze('2026-10-23 12:00:00'); // Friday
        [, $friday] = $this->request('POST', '/api/checkout/quote', $this->checkout(['coupon_code' => 'JOLLOFFRIDAY']), $this->spaHeaders());
        self::assertSame(400000, $friday['quote']['discountKobo'], '20% capped at ₦4,000');
    }

    public function testFullOrderLifecycleWithSimulatedPayment(): void
    {
        [$res, $created] = $this->placeOrder($this->checkout(['coupon_code' => 'WELCOME10']), 'idem-key-lifecycle-0001');
        self::assertSame(201, $res->getStatusCode());
        $ref = $created['order']['reference'];
        self::assertMatchesRegularExpression('/^SA-[A-Z0-9]{6}$/', $ref);
        self::assertSame('pending_payment', $created['order']['status']);
        self::assertSame('simulated', $created['payment']['provider']);
        self::assertSame(0, (int) $this->db->scalar('SELECT times_used FROM coupons WHERE code = ?', ['WELCOME10']), 'Coupon not used until paid');

        $paid = $this->pay($ref);
        self::assertSame('received', $paid['order']['status']);
        self::assertSame('paid', $paid['order']['paymentStatus']);
        self::assertSame(1, (int) $this->db->scalar('SELECT times_used FROM coupons WHERE code = ?', ['WELCOME10']));

        $mail = end($this->mailer->sent);
        self::assertStringContainsString("Order {$ref} confirmed", $mail['subject']);
        self::assertStringContainsString('t=' . $created['trackingToken'], $mail['text'], 'Email link matches the browser link');

        [$track, $tracked] = $this->request('GET', "/api/orders/{$ref}?t={$created['trackingToken']}");
        self::assertSame(200, $track->getStatusCode());
        self::assertSame(['pending_payment', 'received'], array_column($tracked['order']['history'], 'status'));
        self::assertSame('Lekki Phase 1', $tracked['order']['deliveryArea']);
        self::assertArrayNotHasKey('address_snapshot', $tracked['order']);

        // Verifying again (e.g. webhook + browser) changes nothing.
        $this->request('POST', '/api/payments/verify', ['reference' => $ref], $this->spaHeaders());
        self::assertSame(1, (int) $this->db->scalar('SELECT times_used FROM coupons WHERE code = ?', ['WELCOME10']));
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM order_status_history h JOIN orders o ON o.id = h.order_id WHERE o.reference = ? AND h.status = 'received'", [$ref]));

        // Second order with the same first-order coupon is refused.
        [$again, $againBody] = $this->request('POST', '/api/checkout/quote', $this->checkout(['coupon_code' => 'WELCOME10']), $this->spaHeaders());
        self::assertSame(422, $again->getStatusCode());
        self::assertArrayHasKey('coupon_code', $againBody['error']['fields']);
    }

    public function testTrackingRequiresTheRightToken(): void
    {
        [, $created] = $this->placeOrder($this->checkout());
        $ref = $created['order']['reference'];
        foreach (["/api/orders/{$ref}", "/api/orders/{$ref}?t=wrong", '/api/orders/SA-ZZZZZZ?t=' . $created['trackingToken']] as $path) {
            [$res] = $this->request('GET', $path);
            self::assertSame(404, $res->getStatusCode(), $path);
        }
    }

    public function testIdempotencyKeyPreventsDuplicateOrders(): void
    {
        [, $first] = $this->placeOrder($this->checkout(), 'same-key-123456789012');
        [$res, $second] = $this->placeOrder($this->checkout(), 'same-key-123456789012');
        self::assertSame(201, $res->getStatusCode());
        self::assertSame($first['order']['reference'], $second['order']['reference']);
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM orders WHERE customer_email = 'ada@example.com'"));

        [$other] = $this->placeOrder($this->checkout(['email' => 'someone@example.com']), 'same-key-123456789012');
        self::assertSame(409, $other->getStatusCode());
    }

    public function testAmountMismatchIsNeverMarkedPaid(): void
    {
        [, $created] = $this->placeOrder($this->checkout());
        $ref = $created['order']['reference'];
        $this->c->get(OrderService::class)->markPaid($ref, ['status' => 'success', 'amountKobo' => 100, 'currency' => 'NGN', 'paidAt' => null, 'raw' => []]);
        self::assertSame('unpaid', $this->db->scalar('SELECT payment_status FROM orders WHERE reference = ?', [$ref]));
        self::assertSame('failed', $this->db->scalar('SELECT status FROM payments WHERE reference = ?', [$ref]));
    }

    public function testFailedPaymentLeavesOrderUnpaid(): void
    {
        [, $created] = $this->placeOrder($this->checkout());
        $result = $this->pay($created['order']['reference'], 'failed');
        self::assertSame('pending_payment', $result['order']['status']);
        self::assertSame('failed', $result['order']['paymentStatus']);
    }

    public function testWebhookSignatureAndDeduplication(): void
    {
        [, $created] = $this->placeOrder($this->checkout());
        $ref = $created['order']['reference'];
        $payload = json_encode(['event' => 'charge.success', 'data' => ['id' => 99, 'reference' => $ref, 'amount' => 1, 'status' => 'success']]);

        [$forged] = $this->request('POST', '/api/payments/paystack/webhook', $payload, ['x-paystack-signature' => hash_hmac('sha512', $payload, 'wrong-secret')]);
        self::assertSame(401, $forged->getStatusCode());

        // Even a valid webhook is re-verified with the gateway: still unpaid until the gateway says so.
        $sig = hash_hmac('sha512', $payload, SimulatedGateway::WEBHOOK_SECRET);
        [$ok] = $this->request('POST', '/api/payments/paystack/webhook', $payload, ['x-paystack-signature' => $sig]);
        self::assertSame(200, $ok->getStatusCode(), 'Webhook is CSRF-exempt and signature-authenticated');
        self::assertSame('unpaid', $this->db->scalar('SELECT payment_status FROM orders WHERE reference = ?', [$ref]), 'Payload amount is ignored');

        $this->db->run('UPDATE payments SET provider_payload = ? WHERE reference = ?', [json_encode(['simulated_outcome' => 'success']), $ref]);
        $payload2 = json_encode(['event' => 'charge.success', 'data' => ['id' => 100, 'reference' => $ref]]);
        $sig2 = hash_hmac('sha512', $payload2, SimulatedGateway::WEBHOOK_SECRET);
        $this->request('POST', '/api/payments/paystack/webhook', $payload2, ['x-paystack-signature' => $sig2]);
        self::assertSame('paid', $this->db->scalar('SELECT payment_status FROM orders WHERE reference = ?', [$ref]));
        $this->request('POST', '/api/payments/paystack/webhook', $payload2, ['x-paystack-signature' => $sig2]);
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM webhook_events WHERE event_key LIKE ?", ["charge.success:{$ref}:100"]));
    }

    public function testStatusTransitionsFollowTheAllowedPath(): void
    {
        [, $created] = $this->placeOrder($this->checkout());
        $ref = $created['order']['reference'];
        $this->pay($ref);
        $orders = $this->c->get(OrderService::class);
        $orders->updateStatus($ref, 'preparing', null);
        $orders->updateStatus($ref, 'ready', null);
        try {
            $orders->updateStatus($ref, 'completed', null); // delivery orders end as "delivered"
            self::fail('Delivery order completed without delivery');
        } catch (\App\Http\HttpError $e) {
            self::assertSame(409, $e->status);
        }
        $orders->updateStatus($ref, 'out_for_delivery', null);
        self::assertStringContainsString('on its way', end($this->mailer->sent)['subject']);
        $orders->updateStatus($ref, 'delivered', null);
        $this->expectException(\App\Http\HttpError::class);
        $orders->updateStatus($ref, 'preparing', null);
    }

    public function testSignedInCustomerHistoryReorderAndReview(): void
    {
        [, $login] = $this->request('POST', '/api/auth/login', ['email' => 'guest@smallafrica.demo', 'password' => 'SmallAfrica@Guest2026'], $this->spaHeaders());
        $headers = ['X-CSRF-Token' => $login['csrfToken'], 'Origin' => 'http://localhost:5173'];
        [, $created] = $this->request('POST', '/api/orders', $this->checkout(['email' => 'guest@smallafrica.demo', 'save_address' => true]), $headers);
        $ref = $created['order']['reference'];
        $this->pay($ref);

        [, $mine] = $this->request('GET', '/api/account/orders');
        self::assertSame($ref, $mine['orders'][0]['reference']);
        [, $addresses] = $this->request('GET', '/api/account/addresses');
        self::assertSame('12 Admiralty Way', $addresses['addresses'][0]['line1'], 'Address saved at checkout');

        [, $reorder] = $this->request('POST', "/api/account/orders/{$ref}/reorder", [], $headers);
        self::assertSame(2, $reorder['lines'][0]['quantity']);

        $review = ['order_reference' => $ref, 'dish_id' => $this->dishId('smoky-party-jollof'), 'rating' => 5, 'body' => 'Smoky, generous and still hot on arrival.'];
        [$early] = $this->request('POST', '/api/account/reviews', $review, $headers);
        self::assertSame(403, $early->getStatusCode(), 'Only delivered orders can be reviewed');

        $orders = $this->c->get(OrderService::class);
        foreach (['preparing', 'ready', 'out_for_delivery', 'delivered'] as $s) {
            $orders->updateStatus($ref, $s, null);
        }
        [$ok] = $this->request('POST', '/api/account/reviews', $review, $headers);
        self::assertSame(201, $ok->getStatusCode());
        self::assertSame('pending', $this->db->scalar('SELECT status FROM reviews WHERE order_id = (SELECT id FROM orders WHERE reference = ?)', [$ref]));
        [$dup] = $this->request('POST', '/api/account/reviews', $review, $headers);
        self::assertSame(409, $dup->getStatusCode());
    }
}
