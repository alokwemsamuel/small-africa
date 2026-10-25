<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Json;
use App\Support\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** The audit log (append-only at database level): who did what, when, from where. */
final class AuditController extends AdminController
{
    public function __construct(private Database $db)
    {
    }

    public function index(Request $request, Response $response): Response
    {
        [$page, $limit, $offset] = $this->page($request);
        $where = ['1 = 1'];
        $params = [];
        if (($action = $this->query($request, 'action')) && preg_match('/^[a-z0-9_.]{2,80}$/', $action)) {
            // "order" matches order.*, "order.paid" matches exactly.
            $where[] = str_contains($action, '.') ? 'l.action = ?' : 'l.action LIKE ?';
            $params[] = str_contains($action, '.') ? $action : $action . '.%';
        }
        if (($actor = $this->query($request, 'actor')) && ctype_digit($actor)) {
            $where[] = 'l.actor_user_id = ?';
            $params[] = (int) $actor;
        }
        if ($this->query($request, 'staff') === '1') {
            $where[] = "u.role IN ('super_admin', 'manager', 'staff')";
        }
        if ($q = $this->query($request, 'q')) {
            $where[] = "(l.entity_id LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?)";
            array_push($params, $this->like($q), $this->like($q));
        }
        $sqlWhere = implode(' AND ', $where);
        $total = (int) $this->db->scalar("SELECT COUNT(*) FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id WHERE {$sqlWhere}", $params);
        $rows = $this->db->all(
            "SELECT l.*, u.first_name, u.last_name, u.role FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id
             WHERE {$sqlWhere} ORDER BY l.id DESC LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return Json::send($response, $this->paged(array_map(static fn ($r) => [
            'id' => (int) $r['id'],
            'action' => $r['action'],
            'actor' => $r['actor_user_id'] ? ['id' => (int) $r['actor_user_id'], 'name' => "{$r['first_name']} {$r['last_name']}", 'role' => $r['role']] : null,
            'entityType' => $r['entity_type'],
            'entityId' => $r['entity_id'],
            'meta' => $r['meta'] ? json_decode((string) $r['meta'], true) : null,
            'ip' => $r['ip'],
            'at' => $r['created_at'],
        ], $rows), $total, $page));
    }
}
