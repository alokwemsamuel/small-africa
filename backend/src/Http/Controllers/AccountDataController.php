<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\Json;
use App\Http\ValidationError;
use App\Security\RateLimiter;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Saved addresses and reviews for the signed-in customer. Every query is scoped to the user. */
final class AccountDataController
{
    private const MAX_ADDRESSES = 10;

    public function __construct(private Database $db, private RateLimiter $limiter, private AuditLogger $audit)
    {
    }

    public function addresses(Request $request, Response $response): Response
    {
        $user = Json::user($request);
        return Json::send($response, ['addresses' => $this->listAddresses((int) $user['id'])]);
    }

    public function saveAddress(Request $request, Response $response, array $args = []): Response
    {
        $user = Json::user($request);
        $uid = (int) $user['id'];
        $data = Validator::validate(Json::body($request), [
            'label' => 'required|string|max:40',
            'line1' => 'required|string|max:160',
            'line2' => 'nullable|string|max:160',
            'landmark' => 'nullable|string|max:160',
            'zone' => 'required|string|max:40',
            'phone' => 'nullable|phone',
            'is_default' => 'nullable|bool',
        ], ['line1' => 'Street address', 'zone' => 'Delivery area']);
        $zoneId = $this->db->scalar('SELECT id FROM delivery_zones WHERE slug = ? AND is_active = 1', [$data['zone']]);
        if (!$zoneId) {
            throw ValidationError::field('zone', 'Choose a delivery area we serve.');
        }
        $row = [
            'label' => $data['label'],
            'line1' => $data['line1'],
            'line2' => $data['line2'] ?? null,
            'landmark' => $data['landmark'] ?? null,
            'delivery_zone_id' => $zoneId,
            'phone' => $data['phone'] ?? null,
        ];
        $this->db->transaction(function () use ($uid, $args, $row, $data): void {
            if (!empty($data['is_default'])) {
                $this->db->run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [$uid]);
                $row['is_default'] = 1;
            }
            if (isset($args['id'])) {
                $id = (int) $args['id'];
                if (!$this->db->scalar('SELECT 1 FROM addresses WHERE id = ? AND user_id = ?', [$id, $uid])) {
                    throw HttpError::notFound('Address not found.');
                }
                $sets = implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($row)));
                $this->db->run("UPDATE addresses SET {$sets} WHERE id = ? AND user_id = ?", [...array_values($row), $id, $uid]);
            } else {
                $count = (int) $this->db->scalar('SELECT COUNT(*) FROM addresses WHERE user_id = ?', [$uid]);
                if ($count >= self::MAX_ADDRESSES) {
                    throw ValidationError::field('label', 'You can save up to ' . self::MAX_ADDRESSES . ' addresses.');
                }
                $this->db->insert('addresses', $row + ['user_id' => $uid, 'is_default' => $count === 0 ? 1 : ($row['is_default'] ?? 0)]);
            }
        });
        return Json::send($response, ['addresses' => $this->listAddresses($uid)], isset($args['id']) ? 200 : 201);
    }

    /** @param array{id: string} $args */
    public function deleteAddress(Request $request, Response $response, array $args): Response
    {
        $user = Json::user($request);
        $this->db->run('DELETE FROM addresses WHERE id = ? AND user_id = ?', [(int) $args['id'], $user['id']]);
        return Json::send($response, ['addresses' => $this->listAddresses((int) $user['id'])]);
    }

    public function reviews(Request $request, Response $response): Response
    {
        $user = Json::user($request);
        $rows = $this->db->all(
            'SELECT r.*, d.name AS dish_name, d.slug AS dish_slug, o.reference FROM reviews r
             LEFT JOIN dishes d ON d.id = r.dish_id LEFT JOIN orders o ON o.id = r.order_id
             WHERE r.user_id = ? ORDER BY r.created_at DESC',
            [$user['id']],
        );
        return Json::send($response, ['reviews' => array_map(static fn ($r) => [
            'id' => (int) $r['id'],
            'dish' => $r['dish_name'],
            'dishSlug' => $r['dish_slug'],
            'orderReference' => $r['reference'],
            'rating' => (int) $r['rating'],
            'title' => $r['title'],
            'body' => $r['body'],
            'status' => $r['status'],
            'reply' => $r['admin_reply'],
            'createdAt' => $r['created_at'],
        ], $rows)]);
    }

    /** Only guests who received the dish can review it, once per dish per order. */
    public function createReview(Request $request, Response $response): Response
    {
        $user = Json::user($request);
        $this->limiter->hit("review:uid:{$user['id']}", 10, 86400);
        $data = Validator::validate(Json::body($request), [
            'order_reference' => 'required|string|max:20|regex:/^SA-[A-Z0-9]{6}$/',
            'dish_id' => 'required|int|min:1',
            'rating' => 'required|int|min:1|max:5',
            'title' => 'nullable|string|max:120',
            'body' => 'required|string|min:10|max:1500',
        ], ['body' => 'Your review']);
        $order = $this->db->one(
            "SELECT * FROM orders WHERE reference = ? AND user_id = ? AND status IN ('delivered','completed')",
            [$data['order_reference'], $user['id']],
        );
        if (!$order || !$this->db->scalar('SELECT 1 FROM order_items WHERE order_id = ? AND dish_id = ?', [$order['id'], $data['dish_id']])) {
            throw HttpError::forbidden('You can review dishes from your delivered or collected orders.');
        }
        if ($this->db->scalar('SELECT 1 FROM reviews WHERE order_id = ? AND dish_id = ?', [$order['id'], $data['dish_id']])) {
            throw HttpError::conflict('You’ve already reviewed this dish for this order.');
        }
        $id = $this->db->insert('reviews', [
            'user_id' => $user['id'],
            'author_name' => $user['first_name'] . ' ' . mb_substr((string) $user['last_name'], 0, 1) . '.',
            'dish_id' => $data['dish_id'],
            'order_id' => $order['id'],
            'rating' => $data['rating'],
            'title' => $data['title'] ?? null,
            'body' => $data['body'],
            'status' => 'pending', // published after moderation
        ]);
        $this->audit->record((int) $user['id'], 'review.created', 'review', $id);
        return Json::send($response, ['message' => 'Thank you! Your review will appear once our team has checked it.'], 201);
    }

    /** @return list<array<string, mixed>> */
    private function listAddresses(int $userId): array
    {
        return array_map(static fn ($a) => [
            'id' => (int) $a['id'],
            'label' => $a['label'],
            'line1' => $a['line1'],
            'line2' => $a['line2'],
            'landmark' => $a['landmark'],
            'zone' => $a['zone_slug'],
            'zoneName' => $a['zone_name'],
            'phone' => $a['phone'],
            'isDefault' => (bool) $a['is_default'],
        ], $this->db->all(
            'SELECT a.*, z.slug AS zone_slug, z.name AS zone_name FROM addresses a LEFT JOIN delivery_zones z ON z.id = a.delivery_zone_id
             WHERE a.user_id = ? ORDER BY a.is_default DESC, a.id',
            [$userId],
        ));
    }
}
