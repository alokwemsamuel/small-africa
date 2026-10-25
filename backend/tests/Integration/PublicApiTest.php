<?php

declare(strict_types=1);

namespace Tests\Integration;

final class PublicApiTest extends IntegrationTestCase
{
    public function testMenuListsKitchensCategoriesAndDishesWithFlags(): void
    {
        [$res, $body] = $this->request('GET', '/api/menu');
        self::assertSame(200, $res->getStatusCode());
        self::assertSame('private, max-age=60', $res->getHeaderLine('Cache-Control'));
        self::assertSame(['nigerian', 'polish', 'continental'], array_column($body['kitchens'], 'slug'));
        self::assertCount(54, $body['dishes']);

        $bySlug = array_column($body['dishes'], null, 'slug');
        self::assertTrue($bySlug['kotlet-schabowy']['containsPork']);
        self::assertFalse($bySlug['pierogi-ruskie']['containsPork']);
        self::assertTrue($bySlug['house-red-wine']['isAlcoholic']);
        self::assertSame(1850000, $bySlug['smoky-party-jollof']['priceKobo']);
        self::assertNotEmpty($bySlug['smoky-party-jollof']['options']['portion']);
        self::assertArrayNotHasKey('deleted_at', $bySlug['smoky-party-jollof']);
    }

    public function testSoldOutTodayIsReportedAsUnavailable(): void
    {
        $this->db->run("UPDATE dishes SET sold_out_until = '2026-10-20' WHERE slug = 'bigos'");
        [, $body] = $this->request('GET', '/api/menu');
        $bigos = array_values(array_filter($body['dishes'], static fn ($d) => $d['slug'] === 'bigos'))[0];
        self::assertFalse($bigos['isAvailable']);

        $this->clock->freeze('2026-10-21 09:00:00');
        [, $body] = $this->request('GET', '/api/menu');
        $bigos = array_values(array_filter($body['dishes'], static fn ($d) => $d['slug'] === 'bigos'))[0];
        self::assertTrue($bigos['isAvailable'], 'Sold out "today" resets the next day');
    }

    public function testDishDetailIncludesRelatedReviewsAndTastingCourses(): void
    {
        [$res, $body] = $this->request('GET', '/api/menu/chefs-tasting-menu');
        self::assertSame(200, $res->getStatusCode());
        self::assertCount(7, $body['dish']['tastingCourses']);
        self::assertNotEmpty($body['dish']['related']);

        [, $jollof] = $this->request('GET', '/api/menu/smoky-party-jollof');
        self::assertSame('Proper party jollof', $jollof['dish']['reviews'][0]['title']);
        self::assertSame('nigerian', $jollof['dish']['related'][0]['kitchen']);
    }

    public function testUnknownOrMalformedDishIs404(): void
    {
        foreach (['/api/menu/no-such-dish', "/api/menu/' OR 1=1 --"] as $path) {
            [$res, $body] = $this->request('GET', str_replace(' ', '%20', $path));
            self::assertSame(404, $res->getStatusCode(), $path);
            self::assertSame('not_found', $body['error']['code']);
        }
    }

    public function testSiteInfoExposesOnlyPublicSettings(): void
    {
        [$res, $body] = $this->request('GET', '/api/site');
        self::assertSame(200, $res->getStatusCode());
        self::assertSame('Small Africa', $body['restaurant']['name']);
        self::assertCount(7, $body['openingHours']);
        self::assertCount(7, $body['deliveryZones']);
        self::assertCount(4, $body['loyalty']['tiers']);
        self::assertNotEmpty($body['testimonials']);
        self::assertArrayNotHasKey('topup_bonus_tiers', $body['loyalty'], 'Only the public loyalty summary is exposed');
    }

    public function testContactFormStoresMessageAndNotifiesStaff(): void
    {
        [$res] = $this->request('POST', '/api/contact', [
            'name' => 'Ada Eze', 'email' => 'ada@example.com', 'subject' => 'Allergy question',
            'message' => 'Is the egusi made with any peanuts?',
        ], $this->spaHeaders());
        self::assertSame(201, $res->getStatusCode());
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM contact_messages WHERE email = 'ada@example.com'"));
        self::assertStringContainsString('New contact message', end($this->mailer->sent)['subject']);
    }

    public function testContactHoneypotSilentlyDropsBots(): void
    {
        [$res] = $this->request('POST', '/api/contact', [
            'name' => 'Bot', 'email' => 'bot@example.com', 'subject' => 'Buy now', 'message' => 'Cheap followers here!!!',
            'website' => 'http://spam.example',
        ], $this->spaHeaders());
        self::assertSame(201, $res->getStatusCode());
        self::assertSame(0, (int) $this->db->scalar("SELECT COUNT(*) FROM contact_messages WHERE email = 'bot@example.com'"));
    }

    public function testNewsletterIsIdempotent(): void
    {
        for ($i = 0; $i < 2; $i++) {
            [$res] = $this->request('POST', '/api/newsletter', ['email' => 'Fan@Example.com'], $this->spaHeaders());
            self::assertSame(201, $res->getStatusCode());
        }
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM newsletter_subscribers WHERE email = 'fan@example.com'"));
    }

    public function testEventEnquiryValidatesDateAndPackage(): void
    {
        $base = ['name' => 'Ngozi E.', 'email' => 'ngozi@example.com', 'phone' => '08031234567', 'event_type' => 'birthday', 'guests' => 12];
        [$past, $pastBody] = $this->request('POST', '/api/events/enquiries', $base + ['event_date' => '2026-10-01'], $this->spaHeaders());
        self::assertSame(422, $past->getStatusCode());
        self::assertArrayHasKey('event_date', $pastBody['error']['fields']);

        [$bad] = $this->request('POST', '/api/events/enquiries', $base + ['event_date' => '2026-12-12', 'package' => 'nope'], $this->spaHeaders());
        self::assertSame(422, $bad->getStatusCode());

        [$ok, $okBody] = $this->request('POST', '/api/events/enquiries', $base + ['event_date' => '2026-12-12', 'package' => 'private-dining', 'budget_naira' => 1500000], $this->spaHeaders());
        self::assertSame(201, $ok->getStatusCode());
        $row = $this->db->one('SELECT * FROM event_enquiries WHERE id = ?', [$okBody['id']]);
        self::assertSame(150000000, (int) $row['budget_kobo']);
        self::assertSame('+2348031234567', $row['phone']);
    }

    public function testPublicFormsAreRateLimited(): void
    {
        $codes = [];
        for ($i = 0; $i < 7; $i++) {
            [$res] = $this->request('POST', '/api/contact', [
                'name' => 'A', 'email' => "a{$i}@example.com", 'subject' => 'Hi', 'message' => 'Hello there, a question.',
            ], $this->spaHeaders());
            $codes[] = $res->getStatusCode();
        }
        self::assertSame([201, 201, 201, 201, 201, 429, 429], $codes);
    }
}
