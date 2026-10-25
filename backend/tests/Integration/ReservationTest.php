<?php

declare(strict_types=1);

namespace Tests\Integration;

/** Clock: Tuesday 20 Oct 2026 12:00. Slots 12:00–14:30 and 18:00–21:30; 60 min notice. */
final class ReservationTest extends IntegrationTestCase
{
    /** @return array<string, mixed> */
    private function booking(array $over = []): array
    {
        return $over + [
            'date' => '2026-10-24', 'time' => '19:30', 'party_size' => 4, 'area' => 'main-hall', 'occasion' => 'birthday',
            'name' => 'Tunde Okafor', 'email' => 'tunde@example.com', 'phone' => '08021234567',
        ];
    }

    /** @return array{0: \Psr\Http\Message\ResponseInterface, 1: array<string, mixed>} */
    private function book(array $over = []): array
    {
        return $this->request('POST', '/api/reservations', $this->booking($over), $this->spaHeaders());
    }

    private function slot(array $availability, string $area, string $time): array
    {
        foreach ($availability['areas'] as $a) {
            if ($a['slug'] === $area) {
                foreach ($a['slots'] as $s) {
                    if ($s['time'] === $time) {
                        return $s;
                    }
                }
            }
        }
        self::fail("No slot {$area} {$time}");
    }

    public function testAvailabilityRespectsNoticeAndPartySize(): void
    {
        [$res, $today] = $this->request('GET', '/api/reservations/availability?date=2026-10-20&party=2');
        self::assertSame(200, $res->getStatusCode());
        self::assertFalse($this->slot($today, 'main-hall', '12:30')['available'], 'Within 60 minutes');
        self::assertTrue($this->slot($today, 'main-hall', '13:00')['available']);

        [, $small] = $this->request('GET', '/api/reservations/availability?date=2026-10-24&party=2');
        $private = array_values(array_filter($small['areas'], static fn ($a) => $a['slug'] === 'private-dining'))[0];
        self::assertFalse($private['fitsParty'], 'Private dining is for 6+ guests');

        [$big] = $this->request('GET', '/api/reservations/availability?date=2026-10-24&party=20');
        self::assertSame(422, $big->getStatusCode(), 'Large groups go to events');
        [$past] = $this->request('GET', '/api/reservations/availability?date=2026-10-19&party=2');
        self::assertSame(422, $past->getStatusCode());
    }

    public function testBookingConfirmsAndEmailsWithManageLink(): void
    {
        [$res, $body] = $this->book();
        self::assertSame(201, $res->getStatusCode());
        $code = $body['reservation']['code'];
        self::assertMatchesRegularExpression('/^R-[A-Z0-9]{6}$/', $code);
        self::assertSame('confirmed', $body['reservation']['status']);
        $mail = end($this->mailer->sent);
        self::assertStringContainsString('Table confirmed', $mail['subject']);
        self::assertStringContainsString($code, $mail['text']);
        self::assertStringContainsString('t=' . $body['manageToken'], $mail['text']);

        [$show] = $this->request('GET', "/api/reservations/{$code}?t={$body['manageToken']}");
        self::assertSame(200, $show->getStatusCode());
        [$denied] = $this->request('GET', "/api/reservations/{$code}?t=nope");
        self::assertSame(404, $denied->getStatusCode());
    }

    public function testCapacityCannotBeExceeded(): void
    {
        // Terrace seats 24 per slot: three bookings of 8 fill it.
        for ($i = 0; $i < 3; $i++) {
            [$ok] = $this->book(['area' => 'terrace', 'party_size' => 8, 'email' => "guest{$i}@example.com"]);
            self::assertSame(201, $ok->getStatusCode());
        }
        [, $after] = $this->request('GET', '/api/reservations/availability?date=2026-10-24&party=2');
        self::assertFalse($this->slot($after, 'terrace', '19:30')['available']);
        self::assertSame(0, $this->slot($after, 'terrace', '19:30')['remaining']);

        [$full, $fullBody] = $this->book(['area' => 'terrace', 'party_size' => 2, 'email' => 'late@example.com']);
        self::assertSame(422, $full->getStatusCode());
        self::assertArrayHasKey('time', $fullBody['error']['fields']);
        self::assertTrue($this->slot($after, 'main-hall', '19:30')['available'], 'Other areas unaffected');
    }

    public function testCapacityOverrideCanCloseASlot(): void
    {
        $area = (int) $this->db->scalar("SELECT id FROM seating_areas WHERE slug = 'lounge'");
        $this->db->insert('capacity_overrides', ['service_date' => '2026-10-24', 'start_time' => null, 'seating_area_id' => $area, 'covers' => 0, 'reason' => 'Private event']);
        [, $a] = $this->request('GET', '/api/reservations/availability?date=2026-10-24&party=2');
        self::assertFalse($this->slot($a, 'lounge', '20:00')['available']);
    }

    public function testGuestCanCancelWithTokenAndCapacityReturns(): void
    {
        [, $b] = $this->book(['area' => 'terrace', 'party_size' => 8]);
        $code = $b['reservation']['code'];
        [$wrong] = $this->request('POST', "/api/reservations/{$code}/cancel", ['t' => 'nope'], $this->spaHeaders());
        self::assertSame(404, $wrong->getStatusCode());
        [$ok, $cancelled] = $this->request('POST', "/api/reservations/{$code}/cancel", ['t' => $b['manageToken']], $this->spaHeaders());
        self::assertSame(200, $ok->getStatusCode());
        self::assertSame('cancelled', $cancelled['reservation']['status']);
        self::assertStringContainsString('cancelled', end($this->mailer->sent)['subject']);
        [, $a] = $this->request('GET', '/api/reservations/availability?date=2026-10-24&party=2');
        self::assertSame(24, $this->slot($a, 'terrace', '19:30')['remaining']);
    }

    public function testSignedInGuestSeesTheirReservations(): void
    {
        [, $login] = $this->request('POST', '/api/auth/login', ['email' => 'guest@smallafrica.demo', 'password' => 'SmallAfrica@Guest2026'], $this->spaHeaders());
        $headers = ['X-CSRF-Token' => $login['csrfToken'], 'Origin' => 'http://localhost:5173'];
        $this->request('POST', '/api/reservations', $this->booking(['email' => 'guest@smallafrica.demo']), $headers);
        [, $mine] = $this->request('GET', '/api/account/reservations');
        self::assertCount(1, $mine['reservations']);
        self::assertSame('Main Hall', $mine['reservations'][0]['area']['name']);
    }

    public function testBookingsAreRateLimitedPerEmail(): void
    {
        $codes = [];
        for ($i = 0; $i < 6; $i++) {
            [$res] = $this->book(['time' => ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30'][$i], 'party_size' => 2]);
            $codes[] = $res->getStatusCode();
        }
        self::assertSame([201, 201, 201, 201, 201, 429], $codes);
    }
}
