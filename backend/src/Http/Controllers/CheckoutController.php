<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\HttpError;
use App\Http\Json;
use App\Http\ValidationError;
use App\Payments\PaymentGateway;
use App\Security\RateLimiter;
use App\Services\OrderService;
use App\Services\PricingService;
use App\Support\Config;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class CheckoutController
{
    public function __construct(
        private PricingService $pricing,
        private OrderService $orders,
        private PaymentGateway $gateway,
        private RateLimiter $limiter,
        private Database $db,
        private Config $config,
    ) {
    }

    /** Live totals for the checkout page (no order is created). */
    public function quote(Request $request, Response $response): Response
    {
        $this->limiter->hit('quote:ip:' . Json::ip($request), 120, 600);
        $user = $request->getAttribute('user');
        $data = $this->validate(Json::body($request), forQuote: true);
        $quote = $this->pricing->quote($data, is_array($user) ? (int) $user['id'] : null);
        return Json::send($response, ['quote' => $quote]);
    }

    public function placeOrder(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $data = $this->validate(Json::body($request), forQuote: false);
        $key = $request->getHeaderLine('Idempotency-Key') ?: null;
        $result = $this->orders->create($data, is_array($user) ? $user : null, Json::ip($request), $key);
        if (is_array($user) && $data['fulfilment'] === 'delivery' && !empty($data['save_address'])) {
            $this->saveAddress((int) $user['id'], $data);
        }
        $result['publicKey'] = $this->gateway->name() === 'paystack' ? $this->config->str('PAYSTACK_PUBLIC_KEY') : null;
        return Json::send($response, $result, 201);
    }

    public function verifyPayment(Request $request, Response $response): Response
    {
        $this->limiter->hit('verify:ip:' . Json::ip($request), 30, 600);
        $data = Validator::validate(Json::body($request), ['reference' => 'required|string|max:40|regex:/^SA-[A-Z0-9]{6}$/']);
        return Json::send($response, ['order' => $this->orders->verifyPayment($data['reference'])]);
    }

    /** Paystack → us. CSRF-exempt; authenticated by HMAC signature instead. */
    public function webhook(Request $request, Response $response): Response
    {
        $raw = (string) $request->getBody();
        $this->orders->handleWebhook($raw, $request->getHeaderLine('x-paystack-signature'));
        return Json::send($response, ['ok' => true]);
    }

    /**
     * Simulated checkout (local development, tests, client demo): marks the gateway outcome.
     * Unavailable with the real Paystack driver and in production.
     */
    public function simulate(Request $request, Response $response): Response
    {
        if ($this->gateway->name() !== 'simulated' || $this->config->isProduction()) {
            throw HttpError::notFound();
        }
        $data = Validator::validate(Json::body($request), [
            'reference' => 'required|string|max:40|regex:/^SA-[A-Z0-9]{6}$/',
            'outcome' => 'required|string|in:success,failed,abandoned',
        ]);
        $this->db->run(
            "UPDATE payments SET provider_payload = ? WHERE reference = ? AND status = 'initialized'",
            [json_encode(['simulated_outcome' => $data['outcome']]), $data['reference']],
        );
        return Json::send($response, ['order' => $this->orders->verifyPayment($data['reference'])]);
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function validate(array $body, bool $forQuote): array
    {
        $rules = [
            'fulfilment' => 'required|string|in:delivery,pickup',
            'zone' => 'nullable|string|max:40',
            'scheduled_for' => 'nullable|string|regex:/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/',
            'coupon_code' => 'nullable|string|max:30',
            'confirm_age' => 'nullable|bool',
            'email' => $forQuote ? 'nullable|email' : 'required|email',
        ];
        if (!$forQuote) {
            $rules += [
                'name' => 'required|string|max:160',
                'phone' => 'required|phone',
                'notes' => 'nullable|string|max:500',
                'save_address' => 'nullable|bool',
            ];
        }
        $data = Validator::validate($body, $rules, ['scheduled_for' => 'Scheduled time', 'coupon_code' => 'Coupon code']);
        $items = $body['items'] ?? null;
        if (!is_array($items) || !array_is_list($items)) {
            throw ValidationError::field('items', 'Your order is empty.');
        }
        $data['items'] = $items;
        if (!$forQuote && $data['fulfilment'] === 'delivery') {
            $address = is_array($body['address'] ?? null) ? $body['address'] : [];
            $data['address'] = Validator::validate($address, [
                'line1' => 'required|string|max:160',
                'line2' => 'nullable|string|max:160',
                'landmark' => 'nullable|string|max:160',
                'area' => 'nullable|string|max:80',
                'label' => 'nullable|string|max:40',
            ], ['line1' => 'Street address']);
        }
        return $data;
    }

    /** @param array<string, mixed> $data */
    private function saveAddress(int $userId, array $data): void
    {
        $zoneId = $this->db->scalar('SELECT id FROM delivery_zones WHERE slug = ?', [$data['zone']]);
        $exists = $this->db->scalar('SELECT id FROM addresses WHERE user_id = ? AND line1 = ?', [$userId, $data['address']['line1']]);
        $count = (int) $this->db->scalar('SELECT COUNT(*) FROM addresses WHERE user_id = ?', [$userId]);
        if ($exists || $count >= 10) {
            return;
        }
        $this->db->insert('addresses', [
            'user_id' => $userId,
            'label' => $data['address']['label'] ?? 'Home',
            'line1' => $data['address']['line1'],
            'line2' => $data['address']['line2'] ?? null,
            'landmark' => $data['address']['landmark'] ?? null,
            'delivery_zone_id' => $zoneId ?: null,
            'phone' => $data['phone'],
            'is_default' => $count === 0 ? 1 : 0,
        ]);
    }
}
