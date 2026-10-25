<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\Json;
use App\Loyalty\InterestService;
use App\Loyalty\LoyaltySettingsValidator;
use App\Support\Clock;
use App\Support\Config;
use App\Support\Database;
use App\Support\Settings;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Interest Account & Rewards manager. */
final class LoyaltyAdminController extends AdminController
{
    public function __construct(
        private Database $db,
        private Settings $settings,
        private InterestService $interest,
        private AuditLogger $audit,
        private Clock $clock,
        private Config $config,
    ) {
    }

    public function settings(Request $request, Response $response): Response
    {
        return Json::send($response, [
            'settings' => $this->settings->group('loyalty'),
            'categories' => array_map(static fn ($c) => ['slug' => $c['slug'], 'name' => $c['name']], $this->db->all('SELECT slug, name FROM categories ORDER BY sort_order')),
            'rewards' => $this->rewards(),
        ]);
    }

    public function saveSettings(Request $request, Response $response): Response
    {
        $categories = array_column($this->db->all('SELECT slug FROM categories'), 'slug');
        $clean = LoyaltySettingsValidator::validate(Json::body($request), $categories);
        $before = $this->settings->group('loyalty');
        $merged = array_replace($before, $clean);
        $this->db->run('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [json_encode($merged, JSON_UNESCAPED_UNICODE), 'loyalty']);
        $this->settings->forget();
        $changed = array_keys(array_filter($clean, static fn ($v, $k) => ($before[$k] ?? null) != $v, ARRAY_FILTER_USE_BOTH));
        $this->audit->record($this->actorId($request), 'loyalty.settings_updated', 'settings', 'loyalty', [
            'changed' => $changed,
            'before' => array_intersect_key($before, array_flip($changed)),
            'after' => array_intersect_key($clean, array_flip($changed)),
        ]);
        return $this->settings($request, $response);
    }

    /** @param array{id?: string} $args */
    public function saveReward(Request $request, Response $response, array $args = []): Response
    {
        $creating = !isset($args['id']);
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate(Json::body($request), [
            'name' => "{$req}|string|max:120",
            'description' => "{$req}|string|max:255",
            'points_cost' => "{$req}|int|min:1|max:1000000",
            'reward_type' => "{$req}|string|in:credit,item,upgrade",
            'credit_naira' => 'nullable|int|min:1|max:1000000',
            'dish_id' => 'nullable|int|min:1',
            'category_slug' => 'nullable|string|max:30',
            'dine_in_only' => 'nullable|bool',
            'is_active' => 'nullable|bool',
            'sort_order' => 'nullable|int|min:0|max:999',
        ], ['points_cost' => 'Points', 'credit_naira' => 'Credit']);
        $cols = [];
        foreach (['name', 'description', 'points_cost', 'reward_type', 'dish_id', 'category_slug', 'sort_order'] as $k) {
            if (array_key_exists($k, $data)) {
                $cols[$k] = $data[$k];
            }
        }
        foreach (['dine_in_only', 'is_active'] as $k) {
            if (isset($data[$k])) {
                $cols[$k] = $data[$k] ? 1 : 0;
            }
        }
        if (array_key_exists('credit_naira', $data)) {
            $cols['credit_kobo'] = $data['credit_naira'] !== null ? $data['credit_naira'] * 100 : null;
        }
        $type = $cols['reward_type'] ?? ($creating ? null : $this->db->scalar('SELECT reward_type FROM rewards_catalog WHERE id = ?', [(int) $args['id']]));
        if ($type === 'credit' && $creating && empty($cols['credit_kobo'])) {
            throw \App\Http\ValidationError::field('credit_naira', 'Enter the dining credit this reward gives.');
        }
        if ($creating) {
            $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($data['name'])), '-');
            if ($this->db->scalar('SELECT 1 FROM rewards_catalog WHERE slug = ?', [$slug])) {
                throw \App\Http\ValidationError::field('name', 'A reward with that name already exists.');
            }
            $id = $this->db->insert('rewards_catalog', $cols + ['slug' => $slug]);
        } else {
            $id = (int) $args['id'];
            $this->db->scalar('SELECT 1 FROM rewards_catalog WHERE id = ?', [$id]) ?? throw HttpError::notFound();
            if ($cols) {
                $this->db->run(
                    'UPDATE rewards_catalog SET ' . implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($cols))) . ' WHERE id = ?',
                    [...array_values($cols), $id],
                );
            }
        }
        $this->audit->record($this->actorId($request), $creating ? 'loyalty.reward_created' : 'loyalty.reward_updated', 'reward', $id, $cols);
        return Json::send($response, ['rewards' => $this->rewards()], $creating ? 201 : 200);
    }

    /** Programme health: members, activity, credit issued vs redeemed, tiers, top members. */
    public function analytics(Request $request, Response $response): Response
    {
        $now = $this->clock->now();
        $d30 = $this->clock->sql($now->modify('-30 days'));
        $d90 = $this->clock->sql($now->modify('-90 days'));
        $members = (int) $this->db->scalar("SELECT COUNT(*) FROM users WHERE role = 'customer' AND is_active = 1");
        $active = (int) $this->db->scalar("SELECT COUNT(*) FROM loyalty_accounts a JOIN users u ON u.id = a.user_id WHERE u.role = 'customer' AND a.last_activity_at >= ?", [$d90]);
        $buyers = $this->db->one(
            "SELECT COUNT(*) AS buyers, SUM(n >= 2) AS repeaters FROM (
               SELECT user_id, COUNT(*) AS n FROM (
                 SELECT user_id, placed_at AS at FROM orders WHERE user_id IS NOT NULL AND payment_status = 'paid' AND placed_at >= ?
                 UNION ALL SELECT user_id, visited_at FROM dine_in_visits WHERE visited_at >= ?
               ) v GROUP BY user_id
             ) t",
            [$d90, $d90],
        ) ?? [];
        $flows = [];
        foreach ($this->db->all(
            'SELECT entry_type, direction, SUM(amount_kobo) AS total FROM wallet_ledger WHERE created_at >= ? GROUP BY entry_type, direction',
            [$d30],
        ) as $r) {
            $flows[$r['entry_type'] . ':' . $r['direction']] = (int) $r['total'];
        }
        $sum = static fn (array $keys) => array_sum(array_map(static fn ($k) => $flows[$k] ?? 0, $keys));
        $points = $this->db->one(
            "SELECT SUM(CASE WHEN direction = 'credit' THEN points ELSE 0 END) AS issued,
                    SUM(CASE WHEN entry_type = 'redeem' THEN points ELSE 0 END) AS redeemed,
                    SUM(CASE WHEN entry_type = 'expire' THEN points ELSE 0 END) AS expired
             FROM points_ledger WHERE created_at >= ?",
            [$d30],
        ) ?? [];
        $totals = $this->db->one(
            "SELECT COALESCE(SUM(wallet_balance_kobo), 0) AS wallet, COALESCE(SUM(points_balance), 0) AS points FROM loyalty_accounts a JOIN users u ON u.id = a.user_id WHERE u.role = 'customer'",
        ) ?? [];
        $tiers = [];
        foreach ($this->db->all("SELECT tier, COUNT(*) AS n FROM loyalty_accounts a JOIN users u ON u.id = a.user_id WHERE u.role = 'customer' GROUP BY tier") as $t) {
            $tiers[$t['tier']] = (int) $t['n'];
        }
        $issued = $sum(['topup:credit', 'topup_bonus:credit', 'interest:credit', 'referral_bonus:credit', 'reward_redemption:credit', 'birthday:credit', 'anniversary:credit']);
        return Json::send($response, [
            'members' => $members,
            'activeMembers90d' => $active,
            'repeatRate90d' => (int) ($buyers['buyers'] ?? 0) > 0 ? round((int) $buyers['repeaters'] / (int) $buyers['buyers'], 4) : 0,
            'last30d' => [
                'creditIssuedKobo' => [
                    'topups' => $sum(['topup:credit']),
                    'bonuses' => $sum(['topup_bonus:credit']),
                    'interest' => $sum(['interest:credit']),
                    'referrals' => $sum(['referral_bonus:credit']),
                    'rewards' => $sum(['reward_redemption:credit', 'birthday:credit', 'anniversary:credit']),
                    'adjustments' => $sum(['adjustment:credit']) - $sum(['adjustment:debit']),
                ],
                'creditSpentKobo' => $sum(['payment:debit']) - $sum(['refund:credit']),
                'totalIssuedKobo' => $issued,
                'pointsIssued' => (int) ($points['issued'] ?? 0),
                'pointsRedeemed' => (int) ($points['redeemed'] ?? 0),
                'pointsExpired' => (int) ($points['expired'] ?? 0),
            ],
            'outstanding' => ['walletKobo' => (int) $totals['wallet'], 'points' => (int) $totals['points']],
            'tiers' => array_map(static fn ($k) => ['key' => $k, 'members' => $tiers[$k] ?? 0], LoyaltySettingsValidator::TIER_KEYS),
            'topMembers' => array_map(static fn ($m) => [
                'id' => (int) $m['id'], 'name' => "{$m['first_name']} {$m['last_name']}", 'tier' => $m['tier'],
                'spend12mKobo' => (int) $m['spend_12m_kobo'], 'walletKobo' => (int) $m['wallet_balance_kobo'], 'points' => (int) $m['points_balance'],
            ], $this->db->all(
                "SELECT u.id, u.first_name, u.last_name, a.* FROM loyalty_accounts a JOIN users u ON u.id = a.user_id WHERE u.role = 'customer'
                 ORDER BY a.spend_12m_kobo DESC LIMIT 10",
            )),
            'interestRuns' => $this->runs(),
        ]);
    }

    /** The full ledger across members (wallet or points), filterable. */
    public function ledger(Request $request, Response $response): Response
    {
        [$page, $limit, $offset] = $this->page($request);
        $kind = $this->query($request, 'kind') === 'points' ? 'points' : 'wallet';
        [$table, $amount, $balance] = $kind === 'points' ? ['points_ledger', 'points', 'balance_after'] : ['wallet_ledger', 'amount_kobo', 'balance_after_kobo'];
        $where = ['1 = 1'];
        $params = [];
        if (($type = $this->query($request, 'type')) && preg_match('/^[a-z_]{2,30}$/', $type)) {
            $where[] = 'l.entry_type = ?';
            $params[] = $type;
        }
        if ($q = $this->query($request, 'q')) {
            $where[] = "(CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR u.email LIKE ? OR l.reference LIKE ?)";
            array_push($params, ...array_fill(0, 3, $this->like($q)));
        }
        $sqlWhere = implode(' AND ', $where);
        $total = (int) $this->db->scalar("SELECT COUNT(*) FROM {$table} l JOIN users u ON u.id = l.user_id WHERE {$sqlWhere}", $params);
        $rows = $this->db->all(
            "SELECT l.*, l.{$amount} AS amount, l.{$balance} AS bal, u.first_name, u.last_name, cb.first_name AS by_first, cb.last_name AS by_last
             FROM {$table} l JOIN users u ON u.id = l.user_id LEFT JOIN users cb ON cb.id = l.created_by_user_id
             WHERE {$sqlWhere} ORDER BY l.id DESC LIMIT {$limit} OFFSET {$offset}",
            $params,
        );
        return Json::send($response, ['kind' => $kind] + $this->paged(array_map(static fn ($r) => [
            'id' => (int) $r['id'],
            'member' => ['id' => (int) $r['user_id'], 'name' => "{$r['first_name']} {$r['last_name']}"],
            'type' => $r['entry_type'],
            'direction' => $r['direction'],
            'amount' => (int) $r['amount'],
            'balanceAfter' => (int) $r['bal'],
            'reference' => $r['reference'],
            'description' => $r['description'],
            'by' => $r['by_first'] ? "{$r['by_first']} {$r['by_last']}" : null,
            'at' => $r['created_at'],
        ], $rows), $total, $page));
    }

    /** Super Admin: pay a finished month's interest now (normally the 1st-of-month cron does this). */
    public function runInterest(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), ['period' => 'required|string|regex:/^\d{4}-(0[1-9]|1[0-2])$/']);
        $result = $this->interest->run($data['period'], 'admin', $this->actorId($request));
        return Json::send($response, ['result' => $result, 'interestRuns' => $this->runs()]);
    }

    /**
     * Demo only: "Simulate month-end interest" pays this month's interest so far, live, for the
     * presentation. Refused unless demo tools are switched on and never in production.
     */
    public function simulateInterest(Request $request, Response $response): Response
    {
        if ($this->config->isProduction() || !$this->config->bool('DEMO_TOOLS', false)) {
            throw HttpError::notFound();
        }
        $result = $this->interest->run($this->clock->now()->format('Y-m'), 'demo', $this->actorId($request));
        return Json::send($response, ['result' => $result, 'interestRuns' => $this->runs()]);
    }

    /** @return list<array<string, mixed>> */
    private function runs(): array
    {
        return array_map(static fn ($r) => [
            'period' => $r['period'], 'status' => $r['status'], 'accounts' => (int) $r['accounts_credited'], 'totalKobo' => (int) $r['total_kobo'],
            'trigger' => $r['triggered_by'], 'startedAt' => $r['started_at'], 'finishedAt' => $r['finished_at'], 'error' => $r['error'],
        ], $this->db->all('SELECT * FROM interest_runs ORDER BY period DESC LIMIT 24'));
    }

    /** @return list<array<string, mixed>> */
    private function rewards(): array
    {
        return array_map(static fn ($r) => [
            'id' => (int) $r['id'], 'slug' => $r['slug'], 'name' => $r['name'], 'description' => $r['description'],
            'pointsCost' => (int) $r['points_cost'], 'type' => $r['reward_type'], 'creditKobo' => $r['credit_kobo'] !== null ? (int) $r['credit_kobo'] : null,
            'dishId' => $r['dish_id'] !== null ? (int) $r['dish_id'] : null, 'categorySlug' => $r['category_slug'],
            'dineInOnly' => (bool) $r['dine_in_only'], 'isActive' => (bool) $r['is_active'], 'sortOrder' => (int) $r['sort_order'],
            'redeemed' => (int) $r['redeemed'],
        ], $this->db->all(
            "SELECT r.*, (SELECT COUNT(*) FROM points_ledger p WHERE p.entry_type = 'redeem' AND p.reference = r.slug) AS redeemed
             FROM rewards_catalog r ORDER BY r.sort_order, r.points_cost",
        ));
    }
}
