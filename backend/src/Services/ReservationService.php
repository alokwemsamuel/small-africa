<?php

declare(strict_types=1);

namespace App\Services;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\ValidationError;
use App\Mail\EmailTemplates;
use App\Mail\Mailer;
use App\Security\Crypto;
use App\Security\RateLimiter;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Logger;
use App\Support\Settings;

/**
 * Table reservations against real capacity: each seating area seats a number of guests per
 * time slot (overridable per date), and bookings are serialised with a row lock so two
 * guests can never take the last seats at the same moment.
 */
final class ReservationService
{
    private const ACTIVE = ['pending', 'confirmed', 'seated'];

    public function __construct(
        private Database $db,
        private Settings $settings,
        private RateLimiter $limiter,
        private Mailer $mailer,
        private EmailTemplates $emails,
        private AuditLogger $audit,
        private Crypto $crypto,
        private Clock $clock,
        private Logger $logger,
        private string $frontendUrl,
    ) {
    }

    /**
     * Slots for a date and party size, per seating area.
     *
     * @return array<string, mixed>
     */
    public function availability(string $date, int $partySize): array
    {
        $day = $this->parseDate($date);
        $rules = $this->settings->group('reservations');
        $maxParty = (int) ($rules['max_party_online'] ?? 12);
        if ($partySize < 1 || $partySize > $maxParty) {
            throw ValidationError::field('party_size', "Online bookings are for 1–{$maxParty} guests. For larger groups, please send an events enquiry.");
        }
        $window = $this->settings->openingWindow($day);
        $slots = $this->db->all('SELECT start_time FROM reservation_slots WHERE is_active = 1 ORDER BY start_time');
        $areas = $this->db->all('SELECT * FROM seating_areas WHERE is_active = 1 ORDER BY sort_order');
        $earliest = $this->clock->now()->modify('+' . (int) ($rules['min_advance_minutes'] ?? 60) . ' minutes');
        $duration = (int) ($rules['dining_duration_minutes'] ?? 120);

        $booked = [];
        foreach ($this->db->all(
            "SELECT seating_area_id, start_time, SUM(party_size) AS guests FROM reservations
             WHERE service_date = ? AND status IN ('pending','confirmed','seated') GROUP BY seating_area_id, start_time",
            [$day->format('Y-m-d')],
        ) as $b) {
            $booked[$b['seating_area_id'] . '@' . substr($b['start_time'], 0, 5)] = (int) $b['guests'];
        }

        $out = [];
        foreach ($areas as $area) {
            $fits = $partySize >= (int) $area['min_party'] && $partySize <= (int) $area['max_party'];
            $times = [];
            foreach ($slots as $s) {
                $time = substr($s['start_time'], 0, 5);
                $at = new \DateTimeImmutable($day->format('Y-m-d') . " {$time}", Clock::zone());
                $open = $window && $at >= $window['opens'] && $at->modify("+60 minutes") <= $window['closes'];
                $capacity = $this->capacity((int) $area['id'], $day->format('Y-m-d'), $time, (int) $area['covers_per_slot']);
                $remaining = $capacity - ($booked[$area['id'] . '@' . $time] ?? 0);
                $times[] = [
                    'time' => $time,
                    'available' => $fits && $open && $at >= $earliest && $remaining >= $partySize,
                    'remaining' => max(0, $remaining),
                ];
            }
            $out[] = [
                'slug' => $area['slug'],
                'name' => $area['name'],
                'description' => $area['description'],
                'minParty' => (int) $area['min_party'],
                'maxParty' => (int) $area['max_party'],
                'fitsParty' => $fits,
                'slots' => $times,
            ];
        }
        return ['date' => $day->format('Y-m-d'), 'partySize' => $partySize, 'durationMinutes' => $duration, 'areas' => $out, 'closed' => $window === null];
    }

    /**
     * @param array<string, mixed> $data validated booking request
     * @param array<string, mixed>|null $user
     * @return array<string, mixed>
     */
    public function create(array $data, ?array $user, string $ip): array
    {
        $this->limiter->hit("reserve:ip:{$ip}", 10, 3600);
        $this->limiter->hit('reserve:email:' . hash('sha256', $data['email']), 5, 86400);

        $availability = $this->availability($data['date'], (int) $data['party_size']);
        $area = current(array_filter($availability['areas'], static fn ($a) => $a['slug'] === $data['area']));
        if (!$area) {
            throw ValidationError::field('area', 'Choose where you’d like to sit.');
        }
        if (!$area['fitsParty']) {
            throw ValidationError::field('area', "{$area['name']} seats {$area['minParty']}–{$area['maxParty']} guests.");
        }
        $slot = current(array_filter($area['slots'], static fn ($s) => $s['time'] === $data['time']));
        if (!$slot || !$slot['available']) {
            throw ValidationError::field('time', 'That time isn’t available. Please choose another.');
        }

        $areaRow = $this->db->one('SELECT * FROM seating_areas WHERE slug = ?', [$data['area']]);
        $id = $this->db->transaction(function () use ($data, $user, $areaRow): int {
            // Serialise bookings per area, then re-check capacity inside the lock.
            $this->db->one('SELECT id FROM seating_areas WHERE id = ? FOR UPDATE', [$areaRow['id']]);
            $taken = (int) $this->db->scalar(
                "SELECT COALESCE(SUM(party_size), 0) FROM reservations
                 WHERE seating_area_id = ? AND service_date = ? AND start_time = ? AND status IN ('pending','confirmed','seated')",
                [$areaRow['id'], $data['date'], $data['time'] . ':00'],
            );
            $capacity = $this->capacity((int) $areaRow['id'], $data['date'], $data['time'], (int) $areaRow['covers_per_slot']);
            if ($taken + (int) $data['party_size'] > $capacity) {
                throw HttpError::conflict('Someone just booked the last seats at that time. Please choose another slot.', 'slot_taken');
            }
            return $this->db->insert('reservations', [
                'code' => $this->newCode(),
                'user_id' => $user['id'] ?? null,
                'guest_name' => $data['name'],
                'guest_email' => $data['email'],
                'guest_phone' => $data['phone'],
                'party_size' => $data['party_size'],
                'service_date' => $data['date'],
                'start_time' => $data['time'] . ':00',
                'seating_area_id' => $areaRow['id'],
                'occasion' => $data['occasion'] ?? 'none',
                'notes' => $data['notes'] ?? null,
                'status' => 'confirmed',
            ]);
        });

        $row = $this->db->one('SELECT * FROM reservations WHERE id = ?', [$id]);
        $this->audit->record($user ? (int) $user['id'] : null, 'reservation.created', 'reservation', $row['code']);
        $this->deliver($row, $this->emails->reservationConfirmation($row, $areaRow['name'], $this->manageUrl($row['code'])));
        return ['reservation' => $this->toPublic($row), 'manageToken' => $this->manageToken($row['code'])];
    }

    /**
     * @param array<string, mixed>|null $user
     * @return array<string, mixed>
     */
    public function find(string $code, ?array $user, ?string $token): array
    {
        return $this->toPublic($this->authorised($code, $user, $token));
    }

    /** @param array<string, mixed>|null $user */
    public function cancel(string $code, ?array $user, ?string $token): array
    {
        $row = $this->authorised($code, $user, $token);
        if (!in_array($row['status'], ['pending', 'confirmed'], true)) {
            throw HttpError::conflict('This booking can no longer be cancelled online. Please call us.');
        }
        $start = new \DateTimeImmutable($row['service_date'] . ' ' . $row['start_time'], Clock::zone());
        if ($start < $this->clock->now()) {
            throw HttpError::conflict('This booking has already started.');
        }
        $this->db->run("UPDATE reservations SET status = 'cancelled', cancelled_reason = 'Cancelled by guest' WHERE id = ?", [$row['id']]);
        $this->audit->record($user ? (int) $user['id'] : null, 'reservation.cancelled', 'reservation', $row['code']);
        $row = $this->db->one('SELECT * FROM reservations WHERE id = ?', [$row['id']]);
        $this->deliver($row, $this->emails->reservationCancelled($row));
        return $this->toPublic($row);
    }

    /** @return list<array<string, mixed>> */
    public function listForUser(int $userId, string $email): array
    {
        return array_map(fn ($r) => $this->toPublic($r), $this->db->all(
            'SELECT * FROM reservations WHERE user_id = ? OR guest_email = ? ORDER BY service_date DESC, start_time DESC LIMIT 50',
            [$userId, $email],
        ));
    }

    public function manageToken(string $code): string
    {
        return $this->crypto->mac('reservation-manage', $code);
    }

    /**
     * @param array<string, mixed>|null $user
     * @return array<string, mixed>
     */
    private function authorised(string $code, ?array $user, ?string $token): array
    {
        $row = $this->db->one('SELECT * FROM reservations WHERE code = ?', [strtoupper($code)]);
        $owner = $row && $user && ((int) $row['user_id'] === (int) $user['id'] || $row['guest_email'] === $user['email']);
        $tokenOk = $row && $token && hash_equals($this->manageToken($row['code']), $token);
        if (!$row || !($owner || $tokenOk)) {
            throw HttpError::notFound('We couldn’t find that reservation.');
        }
        return $row;
    }

    private function capacity(int $areaId, string $date, string $time, int $default): int
    {
        $override = $this->db->one(
            'SELECT covers FROM capacity_overrides WHERE seating_area_id = ? AND service_date = ? AND (start_time = ? OR start_time IS NULL)
             ORDER BY start_time IS NULL LIMIT 1',
            [$areaId, $date, $time . ':00'],
        );
        return $override ? (int) $override['covers'] : $default;
    }

    private function parseDate(string $date): \DateTimeImmutable
    {
        $day = \DateTimeImmutable::createFromFormat('!Y-m-d', $date, Clock::zone());
        if (!$day || $day->format('Y-m-d') !== $date) {
            throw ValidationError::field('date', 'Choose a valid date.');
        }
        $today = $this->clock->now()->setTime(0, 0);
        $maxDays = (int) $this->settings->get('reservations', 'max_days_ahead', 60);
        if ($day < $today) {
            throw ValidationError::field('date', 'Choose a date from today onwards.');
        }
        if ($day > $today->modify("+{$maxDays} days")) {
            throw ValidationError::field('date', "Bookings open {$maxDays} days ahead.");
        }
        return $day;
    }

    /**
     * @param array<string, mixed> $r
     * @return array<string, mixed>
     */
    private function toPublic(array $r): array
    {
        $area = $this->db->one('SELECT slug, name FROM seating_areas WHERE id = ?', [$r['seating_area_id']]);
        return [
            'code' => $r['code'],
            'status' => $r['status'],
            'date' => $r['service_date'],
            'time' => substr((string) $r['start_time'], 0, 5),
            'partySize' => (int) $r['party_size'],
            'area' => $area,
            'occasion' => $r['occasion'],
            'notes' => $r['notes'],
            'name' => $r['guest_name'],
            'createdAt' => $r['created_at'],
        ];
    }

    private function newCode(): string
    {
        do {
            $code = Crypto::code(6, 'R-');
        } while ($this->db->scalar('SELECT 1 FROM reservations WHERE code = ?', [$code]));
        return $code;
    }

    private function manageUrl(string $code): string
    {
        return "{$this->frontendUrl}/reservations/{$code}?t=" . $this->manageToken($code);
    }

    /**
     * @param array<string, mixed> $r
     * @param array{subject: string, html: string, text: string} $mail
     */
    private function deliver(array $r, array $mail): void
    {
        try {
            $this->mailer->send($r['guest_email'], $r['guest_name'], $mail['subject'], $mail['html'], $mail['text']);
        } catch (\Throwable $e) {
            $this->logger->error('Reservation email failed', ['code' => $r['code'], 'error' => $e->getMessage()]);
        }
    }
}
