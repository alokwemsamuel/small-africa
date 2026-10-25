<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\HttpError;
use App\Http\Json;
use App\Services\OrderService;
use App\Support\Clock;
use App\Support\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class OrderController
{
    public function __construct(private OrderService $orders, private Database $db, private Clock $clock)
    {
    }

    /** @param array{reference: string} $args */
    public function track(Request $request, Response $response, array $args): Response
    {
        if (!preg_match('/^SA-[A-Z0-9]{6}$/i', $args['reference'])) {
            throw HttpError::notFound('We couldn’t find that order.');
        }
        $user = $request->getAttribute('user');
        $token = $request->getQueryParams()['t'] ?? null;
        $order = $this->orders->findForTracking($args['reference'], is_array($user) ? $user : null, is_string($token) ? $token : null);
        return Json::send($response, ['order' => $order]);
    }

    public function mine(Request $request, Response $response): Response
    {
        $user = Json::user($request);
        return Json::send($response, ['orders' => $this->orders->listForUser((int) $user['id'])]);
    }

    /**
     * Rebuilds a past order as basket lines at today's prices, flagging anything unavailable.
     *
     * @param array{reference: string} $args
     */
    public function reorder(Request $request, Response $response, array $args): Response
    {
        $user = Json::user($request);
        $order = $this->db->one('SELECT * FROM orders WHERE reference = ? AND user_id = ?', [strtoupper($args['reference']), $user['id']]);
        if (!$order) {
            throw HttpError::notFound('We couldn’t find that order.');
        }
        $today = $this->clock->now()->format('Y-m-d');
        $lines = [];
        $unavailable = [];
        foreach ($this->db->all('SELECT * FROM order_items WHERE order_id = ?', [$order['id']]) as $item) {
            $dish = $item['dish_id'] ? $this->db->one('SELECT * FROM dishes WHERE id = ? AND deleted_at IS NULL', [$item['dish_id']]) : null;
            if (!$dish || !$dish['is_available'] || ($dish['sold_out_until'] !== null && $dish['sold_out_until'] >= $today)) {
                $unavailable[] = $item['dish_name'];
                continue;
            }
            $opts = (array) json_decode((string) $item['options'], true);
            $portionId = $opts['portion']['id'] ?? null;
            $addonIds = array_map(static fn ($a) => (int) $a['id'], $opts['addons'] ?? []);
            // Current prices, and only options that still exist.
            $valid = array_column($this->db->all('SELECT id, option_group, name, price_delta_kobo FROM dish_options WHERE dish_id = ?', [$dish['id']]), null, 'id');
            $portion = $portionId && isset($valid[$portionId]) ? $valid[$portionId] : null;
            $addons = array_values(array_filter(array_map(static fn ($id) => $valid[$id] ?? null, $addonIds)));
            $lines[] = [
                'dishId' => (int) $dish['id'],
                'slug' => $dish['slug'],
                'name' => $dish['name'],
                'kitchen' => $this->db->scalar('SELECT slug FROM kitchens WHERE id = ?', [$dish['kitchen_id']]),
                'unitPriceKobo' => (int) $dish['price_kobo'] + (int) ($portion['price_delta_kobo'] ?? 0) + array_sum(array_map(static fn ($a) => (int) $a['price_delta_kobo'], $addons)),
                'quantity' => (int) $item['quantity'],
                'portionId' => $portion ? (int) $portion['id'] : null,
                'portionName' => $portion['name'] ?? null,
                'addonIds' => array_map(static fn ($a) => (int) $a['id'], $addons),
                'addonNames' => array_map(static fn ($a) => $a['name'], $addons),
                'containsPork' => (bool) $dish['contains_pork'],
            ];
        }
        return Json::send($response, ['lines' => $lines, 'unavailable' => $unavailable]);
    }
}
