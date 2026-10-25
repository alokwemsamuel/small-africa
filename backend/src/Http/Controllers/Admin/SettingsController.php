<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\Json;
use App\Http\ValidationError;
use App\Support\Database;
use App\Support\Settings;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Restaurant settings: contact details, tax and charges, ordering, reservations, hours, zones, seating. */
final class SettingsController extends AdminController
{
    /** Allowed fields per settings group, with Validator rules. */
    private const GROUPS = [
        'restaurant' => [
            'name' => 'required|string|max:80',
            'tagline' => 'required|string|max:120',
            'address' => 'required|string|max:200',
            'phone' => 'required|string|max:30',
            'whatsapp' => 'required|string|max:20|regex:/^\+?\d{8,15}$/',
            'email' => 'required|email',
            'instagram' => 'nullable|string|max:200|regex:#^https://#',
            'tiktok' => 'nullable|string|max:200|regex:#^https://#',
            'map_embed_query' => 'required|string|max:200',
        ],
        'pricing' => [
            'prices_include_vat' => 'required|bool',
            'vat_rate_bp' => 'required|int|min:0|max:3000',
            'service_charge_dine_in_bp' => 'required|int|min:0|max:3000',
            'service_charge_online_bp' => 'required|int|min:0|max:3000',
            'packaging_fee_kobo' => 'required|int|min:0|max:1000000',
        ],
        'ordering' => [
            'accepting_orders' => 'required|bool',
            'min_lead_minutes' => 'required|int|min:10|max:240',
            'max_schedule_days' => 'required|int|min:0|max:30',
            'max_items_per_order' => 'required|int|min:1|max:200',
        ],
        'reservations' => [
            'min_advance_minutes' => 'required|int|min:0|max:1440',
            'max_days_ahead' => 'required|int|min:1|max:365',
            'max_party_online' => 'required|int|min:1|max:50',
            'dining_duration_minutes' => 'required|int|min:30|max:360',
        ],
    ];

    public function __construct(private Database $db, private Settings $settings, private AuditLogger $audit)
    {
    }

    public function index(Request $request, Response $response): Response
    {
        $groups = [];
        foreach (array_keys(self::GROUPS) as $g) {
            $groups[$g] = $this->settings->group($g);
        }
        return Json::send($response, [
            'groups' => $groups,
            'hours' => array_map(static fn ($h) => [
                'dayOfWeek' => (int) $h['day_of_week'],
                'opensAt' => $h['opens_at'] ? substr($h['opens_at'], 0, 5) : null,
                'closesAt' => $h['closes_at'] ? substr($h['closes_at'], 0, 5) : null,
                'isClosed' => (bool) $h['is_closed'],
            ], $this->db->all('SELECT * FROM opening_hours ORDER BY day_of_week')),
            'zones' => array_map(static fn ($z) => [
                'id' => (int) $z['id'], 'slug' => $z['slug'], 'name' => $z['name'], 'feeKobo' => (int) $z['fee_kobo'],
                'minOrderKobo' => (int) $z['min_order_kobo'], 'etaMinutes' => (int) $z['eta_minutes'], 'isActive' => (bool) $z['is_active'],
            ], $this->db->all('SELECT * FROM delivery_zones ORDER BY sort_order, name')),
            'seating' => array_map(static fn ($a) => [
                'id' => (int) $a['id'], 'slug' => $a['slug'], 'name' => $a['name'], 'description' => $a['description'],
                'coversPerSlot' => (int) $a['covers_per_slot'], 'minParty' => (int) $a['min_party'], 'maxParty' => (int) $a['max_party'], 'isActive' => (bool) $a['is_active'],
            ], $this->db->all('SELECT * FROM seating_areas ORDER BY sort_order')),
        ]);
    }

    /** @param array{group: string} $args */
    public function saveGroup(Request $request, Response $response, array $args): Response
    {
        $rules = self::GROUPS[$args['group']] ?? throw HttpError::notFound();
        $clean = Validator::validate(Json::body($request), $rules);
        $before = $this->settings->group($args['group']);
        $after = array_replace($before, $clean);
        $this->db->run(
            'UPDATE settings SET setting_value = ?, updated_by_user_id = ? WHERE setting_key = ?',
            [json_encode($after, JSON_UNESCAPED_UNICODE), $this->actorId($request), $args['group']],
        );
        $this->settings->forget();
        $changed = array_keys(array_filter($clean, static fn ($v, $k) => ($before[$k] ?? null) != $v, ARRAY_FILTER_USE_BOTH));
        $this->audit->record($this->actorId($request), 'settings.updated', 'settings', $args['group'], [
            'before' => array_intersect_key($before, array_flip($changed)),
            'after' => array_intersect_key($clean, array_flip($changed)),
        ]);
        return $this->index($request, $response);
    }

    public function saveHours(Request $request, Response $response): Response
    {
        $days = Json::body($request)['hours'] ?? null;
        if (!is_array($days) || count($days) !== 7) {
            throw ValidationError::field('hours', 'Send all seven days.');
        }
        $rows = [];
        foreach ($days as $d) {
            $c = Validator::validate(is_array($d) ? $d : [], [
                'day_of_week' => 'required|int|min:0|max:6',
                'opens_at' => 'nullable|time',
                'closes_at' => 'nullable|time',
                'is_closed' => 'required|bool',
            ], ['opens_at' => 'Opening time', 'closes_at' => 'Closing time']);
            if (!$c['is_closed'] && (empty($c['opens_at']) || empty($c['closes_at']) || $c['opens_at'] >= $c['closes_at'])) {
                throw ValidationError::field('hours', 'Each open day needs an opening time before its closing time.');
            }
            $rows[$c['day_of_week']] = $c;
        }
        if (count($rows) !== 7) {
            throw ValidationError::field('hours', 'Send each day once.');
        }
        $this->db->transaction(function () use ($rows): void {
            foreach ($rows as $day => $c) {
                $this->db->run(
                    'UPDATE opening_hours SET opens_at = ?, closes_at = ?, is_closed = ? WHERE day_of_week = ?',
                    [$c['is_closed'] ? null : $c['opens_at'], $c['is_closed'] ? null : $c['closes_at'], $c['is_closed'] ? 1 : 0, $day],
                );
            }
        });
        $this->audit->record($this->actorId($request), 'settings.hours_updated', 'settings', 'opening_hours', ['hours' => array_values($rows)]);
        return $this->index($request, $response);
    }

    /** @param array{id?: string} $args */
    public function saveZone(Request $request, Response $response, array $args = []): Response
    {
        $creating = !isset($args['id']);
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate(Json::body($request), [
            'name' => "{$req}|string|max:80",
            'fee_naira' => "{$req}|int|min:0|max:100000",
            'min_order_naira' => "{$req}|int|min:0|max:1000000",
            'eta_minutes' => "{$req}|int|min:10|max:240",
            'is_active' => 'nullable|bool',
        ], ['fee_naira' => 'Delivery fee', 'min_order_naira' => 'Minimum order', 'eta_minutes' => 'Delivery time']);
        $cols = array_filter([
            'name' => $data['name'] ?? null,
            'fee_kobo' => isset($data['fee_naira']) ? $data['fee_naira'] * 100 : null,
            'min_order_kobo' => isset($data['min_order_naira']) ? $data['min_order_naira'] * 100 : null,
            'eta_minutes' => $data['eta_minutes'] ?? null,
            'is_active' => isset($data['is_active']) ? ($data['is_active'] ? 1 : 0) : null,
        ], static fn ($v) => $v !== null);
        if ($creating) {
            $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($data['name'])), '-');
            if ($this->db->scalar('SELECT 1 FROM delivery_zones WHERE slug = ?', [$slug])) {
                throw ValidationError::field('name', 'That delivery area already exists.');
            }
            $id = $this->db->insert('delivery_zones', $cols + ['slug' => $slug, 'sort_order' => 99]);
        } else {
            $id = (int) $args['id'];
            $this->db->scalar('SELECT 1 FROM delivery_zones WHERE id = ?', [$id]) ?? throw HttpError::notFound();
            if ($cols) {
                $this->db->run('UPDATE delivery_zones SET ' . implode(', ', array_map(static fn ($c) => "{$c} = ?", array_keys($cols))) . ' WHERE id = ?', [...array_values($cols), $id]);
            }
        }
        $this->audit->record($this->actorId($request), $creating ? 'settings.zone_created' : 'settings.zone_updated', 'delivery_zone', $id, $cols);
        return $this->index($request, $response);
    }

    /** @param array{id: string} $args */
    public function saveSeating(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $area = $this->db->one('SELECT * FROM seating_areas WHERE id = ?', [$id]) ?? throw HttpError::notFound();
        $data = Validator::validate(Json::body($request), [
            'covers_per_slot' => 'required|int|min:0|max:500',
            'min_party' => 'required|int|min:1|max:50',
            'max_party' => 'required|int|min:1|max:100',
            'is_active' => 'required|bool',
        ], ['covers_per_slot' => 'Covers per slot']);
        if ($data['min_party'] > $data['max_party']) {
            throw ValidationError::field('max_party', 'The largest party must be at least the smallest.');
        }
        $this->db->run(
            'UPDATE seating_areas SET covers_per_slot = ?, min_party = ?, max_party = ?, is_active = ? WHERE id = ?',
            [$data['covers_per_slot'], $data['min_party'], $data['max_party'], $data['is_active'] ? 1 : 0, $id],
        );
        $this->audit->record($this->actorId($request), 'settings.seating_updated', 'seating_area', $area['slug'], $data);
        return $this->index($request, $response);
    }
}
