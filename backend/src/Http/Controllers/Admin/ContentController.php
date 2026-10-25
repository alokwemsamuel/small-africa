<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\Json;
use App\Http\ValidationError;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Reviews, coupons, event enquiries and contact messages. */
final class ContentController extends AdminController
{
    public function __construct(private Database $db, private AuditLogger $audit, private Clock $clock)
    {
    }

    /* ----------------------------------------------------------------- reviews */

    public function reviews(Request $request, Response $response): Response
    {
        [$page, $limit, $offset] = $this->page($request);
        $status = $this->query($request, 'status');
        $where = $status && in_array($status, ['pending', 'approved', 'hidden'], true) ? 'WHERE r.status = ?' : '';
        $params = $where ? [$status] : [];
        $total = (int) $this->db->scalar("SELECT COUNT(*) FROM reviews r {$where}", $params);
        $rows = $this->db->all(
            "SELECT r.*, d.name AS dish_name, o.reference FROM reviews r LEFT JOIN dishes d ON d.id = r.dish_id LEFT JOIN orders o ON o.id = r.order_id
             {$where} ORDER BY r.status = 'pending' DESC, r.created_at DESC LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return Json::send($response, $this->paged(array_map(fn ($r) => $this->review($r), $rows), $total, $page));
    }

    /** @param array{id: string} $args */
    public function moderateReview(Request $request, Response $response, array $args): Response
    {
        $r = $this->db->one('SELECT * FROM reviews WHERE id = ?', [(int) $args['id']]) ?? throw HttpError::notFound();
        $data = Validator::validate(Json::body($request), [
            'status' => 'nullable|string|in:pending,approved,hidden',
            'reply' => 'nullable|string|max:1000',
        ]);
        $set = [];
        if (!empty($data['status'])) {
            $set['status'] = $data['status'];
        }
        if (array_key_exists('reply', $data)) {
            $set['admin_reply'] = $data['reply'];
            $set['replied_at'] = $data['reply'] ? $this->clock->sql() : null;
        }
        if ($set) {
            $this->db->run('UPDATE reviews SET ' . implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($set))) . ' WHERE id = ?', [...array_values($set), $r['id']]);
        }
        $this->audit->record($this->actorId($request), 'review.moderated', 'review', (int) $r['id'], array_diff_key($set, ['replied_at' => 1]));
        $row = $this->db->one(
            'SELECT r.*, d.name AS dish_name, o.reference FROM reviews r LEFT JOIN dishes d ON d.id = r.dish_id LEFT JOIN orders o ON o.id = r.order_id WHERE r.id = ?',
            [$r['id']],
        ) ?? [];
        return Json::send($response, ['review' => $this->review($row)]);
    }

    /* ----------------------------------------------------------------- coupons */

    public function coupons(Request $request, Response $response): Response
    {
        $now = $this->clock->sql();
        return Json::send($response, [
            'coupons' => array_map(static fn ($c) => [
                'id' => (int) $c['id'],
                'code' => $c['code'],
                'description' => $c['description'],
                'discountType' => $c['discount_type'],
                'discountValue' => (int) $c['discount_value'],
                'minOrderKobo' => (int) $c['min_order_kobo'],
                'maxDiscountKobo' => $c['max_discount_kobo'] !== null ? (int) $c['max_discount_kobo'] : null,
                'kitchenId' => $c['kitchen_id'] !== null ? (int) $c['kitchen_id'] : null,
                'validWeekdays' => $c['valid_weekdays'] !== null ? array_map('intval', explode(',', $c['valid_weekdays'])) : null,
                'startsAt' => $c['starts_at'],
                'endsAt' => $c['ends_at'],
                'usageLimit' => $c['usage_limit'] !== null ? (int) $c['usage_limit'] : null,
                'perUserLimit' => $c['per_user_limit'] !== null ? (int) $c['per_user_limit'] : null,
                'firstOrderOnly' => (bool) $c['first_order_only'],
                'timesUsed' => (int) $c['times_used'],
                'isActive' => (bool) $c['is_active'],
                'live' => (bool) $c['is_active'] && ($c['ends_at'] === null || $c['ends_at'] > $now) && ($c['starts_at'] === null || $c['starts_at'] <= $now)
                    && ($c['usage_limit'] === null || (int) $c['times_used'] < (int) $c['usage_limit']),
                'personal' => str_starts_with($c['code'], 'MISS-'),
            ], $this->db->all("SELECT * FROM coupons ORDER BY code LIKE 'MISS-%', is_active DESC, created_at DESC")),
        ]);
    }

    /** @param array{id?: string} $args */
    public function saveCoupon(Request $request, Response $response, array $args = []): Response
    {
        $creating = !isset($args['id']);
        $body = Json::body($request);
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate($body, [
            'code' => "{$req}|string|min:3|max:30|regex:/^[A-Z0-9_-]+$/",
            'description' => "{$req}|string|max:255",
            'discount_type' => "{$req}|string|in:percent,fixed",
            'discount_value' => "{$req}|int|min:1|max:10000000",
            'min_order_naira' => 'nullable|int|min:0|max:10000000',
            'max_discount_naira' => 'nullable|int|min:1|max:10000000',
            'kitchen_id' => 'nullable|int|min:1',
            'starts_at' => 'nullable|date',
            'ends_at' => 'nullable|date',
            'usage_limit' => 'nullable|int|min:1|max:1000000',
            'per_user_limit' => 'nullable|int|min:1|max:1000',
            'first_order_only' => 'nullable|bool',
            'is_active' => 'nullable|bool',
        ], ['discount_value' => 'Discount', 'min_order_naira' => 'Minimum order', 'max_discount_naira' => 'Maximum discount']);
        if (($data['discount_type'] ?? null) === 'percent' && ($data['discount_value'] ?? 0) > 100) {
            throw ValidationError::field('discount_value', 'A percentage discount can be at most 100%.');
        }
        if (!empty($data['starts_at']) && !empty($data['ends_at']) && $data['starts_at'] > $data['ends_at']) {
            throw ValidationError::field('ends_at', 'The end date must be after the start date.');
        }
        $cols = [];
        foreach (['code', 'description', 'discount_type', 'kitchen_id', 'usage_limit', 'per_user_limit'] as $k) {
            if (array_key_exists($k, $data)) {
                $cols[$k] = $data[$k];
            }
        }
        if (array_key_exists('discount_value', $data)) {
            // Percent is stored as a number; fixed amounts are entered in naira and stored in kobo.
            $type = $data['discount_type'] ?? ($creating ? null : $this->db->scalar('SELECT discount_type FROM coupons WHERE id = ?', [(int) $args['id']]));
            $cols['discount_value'] = $type === 'fixed' ? $data['discount_value'] * 100 : $data['discount_value'];
        }
        foreach (['min_order_naira' => 'min_order_kobo', 'max_discount_naira' => 'max_discount_kobo'] as $in => $col) {
            if (array_key_exists($in, $data)) {
                $cols[$col] = $data[$in] !== null ? $data[$in] * 100 : ($col === 'min_order_kobo' ? 0 : null);
            }
        }
        foreach (['starts_at' => '00:00:00', 'ends_at' => '23:59:59'] as $k => $time) {
            if (array_key_exists($k, $data)) {
                $cols[$k] = $data[$k] ? "{$data[$k]} {$time}" : null;
            }
        }
        if (array_key_exists('valid_weekdays', $body)) {
            $days = is_array($body['valid_weekdays']) ? array_map('intval', $body['valid_weekdays']) : [];
            if (array_diff($days, range(0, 6))) {
                throw ValidationError::field('valid_weekdays', 'Choose days of the week.');
            }
            $cols['valid_weekdays'] = $days ? implode(',', array_unique($days)) : null;
        }
        foreach (['first_order_only', 'is_active'] as $k) {
            if (isset($data[$k])) {
                $cols[$k] = $data[$k] ? 1 : 0;
            }
        }
        if (isset($cols['code']) && $this->db->scalar('SELECT 1 FROM coupons WHERE code = ? AND id <> ?', [$cols['code'], (int) ($args['id'] ?? 0)])) {
            throw ValidationError::field('code', 'That code is already in use.');
        }
        if ($creating) {
            $id = $this->db->insert('coupons', $cols);
        } else {
            $id = (int) $args['id'];
            $this->db->scalar('SELECT 1 FROM coupons WHERE id = ?', [$id]) ?? throw HttpError::notFound();
            if ($cols) {
                $this->db->run('UPDATE coupons SET ' . implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($cols))) . ' WHERE id = ?', [...array_values($cols), $id]);
            }
        }
        $this->audit->record($this->actorId($request), $creating ? 'coupon.created' : 'coupon.updated', 'coupon', $id, $cols);
        return $this->coupons($request, $response)->withStatus($creating ? 201 : 200);
    }

    /**
     * Ends a coupon now (kept for history and reporting).
     *
     * @param array{id: string} $args
     */
    public function expireCoupon(Request $request, Response $response, array $args): Response
    {
        $c = $this->db->one('SELECT * FROM coupons WHERE id = ?', [(int) $args['id']]) ?? throw HttpError::notFound();
        $this->db->run('UPDATE coupons SET is_active = 0, ends_at = ? WHERE id = ?', [$this->clock->sql(), $c['id']]);
        $this->audit->record($this->actorId($request), 'coupon.expired', 'coupon', (int) $c['id'], ['code' => $c['code']]);
        return $this->coupons($request, $response);
    }

    /* --------------------------------------------------- enquiries and messages */

    public function enquiries(Request $request, Response $response): Response
    {
        [$page, $limit, $offset] = $this->page($request);
        $status = $this->query($request, 'status');
        $where = $status && in_array($status, ['new', 'contacted', 'quoted', 'booked', 'closed'], true) ? 'WHERE e.status = ?' : '';
        $params = $where ? [$status] : [];
        $total = (int) $this->db->scalar("SELECT COUNT(*) FROM event_enquiries e {$where}", $params);
        $rows = $this->db->all(
            "SELECT e.*, p.name AS package_name FROM event_enquiries e LEFT JOIN event_packages p ON p.id = e.package_id
             {$where} ORDER BY e.status = 'new' DESC, e.created_at DESC LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return Json::send($response, $this->paged(array_map(static fn ($e) => [
            'id' => (int) $e['id'], 'name' => $e['name'], 'email' => $e['email'], 'phone' => $e['phone'], 'company' => $e['company'],
            'eventType' => $e['event_type'], 'package' => $e['package_name'], 'eventDate' => $e['event_date'], 'guests' => (int) $e['guests'],
            'budgetKobo' => $e['budget_kobo'] !== null ? (int) $e['budget_kobo'] : null, 'message' => $e['message'], 'status' => $e['status'], 'createdAt' => $e['created_at'],
        ], $rows), $total, $page));
    }

    /** @param array{id: string} $args */
    public function updateEnquiry(Request $request, Response $response, array $args): Response
    {
        $e = $this->db->one('SELECT * FROM event_enquiries WHERE id = ?', [(int) $args['id']]) ?? throw HttpError::notFound();
        $data = Validator::validate(Json::body($request), ['status' => 'required|string|in:new,contacted,quoted,booked,closed']);
        $this->db->run('UPDATE event_enquiries SET status = ? WHERE id = ?', [$data['status'], $e['id']]);
        $this->audit->record($this->actorId($request), 'enquiry.updated', 'event_enquiry', (int) $e['id'], ['from' => $e['status'], 'to' => $data['status']]);
        return Json::send($response, ['ok' => true, 'status' => $data['status']]);
    }

    public function messages(Request $request, Response $response): Response
    {
        [$page, $limit, $offset] = $this->page($request);
        $status = $this->query($request, 'status');
        // Archived messages are hidden unless asked for.
        [$where, $params] = $status && in_array($status, ['new', 'read', 'replied', 'archived'], true)
            ? ['WHERE status = ?', [$status]]
            : ["WHERE status <> 'archived'", []];
        $total = (int) $this->db->scalar("SELECT COUNT(*) FROM contact_messages {$where}", $params);
        $rows = $this->db->all("SELECT * FROM contact_messages {$where} ORDER BY status = 'new' DESC, created_at DESC LIMIT {$limit} OFFSET {$offset}", $params);
        return Json::send($response, $this->paged(array_map(static fn ($m) => [
            'id' => (int) $m['id'], 'name' => $m['name'], 'email' => $m['email'], 'phone' => $m['phone'], 'subject' => $m['subject'],
            'message' => $m['message'], 'status' => $m['status'], 'createdAt' => $m['created_at'],
        ], $rows), $total, $page));
    }

    /** @param array{id: string} $args */
    public function updateMessage(Request $request, Response $response, array $args): Response
    {
        $m = $this->db->one('SELECT * FROM contact_messages WHERE id = ?', [(int) $args['id']]) ?? throw HttpError::notFound();
        $data = Validator::validate(Json::body($request), ['status' => 'required|string|in:new,read,replied,archived']);
        $this->db->run('UPDATE contact_messages SET status = ? WHERE id = ?', [$data['status'], $m['id']]);
        $this->audit->record($this->actorId($request), 'message.updated', 'contact_message', (int) $m['id'], ['to' => $data['status']]);
        return Json::send($response, ['ok' => true, 'status' => $data['status']]);
    }

    /** @param array<string, mixed> $r */
    private function review(array $r): array
    {
        return [
            'id' => (int) $r['id'], 'author' => $r['author_name'], 'dish' => $r['dish_name'], 'orderReference' => $r['reference'],
            'rating' => (int) $r['rating'], 'title' => $r['title'], 'body' => $r['body'], 'status' => $r['status'],
            'reply' => $r['admin_reply'], 'repliedAt' => $r['replied_at'], 'createdAt' => $r['created_at'], 'verified' => $r['order_id'] !== null,
        ];
    }
}
