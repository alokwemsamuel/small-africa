<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\HttpError;
use App\Http\Json;
use App\Loyalty\LoyaltyService;
use App\Security\Permissions;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class CustomersController extends AdminController
{
    public function __construct(private Database $db, private LoyaltyService $loyalty)
    {
    }

    public function index(Request $request, Response $response): Response
    {
        [$page, $limit, $offset] = $this->page($request);
        $where = ["u.role = 'customer'"];
        $params = [];
        if ($q = $this->query($request, 'q')) {
            $where[] = "(CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.referral_code LIKE ?)";
            array_push($params, ...array_fill(0, 4, $this->like($q)));
        }
        if (($tier = $this->query($request, 'tier')) && in_array($tier, ['bronze', 'silver', 'gold', 'black_diamond'], true)) {
            $where[] = 'a.tier = ?';
            $params[] = $tier;
        }
        $sort = match ($this->query($request, 'sort')) {
            'spend' => 'a.spend_12m_kobo DESC',
            'wallet' => 'a.wallet_balance_kobo DESC',
            'points' => 'a.points_balance DESC',
            'recent' => 'a.last_activity_at DESC',
            default => 'u.created_at DESC',
        };
        $sqlWhere = implode(' AND ', $where);
        $total = (int) $this->db->scalar("SELECT COUNT(*) FROM users u LEFT JOIN loyalty_accounts a ON a.user_id = u.id WHERE {$sqlWhere}", $params);
        $rows = $this->db->all(
            "SELECT u.*, a.tier, a.wallet_balance_kobo, a.points_balance, a.spend_12m_kobo, a.last_activity_at,
             (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS orders
             FROM users u LEFT JOIN loyalty_accounts a ON a.user_id = u.id WHERE {$sqlWhere} ORDER BY {$sort} LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return Json::send($response, $this->paged(array_map(static fn ($u) => [
            'id' => (int) $u['id'],
            'name' => "{$u['first_name']} {$u['last_name']}",
            'email' => $u['email'],
            'phone' => $u['phone'],
            'tier' => $u['tier'] ?? 'bronze',
            'walletKobo' => (int) $u['wallet_balance_kobo'],
            'points' => (int) $u['points_balance'],
            'spend12mKobo' => (int) $u['spend_12m_kobo'],
            'orders' => (int) $u['orders'],
            'lastActivityAt' => $u['last_activity_at'],
            'joinedAt' => $u['created_at'],
            'isActive' => (bool) $u['is_active'],
        ], $rows), $total, $page));
    }

    /** @param array{id: string} $args */
    public function show(Request $request, Response $response, array $args): Response
    {
        $u = $this->customer((int) $args['id']);
        return Json::send($response, [
            'customer' => [
                'id' => (int) $u['id'],
                'name' => "{$u['first_name']} {$u['last_name']}",
                'email' => $u['email'],
                'phone' => $u['phone'],
                'emailVerified' => $u['email_verified_at'] !== null,
                'birthday' => $u['birthday'],
                'marketingOptIn' => (bool) $u['marketing_opt_in'],
                'referralCode' => $u['referral_code'],
                'joinedAt' => $u['created_at'],
                'isActive' => (bool) $u['is_active'],
            ],
            'loyalty' => $this->loyalty->summary((int) $u['id']),
            'orders' => array_map(static fn ($o) => [
                'reference' => $o['reference'], 'status' => $o['status'], 'placedAt' => $o['placed_at'],
                'totalKobo' => (int) $o['total_kobo'] + (int) $o['wallet_applied_kobo'], 'fulfilment' => $o['fulfilment'],
            ], $this->db->all("SELECT * FROM orders WHERE user_id = ? AND status <> 'pending_payment' ORDER BY placed_at DESC LIMIT 20", [$u['id']])),
            'visits' => array_map(static fn ($v) => [
                'reference' => $v['reference'], 'amountKobo' => (int) $v['amount_kobo'], 'points' => (int) $v['points_earned'], 'at' => $v['visited_at'], 'note' => $v['note'],
            ], $this->db->all('SELECT * FROM dine_in_visits WHERE user_id = ? ORDER BY visited_at DESC LIMIT 20', [$u['id']])),
            'reservations' => array_map(static fn ($r) => [
                'code' => $r['code'], 'date' => $r['service_date'], 'time' => substr((string) $r['start_time'], 0, 5), 'partySize' => (int) $r['party_size'], 'status' => $r['status'],
            ], $this->db->all('SELECT * FROM reservations WHERE user_id = ? OR guest_email = ? ORDER BY service_date DESC LIMIT 20', [$u['id'], $u['email']])),
            'canAdjust' => Permissions::can(Json::user($request), 'loyalty.adjust'),
        ]);
    }

    /** @param array{id: string} $args */
    public function history(Request $request, Response $response, array $args): Response
    {
        $u = $this->customer((int) $args['id']);
        $q = Validator::validate($request->getQueryParams(), ['kind' => 'required|string|in:wallet,points', 'before' => 'nullable|int|min:1']);
        return Json::send($response, $this->loyalty->history((int) $u['id'], $q['kind'], $q['before'] ?? null));
    }

    /**
     * Front desk records a dine-in bill so the member earns points and a stamp.
     *
     * @param array{id: string} $args
     */
    public function recordVisit(Request $request, Response $response, array $args): Response
    {
        $u = $this->customer((int) $args['id']);
        $data = Validator::validate(Json::body($request), [
            'amount_naira' => 'required|int|min:1000|max:5000000',
            'note' => 'nullable|string|max:255',
        ], ['amount_naira' => 'Bill amount']);
        $result = $this->loyalty->recordVisit((int) $u['id'], $data['amount_naira'] * 100, $this->actorId($request), $data['note'] ?? null);
        return Json::send($response, ['visit' => $result], 201);
    }

    /**
     * Super Admin only: manual correction with a reason (audit-logged).
     *
     * @param array{id: string} $args
     */
    public function adjust(Request $request, Response $response, array $args): Response
    {
        $u = $this->customer((int) $args['id']);
        $data = Validator::validate(Json::body($request), [
            'kind' => 'required|string|in:wallet,points',
            'direction' => 'required|string|in:credit,debit',
            'amount' => 'required|int|min:1|max:100000000',
            'reason' => 'required|string|min:5|max:200',
        ]);
        // Wallet amounts are entered in naira; points as points.
        $amount = $data['kind'] === 'wallet' ? $data['amount'] * 100 : $data['amount'];
        $result = $this->loyalty->adjust($this->actorId($request), (int) $u['id'], $data['kind'], $data['direction'], $amount, $data['reason']);
        return Json::send($response, $result);
    }

    /** @return array<string, mixed> */
    private function customer(int $id): array
    {
        return $this->db->one("SELECT * FROM users WHERE id = ? AND role = 'customer'", [$id]) ?? throw HttpError::notFound('We couldn’t find that customer.');
    }
}
