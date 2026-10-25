<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\Json;
use App\Services\ReservationService;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ReservationsController extends AdminController
{
    public function __construct(
        private Database $db,
        private ReservationService $reservations,
        private AuditLogger $audit,
        private Clock $clock,
    ) {
    }

    /** Bookings between two dates (default: the next 7 days), for the list and calendar views. */
    public function index(Request $request, Response $response): Response
    {
        $q = Validator::validate($request->getQueryParams(), [
            'from' => 'nullable|date',
            'to' => 'nullable|date',
            'status' => 'nullable|string|max:80',
            'q' => 'nullable|string|max:80',
        ]);
        $from = $q['from'] ?? $this->clock->now()->format('Y-m-d');
        $to = $q['to'] ?? (new \DateTimeImmutable($from))->modify('+6 days')->format('Y-m-d');
        if ((new \DateTimeImmutable($from))->diff(new \DateTimeImmutable($to))->days > 62) {
            throw HttpError::badRequest('Choose a range of two months or less.');
        }
        $where = ['r.service_date BETWEEN ? AND ?'];
        $params = [$from, $to];
        if (!empty($q['status'])) {
            $list = array_values(array_intersect(explode(',', $q['status']), array_keys(ReservationService::STAFF_TRANSITIONS)));
            if ($list) {
                $where[] = 'r.status IN (' . implode(',', array_fill(0, count($list), '?')) . ')';
                array_push($params, ...$list);
            }
        }
        if (!empty($q['q'])) {
            $where[] = '(r.code LIKE ? OR r.guest_name LIKE ? OR r.guest_email LIKE ? OR r.guest_phone LIKE ?)';
            array_push($params, ...array_fill(0, 4, $this->like($q['q'])));
        }
        $rows = $this->db->all(
            'SELECT r.*, a.slug AS area_slug, a.name AS area_name, la.tier FROM reservations r
             JOIN seating_areas a ON a.id = r.seating_area_id LEFT JOIN loyalty_accounts la ON la.user_id = r.user_id
             WHERE ' . implode(' AND ', $where) . ' ORDER BY r.service_date, r.start_time, r.id LIMIT 500',
            $params,
        );
        return Json::send($response, [
            'from' => $from,
            'to' => $to,
            'reservations' => array_map(fn ($r) => $this->toAdmin($r), $rows),
            'areas' => array_map(static fn ($a) => ['slug' => $a['slug'], 'name' => $a['name'], 'coversPerSlot' => (int) $a['covers_per_slot']], $this->db->all('SELECT * FROM seating_areas WHERE is_active = 1 ORDER BY sort_order')),
        ]);
    }

    /** @param array{code: string} $args */
    public function update(Request $request, Response $response, array $args): Response
    {
        $data = Validator::validate(Json::body($request), [
            'status' => 'nullable|string|in:pending,confirmed,seated,completed,cancelled,no_show',
            'table_label' => 'nullable|string|max:20',
            'area' => 'nullable|string|max:40',
            'reason' => 'nullable|string|max:255',
        ], ['table_label' => 'Table']);
        $row = $this->reservations->staffUpdate($args['code'], $data, $this->actorId($request));
        $full = $this->db->one(
            'SELECT r.*, a.slug AS area_slug, a.name AS area_name, la.tier FROM reservations r JOIN seating_areas a ON a.id = r.seating_area_id
             LEFT JOIN loyalty_accounts la ON la.user_id = r.user_id WHERE r.id = ?',
            [$row['id']],
        ) ?? [];
        return Json::send($response, ['reservation' => $this->toAdmin($full)]);
    }

    /** Capacity for one date: each area's default covers per slot, bookings and overrides. */
    public function capacity(Request $request, Response $response): Response
    {
        $q = Validator::validate($request->getQueryParams(), ['date' => 'required|date']);
        $areas = $this->db->all('SELECT * FROM seating_areas WHERE is_active = 1 ORDER BY sort_order');
        $slots = array_map(static fn ($s) => substr((string) $s['start_time'], 0, 5), $this->db->all('SELECT start_time FROM reservation_slots WHERE is_active = 1 ORDER BY start_time'));
        $overrides = $this->db->all('SELECT * FROM capacity_overrides WHERE service_date = ?', [$q['date']]);
        $booked = [];
        foreach ($this->db->all(
            "SELECT seating_area_id, start_time, SUM(party_size) AS covers FROM reservations WHERE service_date = ? AND status IN ('pending','confirmed','seated')
             GROUP BY seating_area_id, start_time",
            [$q['date']],
        ) as $b) {
            $booked[$b['seating_area_id'] . '|' . substr((string) $b['start_time'], 0, 5)] = (int) $b['covers'];
        }
        return Json::send($response, [
            'date' => $q['date'],
            'slots' => $slots,
            'areas' => array_map(function ($a) use ($slots, $overrides, $booked) {
                $mine = array_values(array_filter($overrides, static fn ($o) => (int) $o['seating_area_id'] === (int) $a['id']));
                $wholeDay = array_values(array_filter($mine, static fn ($o) => $o['start_time'] === null))[0] ?? null;
                return [
                    'slug' => $a['slug'],
                    'name' => $a['name'],
                    'defaultCovers' => (int) $a['covers_per_slot'],
                    'slots' => array_map(static function ($t) use ($a, $mine, $wholeDay, $booked) {
                        $o = array_values(array_filter($mine, static fn ($x) => $x['start_time'] !== null && substr((string) $x['start_time'], 0, 5) === $t))[0] ?? $wholeDay;
                        return [
                            'time' => $t,
                            'covers' => $o ? (int) $o['covers'] : (int) $a['covers_per_slot'],
                            'booked' => $booked[$a['id'] . '|' . $t] ?? 0,
                            'override' => $o ? ['id' => (int) $o['id'], 'reason' => $o['reason'], 'wholeDay' => $o['start_time'] === null] : null,
                        ];
                    }, $slots),
                ];
            }, $areas),
        ]);
    }

    /** Sets covers for one slot (or a whole day) in one area. 0 closes it. */
    public function setCapacity(Request $request, Response $response): Response
    {
        $data = Validator::validate(Json::body($request), [
            'date' => 'required|date',
            'area' => 'required|string|max:40',
            'time' => 'nullable|time',
            'covers' => 'required|int|min:0|max:500',
            'reason' => 'nullable|string|max:160',
        ]);
        $areaId = $this->db->scalar('SELECT id FROM seating_areas WHERE slug = ?', [$data['area']]) ?? throw HttpError::badRequest('Unknown seating area.');
        $time = isset($data['time']) ? $data['time'] . ':00' : null;
        $existing = $this->db->scalar(
            'SELECT id FROM capacity_overrides WHERE service_date = ? AND seating_area_id = ? AND ' . ($time === null ? 'start_time IS NULL' : 'start_time = ?'),
            $time === null ? [$data['date'], $areaId] : [$data['date'], $areaId, $time],
        );
        if ($existing) {
            $this->db->run('UPDATE capacity_overrides SET covers = ?, reason = ? WHERE id = ?', [$data['covers'], $data['reason'] ?? null, $existing]);
        } else {
            $this->db->insert('capacity_overrides', [
                'service_date' => $data['date'], 'start_time' => $time, 'seating_area_id' => $areaId, 'covers' => $data['covers'], 'reason' => $data['reason'] ?? null,
            ]);
        }
        $this->audit->record($this->actorId($request), 'capacity.set', 'seating_area', $data['area'], $data);
        return $this->capacity($request->withQueryParams(['date' => $data['date']]), $response);
    }

    /** @param array{id: string} $args */
    public function clearCapacity(Request $request, Response $response, array $args): Response
    {
        $o = $this->db->one('SELECT * FROM capacity_overrides WHERE id = ?', [(int) $args['id']]) ?? throw HttpError::notFound();
        $this->db->run('DELETE FROM capacity_overrides WHERE id = ?', [$o['id']]);
        $this->audit->record($this->actorId($request), 'capacity.cleared', 'capacity_override', (int) $o['id'], ['date' => $o['service_date']]);
        return $this->capacity($request->withQueryParams(['date' => $o['service_date']]), $response);
    }

    /** @param array<string, mixed> $r */
    private function toAdmin(array $r): array
    {
        return [
            'code' => $r['code'],
            'status' => $r['status'],
            'date' => $r['service_date'],
            'time' => substr((string) $r['start_time'], 0, 5),
            'partySize' => (int) $r['party_size'],
            'area' => ['slug' => $r['area_slug'], 'name' => $r['area_name']],
            'tableLabel' => $r['table_label'],
            'occasion' => $r['occasion'],
            'notes' => $r['notes'],
            'guest' => ['name' => $r['guest_name'], 'email' => $r['guest_email'], 'phone' => $r['guest_phone'], 'userId' => $r['user_id'] ? (int) $r['user_id'] : null, 'tier' => $r['tier'] ?? null],
            'cancelledReason' => $r['cancelled_reason'],
            'nextStatuses' => ReservationService::STAFF_TRANSITIONS[$r['status']] ?? [],
            'createdAt' => $r['created_at'],
        ];
    }
}
