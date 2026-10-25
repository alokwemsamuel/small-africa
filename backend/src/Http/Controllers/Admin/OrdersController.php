<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\Json;
use App\Services\OrderService;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class OrdersController extends AdminController
{
    /** What each staff position may move an order to. Managers may make any allowed move. */
    private const POSITION_MOVES = [
        'kitchen' => ['preparing', 'ready'],
        'front_desk' => ['preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'],
    ];

    public function __construct(private Database $db, private OrderService $orders, private AuditLogger $audit)
    {
    }

    public function index(Request $request, Response $response): Response
    {
        [$page, $limit, $offset] = $this->page($request);
        $where = ["o.status <> 'pending_payment'"];
        $params = [];
        if ($status = $this->query($request, 'status')) {
            $list = array_values(array_intersect(explode(',', $status), array_keys(OrderService::TRANSITIONS)));
            if ($list) {
                $where[] = 'o.status IN (' . implode(',', array_fill(0, count($list), '?')) . ')';
                array_push($params, ...$list);
            }
        }
        if (($date = $this->query($request, 'date')) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $where[] = 'DATE(o.placed_at) = ?';
            $params[] = $date;
        }
        if (($f = $this->query($request, 'fulfilment')) && in_array($f, ['delivery', 'pickup'], true)) {
            $where[] = 'o.fulfilment = ?';
            $params[] = $f;
        }
        if ($this->query($request, 'refund') === '1') {
            $where[] = 'o.refund_flag = 1';
        }
        if ($q = $this->query($request, 'q')) {
            $where[] = '(o.reference LIKE ? OR o.customer_name LIKE ? OR o.customer_email LIKE ? OR o.customer_phone LIKE ?)';
            array_push($params, ...array_fill(0, 4, $this->like($q)));
        }
        $sqlWhere = implode(' AND ', $where);
        $total = (int) $this->db->scalar("SELECT COUNT(*) FROM orders o WHERE {$sqlWhere}", $params);
        $rows = $this->db->all(
            "SELECT o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS items FROM orders o
             WHERE {$sqlWhere} ORDER BY o.placed_at DESC, o.id DESC LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return Json::send($response, $this->paged(array_map(static fn ($o) => [
            'reference' => $o['reference'],
            'status' => $o['status'],
            'paymentStatus' => $o['payment_status'],
            'fulfilment' => $o['fulfilment'],
            'customerName' => $o['customer_name'],
            'items' => (int) $o['items'],
            'totalKobo' => (int) $o['total_kobo'] + (int) $o['wallet_applied_kobo'],
            'refundFlag' => (bool) $o['refund_flag'],
            'placedAt' => $o['placed_at'],
            'scheduledFor' => $o['scheduled_for'],
        ], $rows), $total, $page));
    }

    /** @param array{reference: string} $args */
    public function show(Request $request, Response $response, array $args): Response
    {
        $o = $this->find($args['reference']);
        $detail = $this->orders->toPublic($o, true);
        $detail['customer'] = [
            'name' => $o['customer_name'],
            'email' => $o['customer_email'],
            'phone' => $o['customer_phone'],
            'userId' => $o['user_id'] ? (int) $o['user_id'] : null,
            'tier' => $o['user_id'] ? $this->db->scalar('SELECT tier FROM loyalty_accounts WHERE user_id = ?', [$o['user_id']]) : null,
        ];
        $detail['address'] = $o['address_snapshot'] ? json_decode((string) $o['address_snapshot'], true) : null;
        $detail['notes'] = $o['notes'];
        $detail['refundFlag'] = (bool) $o['refund_flag'];
        $detail['cancelledReason'] = $o['cancelled_reason'];
        $detail['coupon'] = $o['coupon_id'] ? $this->db->scalar('SELECT code FROM coupons WHERE id = ?', [$o['coupon_id']]) : null;
        $detail['history'] = array_map(static fn ($h) => [
            'status' => $h['status'], 'at' => $h['created_at'], 'note' => $h['note'], 'by' => $h['by_name'],
        ], $this->db->all(
            "SELECT h.*, CONCAT(u.first_name, ' ', u.last_name) AS by_name FROM order_status_history h
             LEFT JOIN users u ON u.id = h.changed_by_user_id WHERE h.order_id = ? ORDER BY h.id",
            [$o['id']],
        ));
        $detail['payments'] = array_map(static fn ($p) => [
            'reference' => $p['reference'], 'provider' => $p['provider'], 'amountKobo' => (int) $p['amount_kobo'],
            'status' => $p['status'], 'verifiedAt' => $p['verified_at'],
        ], $this->db->all("SELECT * FROM payments WHERE purpose = 'order' AND payable_id = ? ORDER BY id", [$o['id']]));
        $detail['nextStatuses'] = $this->allowedMoves(Json::user($request), $o);
        return Json::send($response, ['order' => $detail]);
    }

    /** @param array{reference: string} $args */
    public function updateStatus(Request $request, Response $response, array $args): Response
    {
        $o = $this->find($args['reference']);
        $data = Validator::validate(Json::body($request), [
            'status' => 'required|string|in:preparing,ready,out_for_delivery,delivered,completed,cancelled',
            'note' => 'nullable|string|max:255',
        ]);
        if (!in_array($data['status'], $this->allowedMoves(Json::user($request), $o), true)) {
            throw HttpError::forbidden('You can’t move this order to that status.');
        }
        if ($data['status'] === 'cancelled') {
            $this->db->run('UPDATE orders SET cancelled_reason = ? WHERE id = ?', [$data['note'] ?? 'Cancelled by staff', $o['id']]);
        }
        $this->orders->updateStatus($o['reference'], $data['status'], $this->actorId($request), $data['note'] ?? null);
        return $this->show($request, $response, $args);
    }

    /**
     * Marks a paid order for a manual refund in the Paystack dashboard (and records why).
     *
     * @param array{reference: string} $args
     */
    public function refundFlag(Request $request, Response $response, array $args): Response
    {
        $o = $this->find($args['reference']);
        $data = Validator::validate(Json::body($request), ['flag' => 'required|bool', 'reason' => 'required|string|min:5|max:255']);
        $this->db->run('UPDATE orders SET refund_flag = ? WHERE id = ?', [$data['flag'] ? 1 : 0, $o['id']]);
        $this->db->insert('order_status_history', [
            'order_id' => $o['id'], 'status' => $o['status'], 'note' => ($data['flag'] ? 'Refund flagged: ' : 'Refund flag cleared: ') . $data['reason'],
            'changed_by_user_id' => $this->actorId($request),
        ]);
        $this->audit->record($this->actorId($request), $data['flag'] ? 'order.refund_flagged' : 'order.refund_cleared', 'order', $o['reference'], ['reason' => $data['reason']]);
        return $this->show($request, $response, $args);
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $order
     * @return list<string>
     */
    private function allowedMoves(array $user, array $order): array
    {
        $moves = OrderService::TRANSITIONS[$order['status']] ?? [];
        $moves = array_values(array_filter($moves, static fn ($m) => !(
            ($m === 'out_for_delivery' && $order['fulfilment'] === 'pickup')
            || ($m === 'completed' && $order['fulfilment'] === 'delivery')
            || ($m === 'delivered' && $order['fulfilment'] === 'pickup')
        )));
        if ($user['role'] === 'staff') {
            $moves = array_values(array_intersect($moves, self::POSITION_MOVES[$user['staff_position']] ?? []));
        }
        return $moves;
    }

    /** @return array<string, mixed> */
    private function find(string $reference): array
    {
        return $this->db->one('SELECT * FROM orders WHERE reference = ?', [strtoupper($reference)])
            ?? throw HttpError::notFound('We couldn’t find that order.');
    }
}
