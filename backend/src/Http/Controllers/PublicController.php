<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\HttpError;
use App\Http\Json;
use App\Repositories\MenuRepository;
use App\Support\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Read-only public content: menu, dish detail, site information. Safe to cache briefly. */
final class PublicController
{
    // private: responses can carry the session cookie, so shared caches must not store them.
    private const CACHE = 'private, max-age=60';

    public function __construct(private MenuRepository $menu, private Database $db)
    {
    }

    public function menu(Request $request, Response $response): Response
    {
        return Json::send($response, [
            'kitchens' => $this->menu->kitchens(),
            'categories' => $this->menu->categories(),
            'dishes' => $this->menu->dishes(),
        ])->withHeader('Cache-Control', self::CACHE);
    }

    /** @param array{slug: string} $args */
    public function dish(Request $request, Response $response, array $args): Response
    {
        $slug = $args['slug'];
        if (!preg_match('/^[a-z0-9-]{1,100}$/', $slug)) {
            throw HttpError::notFound('We couldn’t find that dish.');
        }
        $dish = $this->menu->dish($slug);
        if ($dish === null) {
            throw HttpError::notFound('We couldn’t find that dish.');
        }
        $dish['reviews'] = array_map(self::review(...), $this->db->all(
            "SELECT * FROM reviews WHERE dish_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 6",
            [$dish['id']],
        ));
        return Json::send($response, ['dish' => $dish])->withHeader('Cache-Control', self::CACHE);
    }

    /** Restaurant info, hours, zones, event packages, loyalty tiers and testimonials in one call. */
    public function site(Request $request, Response $response): Response
    {
        $settings = [];
        foreach ($this->db->all("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('restaurant', 'pricing', 'loyalty', 'reservations')") as $row) {
            $settings[$row['setting_key']] = json_decode($row['setting_value'], true);
        }
        $loyalty = $settings['loyalty'] ?? [];
        return Json::send($response, [
            'restaurant' => $settings['restaurant'] ?? [],
            'pricing' => [
                'pricesIncludeVat' => $settings['pricing']['prices_include_vat'] ?? true,
                'vatRateBp' => $settings['pricing']['vat_rate_bp'] ?? 750,
                'serviceChargeDineInBp' => $settings['pricing']['service_charge_dine_in_bp'] ?? 1000,
            ],
            'openingHours' => array_map(static fn ($h) => [
                'dayOfWeek' => (int) $h['day_of_week'],
                'opensAt' => $h['opens_at'] ? substr($h['opens_at'], 0, 5) : null,
                'closesAt' => $h['closes_at'] ? substr($h['closes_at'], 0, 5) : null,
                'isClosed' => (bool) $h['is_closed'],
            ], $this->db->all('SELECT * FROM opening_hours ORDER BY day_of_week')),
            'deliveryZones' => array_map(static fn ($z) => [
                'slug' => $z['slug'], 'name' => $z['name'], 'feeKobo' => (int) $z['fee_kobo'],
                'minOrderKobo' => (int) $z['min_order_kobo'], 'etaMinutes' => (int) $z['eta_minutes'],
            ], $this->db->all('SELECT * FROM delivery_zones WHERE is_active = 1 ORDER BY sort_order')),
            'seatingAreas' => array_map(static fn ($a) => [
                'slug' => $a['slug'], 'name' => $a['name'], 'description' => $a['description'],
                'minParty' => (int) $a['min_party'], 'maxParty' => (int) $a['max_party'],
            ], $this->db->all('SELECT * FROM seating_areas WHERE is_active = 1 ORDER BY sort_order')),
            'eventPackages' => array_map(static fn ($p) => [
                'id' => (int) $p['id'], 'slug' => $p['slug'], 'name' => $p['name'], 'summary' => $p['summary'],
                'pricePerGuestKobo' => (int) $p['price_per_guest_kobo'], 'minGuests' => (int) $p['min_guests'],
                'maxGuests' => (int) $p['max_guests'], 'features' => json_decode($p['features'], true),
            ], $this->db->all('SELECT * FROM event_packages ORDER BY sort_order')),
            'loyalty' => [
                'tiers' => $loyalty['tiers'] ?? [],
                'earnPointsPer1000Naira' => $loyalty['earn_points_per_1000_naira'] ?? 5,
                'interestRateBp' => $loyalty['interest_rate_bp'] ?? 200,
                'interestCapNaira' => $loyalty['interest_cap_naira'] ?? 5000,
                'interestMinBalanceNaira' => $loyalty['interest_min_balance_naira'] ?? 20000,
                'referralCreditNaira' => $loyalty['referral_credit_naira'] ?? 2000,
                'welcomeBonusPoints' => max(0, (int) ($loyalty['welcome_bonus_points'] ?? 200)), // 0 = switched off
            ],
            'testimonials' => array_map(self::review(...), $this->db->all(
                "SELECT r.*, d.name AS dish_name FROM reviews r LEFT JOIN dishes d ON d.id = r.dish_id
                 WHERE r.status = 'approved' AND r.rating >= 4 ORDER BY r.rating DESC, r.created_at DESC LIMIT 8",
            )),
        ])->withHeader('Cache-Control', self::CACHE);
    }

    /**
     * @param array<string, mixed> $r
     * @return array<string, mixed>
     */
    private static function review(array $r): array
    {
        return [
            'id' => (int) $r['id'],
            'author' => $r['author_name'],
            'rating' => (int) $r['rating'],
            'title' => $r['title'],
            'body' => $r['body'],
            'dish' => $r['dish_name'] ?? null,
            'reply' => $r['admin_reply'],
            'createdAt' => $r['created_at'],
        ];
    }
}
