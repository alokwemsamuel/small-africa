<?php

declare(strict_types=1);

namespace App\Seeds;

use App\Security\PasswordPolicy;
use App\Support\Database;

/**
 * Reference data every environment needs: demo/staff accounts, kitchens, menu, settings,
 * delivery zones, opening hours, seating, coupons, event packages and the rewards menu.
 * Presentation data (past orders, reviews, ledgers) is seeded separately in Phase 7.
 */
final class ReferenceSeeder
{
    /** Demo accounts from the project brief. Shown on the demo login page only in demo builds. */
    public const DEMO_ACCOUNTS = [
        ['super_admin', null, 'Adaeze', 'Okafor', 'admin@smallafrica.demo', 'SmallAfrica@Admin2026', '+2348030000001'],
        ['manager', null, 'Tomasz', 'Kowalski', 'manager@smallafrica.demo', 'SmallAfrica@Manager2026', '+2348030000002'],
        ['customer', null, 'Chiamaka', 'Bello', 'guest@smallafrica.demo', 'SmallAfrica@Guest2026', '+2348030000003'],
        ['staff', 'kitchen', 'Ibrahim', 'Musa', 'kitchen@smallafrica.demo', 'SmallAfrica@Kitchen2026', '+2348030000004'],
        ['staff', 'front_desk', 'Zofia', 'Nowak', 'frontdesk@smallafrica.demo', 'SmallAfrica@Desk2026', '+2348030000005'],
    ];

    /** @var array<string, int> */
    private array $kitchenIds = [];
    /** @var array<string, int> */
    private array $categoryIds = [];

    public function __construct(private Database $db, private string $seedDir)
    {
    }

    public function run(): void
    {
        $this->db->transaction(function (): void {
            $this->kitchens();
            $this->categories();
            $this->users();
            $this->menu();
            $this->settings();
            $this->openingHours();
            $this->deliveryZones();
            $this->seating();
            $this->coupons();
            $this->eventPackages();
            $this->rewards();
        });
    }

    private function kitchens(): void
    {
        $rows = [
            ['nigerian', 'Nigerian Kitchen', 'Firewood, palm oil and pepper', 'Party jollof, rich soups and open-flame grills from across Nigeria: cooked the way our mothers taught us, plated the way Lagos deserves.', '#B4492F'],
            ['polish', 'Polish Kitchen', 'Rye, dill and slow Sunday cooking', 'Hand-pinched pierogi, sour rye soups and slow-braised stews from Kraków to the Tatra mountains: Polish comfort food with fine-dining care.', '#A3243B'],
            ['continental', 'Continental Kitchen', 'Classic technique, Lagos produce', 'Wellingtons, aged steaks and French classics, cooked with precision and finished with a West African wink.', '#2E4A3B'],
        ];
        foreach ($rows as $i => [$slug, $name, $tagline, $desc, $accent]) {
            $this->kitchenIds[$slug] = $this->db->insert('kitchens', [
                'slug' => $slug, 'name' => $name, 'tagline' => $tagline, 'description' => $desc, 'accent_color' => $accent, 'sort_order' => $i,
            ]);
        }
    }

    private function categories(): void
    {
        $rows = ['starters' => 'Starters', 'soups' => 'Soups', 'mains' => 'Mains', 'grills' => 'Grills', 'sides' => 'Sides',
            'desserts' => 'Desserts', 'drinks' => 'Drinks', 'tasting' => 'Chef’s Tasting'];
        $i = 0;
        foreach ($rows as $slug => $name) {
            $this->categoryIds[$slug] = $this->db->insert('categories', ['slug' => $slug, 'name' => $name, 'sort_order' => $i++]);
        }
    }

    private function users(): void
    {
        foreach (self::DEMO_ACCOUNTS as [$role, $position, $first, $last, $email, $password, $phone]) {
            $id = $this->db->insert('users', [
                'role' => $role,
                'staff_position' => $position,
                'first_name' => $first,
                'last_name' => $last,
                'email' => $email,
                'phone' => $phone,
                'password_hash' => PasswordPolicy::hash($password),
                'email_verified_at' => date('Y-m-d H:i:s'),
                'referral_code' => $email === 'guest@smallafrica.demo' ? 'GUEST2026' : null,
                'favourite_kitchen_id' => $email === 'guest@smallafrica.demo' ? $this->kitchenIds['nigerian'] : null,
                'birthday' => $email === 'guest@smallafrica.demo' ? '1992-07-14' : null,
                'marketing_opt_in' => $role === 'customer' ? 1 : 0,
            ]);
            if ($role === 'customer') {
                $this->db->insert('loyalty_accounts', ['user_id' => $id]);
            }
        }
    }

    private function menu(): void
    {
        $menu = require $this->seedDir . '/data/menu.php';
        foreach ($menu as $i => $d) {
            $dishId = $this->db->insert('dishes', [
                'kitchen_id' => $d['kitchen'] ? $this->kitchenIds[$d['kitchen']] : null,
                'category_id' => $this->categoryIds[$d['category']],
                'slug' => $d['slug'],
                'name' => $d['name'],
                'short_description' => $d['short'],
                'description' => $d['description'],
                'ingredients' => $d['ingredients'] ?? null,
                'allergens' => $d['allergens'] ?? null,
                'price_kobo' => $d['price'] * 100,
                'spice_level' => $d['spice'] ?? 0,
                'is_vegetarian' => (int) ($d['veg'] ?? false),
                'is_gluten_free' => (int) ($d['gf'] ?? false),
                'contains_nuts' => (int) ($d['nuts'] ?? false),
                'contains_pork' => (int) ($d['pork'] ?? false),
                'is_alcoholic' => (int) ($d['alcohol'] ?? false),
                'is_featured' => (int) ($d['featured'] ?? false),
                'popularity' => $d['popularity'] ?? 0,
                'image_alt' => $d['name'],
                'sort_order' => $i,
            ]);
            foreach (['portion', 'addons'] as $group) {
                foreach ($d[$group] ?? [] as $j => $opt) {
                    $this->db->insert('dish_options', [
                        'dish_id' => $dishId,
                        'option_group' => $group === 'portion' ? 'portion' : 'addon',
                        'name' => $opt['name'],
                        'price_delta_kobo' => $opt['delta'] * 100,
                        'is_default' => (int) $opt['default'],
                        'sort_order' => $j,
                    ]);
                }
            }
            foreach ($d['courses'] ?? [] as $n => [$kitchen, $name, $desc]) {
                $this->db->insert('tasting_courses', [
                    'dish_id' => $dishId, 'course_no' => $n + 1, 'kitchen_id' => $this->kitchenIds[$kitchen], 'name' => $name, 'description' => $desc,
                ]);
            }
        }
    }

    private function settings(): void
    {
        $settings = [
            'restaurant' => [
                'name' => 'Small Africa',
                'tagline' => 'Three kitchens. One table.',
                // Placeholder contact details: replace before launch (Admin → Settings).
                'address' => 'Victoria Island, Lagos, Nigeria',
                'phone' => '+234 700 000 0000',
                'whatsapp' => '+2347000000000',
                'email' => 'hello@smallafrica.ng',
                'instagram' => 'https://instagram.com/',
                'tiktok' => 'https://tiktok.com/',
                'map_embed_query' => 'Victoria Island, Lagos',
            ],
            'pricing' => [
                'prices_include_vat' => true,
                'vat_rate_bp' => 750,                // 7.5% Nigerian VAT, included in menu prices
                'service_charge_dine_in_bp' => 1000, // 10% on dine-in bills
                'service_charge_online_bp' => 0,     // none on delivery/pickup
                'packaging_fee_kobo' => 50000,       // ₦500 per delivery/pickup order
            ],
            'ordering' => [
                'accepting_orders' => true,
                'min_lead_minutes' => 45,
                'max_schedule_days' => 7,
                'max_items_per_order' => 40,
            ],
            'reservations' => [
                'min_advance_minutes' => 60,
                'max_days_ahead' => 60,
                'max_party_online' => 12,
                'dining_duration_minutes' => 120,
            ],
            'loyalty' => [
                'earn_points_per_1000_naira' => 5,
                'double_points_weekdays' => [2, 3],      // Tuesday, Wednesday
                'featured_dish_points_multiplier' => 2,
                'redeem_points_per_1000_naira' => 100,   // 100 points = ₦1,000
                'min_points_to_redeem' => 100,
                'topup_presets_naira' => [10000, 25000, 50000, 100000],
                'topup_min_naira' => 5000,
                'topup_max_naira' => 1000000,
                'topup_bonus_tiers' => [['min_naira' => 100000, 'bonus_bp' => 1000], ['min_naira' => 50000, 'bonus_bp' => 500]],
                'interest_rate_bp' => 200,               // 2% per month
                'interest_cap_naira' => 5000,
                'interest_min_balance_naira' => 20000,
                'tiers' => [
                    ['key' => 'bronze', 'name' => 'Bronze', 'min_spend_naira' => 0, 'multiplier' => 1.0, 'perks' => ['1× points', 'Birthday dessert']],
                    ['key' => 'silver', 'name' => 'Silver', 'min_spend_naira' => 150000, 'multiplier' => 1.25, 'perks' => ['1.25× points', 'Priority reservations']],
                    ['key' => 'gold', 'name' => 'Gold', 'min_spend_naira' => 500000, 'multiplier' => 1.5, 'perks' => ['1.5× points', 'Free delivery', 'Complimentary welcome drink']],
                    ['key' => 'black_diamond', 'name' => 'Black Diamond', 'min_spend_naira' => 1500000, 'multiplier' => 2.0, 'perks' => ['2× points', 'Private-dining priority', 'Chef’s table invitations', 'Exclusive tasting events']],
                ],
                'stamp_rewards' => [['stamp' => 5, 'reward' => 'Free dessert'], ['stamp' => 10, 'reward' => 'Free main course']],
                'streak_visits_per_month' => 3,
                'streak_bonus_points' => 200,
                'birthday_points_multiplier' => 2,
                'referral_credit_naira' => 2000,
                'referral_max_per_month' => 10,
                'points_expiry_months' => 12,
                'points_expiry_warning_days' => 30,
                'winback_after_days' => 30,
                'winback_offer_percent' => 15,
            ],
        ];
        foreach ($settings as $key => $value) {
            $this->db->insert('settings', ['setting_key' => $key, 'setting_value' => json_encode($value, JSON_UNESCAPED_UNICODE)]);
        }
    }

    private function openingHours(): void
    {
        // 0 = Sunday
        $hours = [0 => ['13:00', '22:00'], 1 => ['12:00', '23:00'], 2 => ['12:00', '23:00'], 3 => ['12:00', '23:00'],
            4 => ['12:00', '23:00'], 5 => ['12:00', '23:59'], 6 => ['12:00', '23:59']];
        foreach ($hours as $day => [$open, $close]) {
            $this->db->insert('opening_hours', ['day_of_week' => $day, 'opens_at' => $open, 'closes_at' => $close, 'is_closed' => 0]);
        }
    }

    private function deliveryZones(): void
    {
        $zones = [['victoria-island', 'Victoria Island', 2000, 35], ['ikoyi', 'Ikoyi', 2000, 35], ['lekki', 'Lekki Phase 1', 2500, 45],
            ['yaba', 'Yaba', 3000, 55], ['surulere', 'Surulere', 3500, 60], ['ikeja', 'Ikeja', 4000, 75], ['ajah', 'Ajah', 4500, 75]];
        foreach ($zones as $i => [$slug, $name, $fee, $eta]) {
            $this->db->insert('delivery_zones', [
                'slug' => $slug, 'name' => $name, 'fee_kobo' => $fee * 100, 'min_order_kobo' => 1500000, 'eta_minutes' => $eta, 'sort_order' => $i,
            ]);
        }
    }

    private function seating(): void
    {
        $areas = [
            ['main-hall', 'Main Hall', 'Our grand dining room under the gold-leaf ceiling.', 60, 1, 10],
            ['lounge', 'Lounge', 'Low sofas, live music on Fridays and the full bar menu.', 30, 1, 8],
            ['private-dining', 'Private Dining', 'A closed room for celebrations and business dinners.', 16, 6, 16],
            ['terrace', 'Terrace', 'Open-air seating with evening breeze and city lights.', 24, 1, 8],
        ];
        foreach ($areas as $i => [$slug, $name, $desc, $covers, $min, $max]) {
            $this->db->insert('seating_areas', [
                'slug' => $slug, 'name' => $name, 'description' => $desc, 'covers_per_slot' => $covers, 'min_party' => $min, 'max_party' => $max, 'sort_order' => $i,
            ]);
        }
        foreach (['12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'] as $t) {
            $this->db->insert('reservation_slots', ['start_time' => $t]);
        }
    }

    private function coupons(): void
    {
        $this->db->insert('coupons', [
            'code' => 'WELCOME10', 'description' => '10% off your first online order (up to ₦5,000).',
            'discount_type' => 'percent', 'discount_value' => 10, 'max_discount_kobo' => 500000, 'first_order_only' => 1, 'per_user_limit' => 1,
        ]);
        $this->db->insert('coupons', [
            'code' => 'JOLLOFFRIDAY', 'description' => '20% off Nigerian kitchen dishes every Friday (up to ₦4,000).',
            'discount_type' => 'percent', 'discount_value' => 20, 'max_discount_kobo' => 400000, 'kitchen_id' => $this->kitchenIds['nigerian'], 'valid_weekdays' => '5',
        ]);
        $this->db->insert('coupons', [
            'code' => 'PIEROGI15', 'description' => '15% off Polish kitchen dishes.',
            'discount_type' => 'percent', 'discount_value' => 15, 'kitchen_id' => $this->kitchenIds['polish'], 'min_order_kobo' => 1000000,
        ]);
    }

    private function eventPackages(): void
    {
        $packages = [
            ['private-dining', 'Private Dining', 'An intimate evening in our private room with a set three-kitchen menu.', 85000, 6, 16,
                ['Private room for up to 16', 'Four-course set menu across all three kitchens', 'Welcome cocktail or mocktail', 'Dedicated host', 'Personalised printed menus']],
            ['corporate', 'Corporate Lunch & Dinner', 'Client entertaining, team celebrations and working lunches.', 45000, 10, 60,
                ['Three-course menu or sharing platters', 'AV screen and microphone', 'Invoicing for companies', 'Flexible timings']],
            ['celebration', 'Weddings & Celebrations', 'Exclusive hire for receptions, engagements and milestone birthdays.', 120000, 50, 200,
                ['Exclusive venue hire', 'Custom menu with our chefs', 'Cake service and champagne toast', 'Décor partner introductions', 'Live band or DJ coordination']],
        ];
        foreach ($packages as $i => [$slug, $name, $summary, $price, $min, $max, $features]) {
            $this->db->insert('event_packages', [
                'slug' => $slug, 'name' => $name, 'summary' => $summary, 'price_per_guest_kobo' => $price * 100,
                'min_guests' => $min, 'max_guests' => $max, 'features' => json_encode($features, JSON_UNESCAPED_UNICODE), 'sort_order' => $i,
            ]);
        }
    }

    private function rewards(): void
    {
        $dish = fn (string $slug): ?int => ($id = $this->db->scalar('SELECT id FROM dishes WHERE slug = ?', [$slug])) ? (int) $id : null;
        $rewards = [
            ['credit-1000', '₦1,000 dining credit', 'Convert 100 points into ₦1,000 of dining credit.', 100, 'credit', 100000, null],
            ['credit-5000', '₦5,000 dining credit', 'Convert 500 points into ₦5,000 of dining credit.', 500, 'credit', 500000, null],
            ['free-chapman', 'Free Chapman', 'Our signature Lagos cooler, on us.', 350, 'item', null, $dish('chapman')],
            ['free-paczki', 'Free Pączki', 'Three rose-jam Polish doughnuts.', 500, 'item', null, $dish('paczki')],
            ['free-dessert', 'Free dessert of your choice', 'Any dessert from any of our three kitchens.', 700, 'item', null, null],
            ['tasting-upgrade', 'Chef’s Tasting upgrade', 'Upgrade one guest to the seven-course Chef’s Tasting Menu.', 4000, 'upgrade', null, $dish('chefs-tasting-menu')],
        ];
        foreach ($rewards as $i => [$slug, $name, $desc, $cost, $type, $credit, $dishId]) {
            $this->db->insert('rewards_catalog', [
                'slug' => $slug, 'name' => $name, 'description' => $desc, 'points_cost' => $cost, 'reward_type' => $type,
                'credit_kobo' => $credit, 'dish_id' => $dishId, 'sort_order' => $i,
            ]);
        }
    }
}
