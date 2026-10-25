<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Json;
use App\Security\Permissions;
use App\Support\Clock;
use App\Support\Config;
use App\Support\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class DashboardController extends AdminController
{
    /** Orders count as revenue once paid; revenue is the full bill (card + dining credit). */
    private const PAID = "payment_status = 'paid' AND status <> 'cancelled'";
    private const PAID_O = "o.payment_status = 'paid' AND o.status <> 'cancelled'";

    public function __construct(private Database $db, private Clock $clock, private Config $config)
    {
    }

    /** The signed-in staff member and what they may do (drives the admin navigation). */
    public function me(Request $request, Response $response): Response
    {
        $user = Json::user($request);
        return Json::send($response, [
            'permissions' => Permissions::for($user),
            'role' => $user['role'],
            'staffPosition' => $user['staff_position'],
            'twoFactorEnabled' => $user['totp_enabled_at'] !== null,
            'demoTools' => !$this->config->isProduction() && $this->config->bool('DEMO_TOOLS', false),
        ]);
    }

    public function show(Request $request, Response $response): Response
    {
        $days = ($request->getQueryParams()['days'] ?? '7') === '30' ? 30 : 7;
        $now = $this->clock->now();
        $today = $now->setTime(0, 0);
        $from = $today->modify('-' . ($days - 1) . ' days');
        $sql = fn (\DateTimeImmutable $d) => $this->clock->sql($d);

        $kpi = function (\DateTimeImmutable $start, \DateTimeImmutable $end) use ($sql): array {
            $row = $this->db->one(
                'SELECT COUNT(*) AS orders, COALESCE(SUM(total_kobo + wallet_applied_kobo), 0) AS revenue FROM orders
                 WHERE ' . self::PAID . ' AND placed_at >= ? AND placed_at < ?',
                [$sql($start), $sql($end)],
            ) ?? [];
            $orders = (int) $row['orders'];
            $revenue = (int) $row['revenue'];
            $reservations = (int) $this->db->scalar(
                "SELECT COUNT(*) FROM reservations WHERE service_date >= ? AND service_date < ? AND status NOT IN ('cancelled')",
                [$start->format('Y-m-d'), $end->format('Y-m-d')],
            );
            $covers = (int) $this->db->scalar(
                "SELECT COALESCE(SUM(party_size), 0) FROM reservations WHERE service_date >= ? AND service_date < ? AND status NOT IN ('cancelled', 'no_show')",
                [$start->format('Y-m-d'), $end->format('Y-m-d')],
            );
            return ['revenueKobo' => $revenue, 'orders' => $orders, 'reservations' => $reservations, 'covers' => $covers, 'averageOrderKobo' => $orders ? intdiv($revenue, $orders) : 0];
        };

        $byDay = [];
        foreach ($this->db->all(
            'SELECT DATE(placed_at) AS d, COUNT(*) AS orders, SUM(total_kobo + wallet_applied_kobo) AS revenue FROM orders
             WHERE ' . self::PAID . ' AND placed_at >= ? GROUP BY DATE(placed_at)',
            [$sql($from)],
        ) as $r) {
            $byDay[$r['d']] = ['orders' => (int) $r['orders'], 'revenueKobo' => (int) $r['revenue']];
        }
        $resByDay = [];
        foreach ($this->db->all(
            "SELECT service_date AS d, COUNT(*) AS n FROM reservations WHERE service_date >= ? AND service_date <= ? AND status <> 'cancelled' GROUP BY service_date",
            [$from->format('Y-m-d'), $today->format('Y-m-d')],
        ) as $r) {
            $resByDay[$r['d']] = (int) $r['n'];
        }
        $series = [];
        for ($d = $from; $d <= $today; $d = $d->modify('+1 day')) {
            $k = $d->format('Y-m-d');
            $series[] = ['date' => $k, 'revenueKobo' => $byDay[$k]['revenueKobo'] ?? 0, 'orders' => $byDay[$k]['orders'] ?? 0, 'reservations' => $resByDay[$k] ?? 0];
        }

        $topDishes = array_map(static fn ($r) => [
            'name' => $r['dish_name'],
            'quantity' => (int) $r['qty'],
            'revenueKobo' => (int) $r['revenue'],
        ], $this->db->all(
            'SELECT oi.dish_name, SUM(oi.quantity) AS qty, SUM(oi.line_total_kobo) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE ' . self::PAID_O . ' AND o.placed_at >= ? GROUP BY oi.dish_name ORDER BY qty DESC LIMIT 5',
            [$sql($from)],
        ));
        $byKitchen = array_map(static fn ($r) => ['kitchen' => $r['name'] ?? 'Other', 'revenueKobo' => (int) $r['revenue']], $this->db->all(
            'SELECT k.name, SUM(oi.line_total_kobo) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN kitchens k ON k.id = oi.kitchen_id
             WHERE ' . self::PAID_O . ' AND o.placed_at >= ? GROUP BY k.name ORDER BY revenue DESC',
            [$sql($from)],
        ));

        $live = array_map(static fn ($o) => [
            'reference' => $o['reference'],
            'status' => $o['status'],
            'fulfilment' => $o['fulfilment'],
            'customerName' => $o['customer_name'],
            'totalKobo' => (int) $o['total_kobo'] + (int) $o['wallet_applied_kobo'],
            'items' => (int) $o['items'],
            'placedAt' => $o['placed_at'],
            'scheduledFor' => $o['scheduled_for'],
        ], $this->db->all(
            "SELECT o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS items FROM orders o
             WHERE o.status IN ('received', 'preparing', 'ready', 'out_for_delivery') ORDER BY COALESCE(o.scheduled_for, o.placed_at) LIMIT 20",
        ));

        $loyalty = $this->db->one(
            "SELECT COUNT(*) AS members, COALESCE(SUM(wallet_balance_kobo), 0) AS wallet, COALESCE(SUM(points_balance), 0) AS points
             FROM loyalty_accounts a JOIN users u ON u.id = a.user_id WHERE u.role = 'customer'",
        ) ?? [];

        return Json::send($response, [
            'today' => $kpi($today, $today->modify('+1 day')),
            'yesterday' => $kpi($today->modify('-1 day'), $today),
            'period' => ['days' => $days] + $kpi($from, $today->modify('+1 day')),
            'series' => $series,
            'topDishes' => $topDishes,
            'byKitchen' => $byKitchen,
            'live' => $live,
            'pending' => [
                'reviews' => (int) $this->db->scalar("SELECT COUNT(*) FROM reviews WHERE status = 'pending'"),
                'enquiries' => (int) $this->db->scalar("SELECT COUNT(*) FROM event_enquiries WHERE status = 'new'"),
                'messages' => (int) $this->db->scalar("SELECT COUNT(*) FROM contact_messages WHERE status = 'new'"),
            ],
            'loyalty' => ['members' => (int) $loyalty['members'], 'walletKobo' => (int) $loyalty['wallet'], 'points' => (int) $loyalty['points']],
            'generatedAt' => $now->format(DATE_ATOM),
        ]);
    }
}
