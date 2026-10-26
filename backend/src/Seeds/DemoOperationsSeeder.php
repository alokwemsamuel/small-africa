<?php

declare(strict_types=1);

namespace App\Seeds;

use App\Security\Crypto;
use App\Support\Clock;
use App\Support\Database;

/**
 * DEMO / PRESENTATION DATA ONLY: a busy, realistic last 30 days so the admin dashboard looks
 * alive. Guest-checkout orders every day (more on Fridays and weekends, lunch and dinner peaks,
 * all three kitchens, Jollof and Pierogi the favourites), today's orders still in the kitchen,
 * reservations around today, reviews, event enquiries and contact messages.
 *
 * Orders here are guest checkouts (no account), so the members' Interest Account ledgers
 * seeded by DemoLoyaltySeeder stay exactly reconciled. The browser demo (frontend/src/demo)
 * generates the same kind of data at run time with the same rules.
 */
final class DemoOperationsSeeder
{
    private const FIRST = ['Adaeze', 'Chinedu', 'Folake', 'Yemi', 'Ngozi', 'Tobi', 'Kelechi', 'Amaka', 'Seyi', 'Bola', 'Ifeoma', 'Uche', 'Damilola', 'Obinna', 'Zainab', 'Musa', 'Aisha', 'Kunle', 'Temi', 'Efe', 'Agnieszka', 'Paweł', 'Magda', 'Krzysztof', 'Ola', 'Tomek', 'Kasia', 'Michał', 'Sarah', 'James', 'Fatima', 'Ibrahim'];
    private const LAST = ['Okafor', 'Adebayo', 'Eze', 'Balogun', 'Nwachukwu', 'Okoro', 'Adeyemi', 'Lawal', 'Ibrahim', 'Okonkwo', 'Ogunleye', 'Bello', 'Danjuma', 'Afolabi', 'Nowak', 'Kowalski', 'Wójcik', 'Lewandowski', 'Kamińska', 'Mensah', 'Johnson', 'Williams'];
    /** Kitchen mix for online orders. */
    private const KITCHEN_WEIGHT = ['nigerian' => 45, 'polish' => 30, 'continental' => 25];
    /** House favourites ordered far more often than the rest. */
    private const FAVOURITES = ['smoky-party-jollof' => 14, 'pierogi-ruskie' => 11, 'beef-suya-platter' => 5, 'egusi-pounded-yam' => 5, 'pierogi-z-miesem' => 4, 'beef-wellington' => 3, 'golabki' => 3, 'grilled-salmon' => 3];
    /** About one order in five is built around a signature dish, whatever the kitchen mix that week. */
    private const SIGNATURE_PERCENT = 20;
    private const SIGNATURES = ['smoky-party-jollof' => 55, 'pierogi-ruskie' => 45];

    private \DateTimeImmutable $now;
    /** @var array<string, list<array<string, mixed>>> */
    private array $byKitchen = [];
    /** @var list<array<string, mixed>> */
    private array $drinks = [];
    /** @var list<array<string, mixed>> */
    private array $zones = [];
    /** @var array<string, int> */
    private array $coupons = [];

    public function __construct(private Database $db)
    {
    }

    public function run(): void
    {
        mt_srand(4242);
        $this->now = new \DateTimeImmutable('now', Clock::zone());
        foreach ($this->db->all(
            "SELECT d.*, k.slug AS kitchen, c.slug AS category FROM dishes d JOIN categories c ON c.id = d.category_id LEFT JOIN kitchens k ON k.id = d.kitchen_id
             WHERE d.deleted_at IS NULL AND c.slug <> 'tasting' AND d.is_alcoholic = 0",
        ) as $d) {
            if ($d['category'] === 'drinks') {
                $this->drinks[] = $d;
            } elseif ($d['kitchen']) {
                $this->byKitchen[$d['kitchen']][] = $d;
            }
        }
        $this->zones = $this->db->all('SELECT * FROM delivery_zones WHERE is_active = 1');
        foreach ($this->db->all('SELECT id, code FROM coupons') as $c) {
            $this->coupons[$c['code']] = (int) $c['id'];
        }

        $this->db->transaction(function (): void {
            $this->orders();
            $this->reservations();
            $this->reviews();
            $this->enquiries();
            $this->messages();
        });
    }

    /* ------------------------------------------------------------------ orders */

    private function orders(): void
    {
        for ($ago = 29; $ago >= 0; $ago--) {
            $day = $this->now->setTime(0, 0)->modify("-{$ago} days");
            $dow = (int) $day->format('w');
            [$lo, $hi] = match (true) {
                $dow === 5 => [11, 14],          // Friday
                $dow === 6 || $dow === 0 => [9, 12], // weekend
                default => [5, 8],
            };
            $count = mt_rand($lo, $hi);
            for ($i = 0; $i < $count; $i++) {
                $at = $this->orderTime($day);
                if ($at > $this->now->modify('-5 minutes')) {
                    continue; // not in the future
                }
                $this->order($at, $dow);
            }
        }
        // Pre-orders placed earlier today for later today, so the kitchen's live feed is never
        // empty during a presentation, whatever the time of day.
        $hour = (int) $this->now->format('G');
        if ($hour >= 7 && $hour < 21) {
            for ($i = 0; $i < 3; $i++) {
                $placed = $this->now->modify('-' . mt_rand(8, 110) . ' minutes');
                $earliest = max($this->now->modify('+50 minutes'), $this->now->setTime(12, 15));
                $slot = $earliest->modify('+' . ($i * 30 + mt_rand(0, 2) * 15) . ' minutes');
                $slot = $slot->setTime((int) $slot->format('G'), intdiv((int) $slot->format('i'), 15) * 15);
                $this->order($placed, (int) $this->now->format('w'), $slot);
            }
        }
    }

    /** Lunch (12:00–14:30) and dinner (18:00–21:45) peaks, a few in the afternoon. */
    private function orderTime(\DateTimeImmutable $day): \DateTimeImmutable
    {
        $r = mt_rand(1, 100);
        $minutes = $r <= 35 ? mt_rand(12 * 60, 14 * 60 + 30) : ($r <= 90 ? mt_rand(18 * 60, 21 * 60 + 45) : mt_rand(15 * 60, 17 * 60 + 45));
        return $day->modify("+{$minutes} minutes");
    }

    private function order(\DateTimeImmutable $at, int $dow, ?\DateTimeImmutable $scheduledFor = null): void
    {
        $lines = [];
        $signatureSlug = mt_rand(1, 100) <= self::SIGNATURE_PERCENT ? $this->weighted(self::SIGNATURES) : null;
        $signature = null;
        foreach ($signatureSlug ? array_merge(...array_values($this->byKitchen)) : [] as $d) {
            $signature = $d['slug'] === $signatureSlug ? $d : $signature;
        }
        $kitchen = $signature['kitchen'] ?? $this->weighted(self::KITCHEN_WEIGHT);
        $mains = mt_rand(1, 100) <= 70 ? mt_rand(1, 2) : mt_rand(2, 3);
        for ($i = 0; $i < $mains; $i++) {
            // Most orders stay in one kitchen; some mix kitchens, as the menu invites.
            $k = $i === 0 || mt_rand(1, 100) <= 60 ? $kitchen : $this->weighted(self::KITCHEN_WEIGHT);
            $dish = $i === 0 && $signature ? $signature : $this->dish($k);
            $lines[$dish['id']] = ['dish' => $dish, 'qty' => ($lines[$dish['id']]['qty'] ?? 0) + (mt_rand(1, 100) <= 25 ? 2 : 1)];
        }
        if ($this->drinks && mt_rand(1, 100) <= 45) {
            $drink = $this->drinks[mt_rand(0, count($this->drinks) - 1)];
            $lines[$drink['id']] = ['dish' => $drink, 'qty' => mt_rand(1, 2)];
        }
        $subtotal = 0;
        foreach ($lines as &$l) {
            $l['total'] = (int) $l['dish']['price_kobo'] * $l['qty'];
            $subtotal += $l['total'];
        }
        unset($l);

        // Coupons: Jollof Friday on Fridays (Nigerian dishes), a few first-order welcomes.
        $coupon = null;
        $discount = 0;
        if ($dow === 5 && $kitchen === 'nigerian' && mt_rand(1, 100) <= 40 && isset($this->coupons['JOLLOFFRIDAY'])) {
            $nigerian = array_sum(array_map(static fn ($l) => $l['dish']['kitchen'] === 'nigerian' ? $l['total'] : 0, $lines));
            $discount = min(400000, intdiv($nigerian * 20, 100));
            $coupon = 'JOLLOFFRIDAY';
        } elseif (mt_rand(1, 100) <= 8 && isset($this->coupons['WELCOME10'])) {
            $discount = min(500000, intdiv($subtotal * 10, 100));
            $coupon = 'WELCOME10';
        }

        $delivery = mt_rand(1, 100) <= 65;
        // Most deliveries go to the island (VI, Ikoyi, Lekki), fewer to the mainland.
        $zoneWeights = array_map(static fn ($i) => [5, 4, 4, 2, 1, 1, 1][$i] ?? 1, array_keys($this->zones));
        $zone = $delivery ? $this->zones[$this->weighted($zoneWeights)] : null;
        $fees = 50000 + ($zone ? (int) $zone['fee_kobo'] : 0);
        if ($zone && $subtotal < (int) $zone['min_order_kobo']) {
            $delivery = false; // small orders are collected
            $zone = null;
            $fees = 50000;
        }
        $total = $subtotal - $discount + $fees;
        [$status, $minutes] = $scheduledFor ? ['received', 0] : $this->status($at, $delivery);

        $name = self::FIRST[mt_rand(0, count(self::FIRST) - 1)] . ' ' . self::LAST[mt_rand(0, count(self::LAST) - 1)];
        do {
            $ref = Crypto::code(6, 'SA-');
        } while ($this->db->scalar('SELECT 1 FROM orders WHERE reference = ?', [$ref]));
        $orderId = $this->db->insert('orders', [
            'reference' => $ref,
            'customer_name' => $name,
            'customer_email' => strtolower(preg_replace('/[^A-Za-z]/', '', iconv('UTF-8', 'ASCII//TRANSLIT', str_replace(' ', '.', $name)) ?: 'guest') ?? 'guest') . mt_rand(10, 99) . '@example.com',
            'customer_phone' => '+23480' . mt_rand(30000000, 99999999),
            'fulfilment' => $delivery ? 'delivery' : 'pickup',
            'delivery_zone_id' => $zone['id'] ?? null,
            'address_snapshot' => $zone ? json_encode(['line1' => mt_rand(2, 48) . ' ' . ['Adeola Odeku St', 'Bourdillon Rd', 'Admiralty Way', 'Awolowo Rd', 'Ozumba Mbadiwe Ave'][mt_rand(0, 4)], 'area' => $zone['name']]) : null,
            'status' => $status,
            'payment_status' => 'paid',
            'refund_flag' => $status === 'cancelled' ? 1 : 0,
            'subtotal_kobo' => $subtotal,
            'discount_kobo' => $discount,
            'delivery_fee_kobo' => $fees,
            'vat_included_kobo' => intdiv(($subtotal - $discount) * 750, 10750),
            'total_kobo' => $total,
            'coupon_id' => $coupon ? $this->coupons[$coupon] : null,
            'cancelled_reason' => $status === 'cancelled' ? ['Guest called to cancel', 'Rider could not reach the address', 'Kitchen ran out of an item'][mt_rand(0, 2)] : null,
            'scheduled_for' => $scheduledFor ? $this->sql($scheduledFor) : null,
            'placed_at' => $this->sql($at),
            'status_updated_at' => $this->sql($at->modify("+{$minutes} minutes")),
            'created_at' => $this->sql($at->modify('-1 minute')),
        ]);
        foreach ($lines as $l) {
            $this->db->insert('order_items', [
                'order_id' => $orderId, 'dish_id' => $l['dish']['id'], 'dish_name' => $l['dish']['name'], 'kitchen_id' => $l['dish']['kitchen_id'],
                'unit_price_kobo' => $l['dish']['price_kobo'], 'quantity' => $l['qty'], 'line_total_kobo' => $l['total'],
                'options' => json_encode(['portion' => null, 'addons' => [], 'containsPork' => (bool) $l['dish']['contains_pork']]),
            ]);
        }
        $steps = $status === 'cancelled'
            ? ['pending_payment' => -1, 'received' => 0, 'cancelled' => $minutes]
            : array_filter(
                ['pending_payment' => -1, 'received' => 0, 'preparing' => 4, 'ready' => 28, ($delivery ? 'out_for_delivery' : 'completed') => 34, 'delivered' => $minutes],
                fn ($m) => $m <= $minutes,
            );
        if (!$delivery) {
            unset($steps['delivered']);
        }
        foreach ($steps as $s => $m) {
            $this->db->insert('order_status_history', ['order_id' => $orderId, 'status' => $s, 'created_at' => $this->sql($at->modify("{$m} minutes"))]);
        }
        $this->db->insert('payments', [
            'purpose' => 'order', 'payable_id' => $orderId, 'provider' => 'simulated', 'reference' => $ref,
            'amount_kobo' => $total, 'status' => 'success', 'verified_at' => $this->sql($at), 'created_at' => $this->sql($at),
        ]);
        if ($coupon) {
            $this->db->insert('coupon_redemptions', ['coupon_id' => $this->coupons[$coupon], 'order_id' => $orderId, 'discount_kobo' => $discount, 'created_at' => $this->sql($at)]);
            $this->db->run('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?', [$this->coupons[$coupon]]);
        }
        foreach ($lines as $l) {
            $this->db->run('UPDATE dishes SET popularity = popularity + ? WHERE id = ?', [$l['qty'], $l['dish']['id']]);
        }
    }

    /**
     * Older orders are finished; the last ~90 minutes are still moving through the kitchen.
     *
     * @return array{0: string, 1: int} status and minutes since the order to its last change
     */
    private function status(\DateTimeImmutable $at, bool $delivery): array
    {
        $age = (int) (($this->now->getTimestamp() - $at->getTimestamp()) / 60);
        if ($age > 100) {
            return mt_rand(1, 100) <= 4 ? ['cancelled', mt_rand(3, 15)] : [$delivery ? 'delivered' : 'completed', $delivery ? mt_rand(55, 85) : mt_rand(30, 45)];
        }
        return match (true) {
            $age < 5 => ['received', 0],
            $age < 28 => ['preparing', 4],
            $age < 34 => ['ready', 28],
            $delivery && $age < 80 => ['out_for_delivery', 34],
            default => [$delivery ? 'delivered' : 'completed', min($age, $delivery ? 80 : 40)],
        };
    }

    /** @return array<string, mixed> */
    private function dish(string $kitchen): array
    {
        $pool = $this->byKitchen[$kitchen];
        $weights = [];
        foreach ($pool as $i => $d) {
            $weights[$i] = (self::FAVOURITES[$d['slug']] ?? 1) * ($d['category'] === 'sides' ? 1 : 2);
        }
        return $pool[$this->weighted($weights)];
    }

    /**
     * @param array<array-key, int> $weights
     * @return array-key
     */
    private function weighted(array $weights): int|string
    {
        $r = mt_rand(1, array_sum($weights));
        foreach ($weights as $k => $w) {
            $r -= $w;
            if ($r <= 0) {
                return $k;
            }
        }
        return array_key_first($weights);
    }

    /* ------------------------------------------------------------ reservations */

    private function reservations(): void
    {
        $areas = $this->db->all('SELECT * FROM seating_areas WHERE is_active = 1');
        $times = array_column($this->db->all('SELECT start_time FROM reservation_slots WHERE is_active = 1 ORDER BY start_time'), 'start_time');
        $occasions = ['none', 'none', 'none', 'birthday', 'anniversary', 'business', 'date_night', 'celebration'];
        $notes = [null, null, null, 'Window table if possible', 'Celebrating a promotion', 'One guest is vegetarian', 'High chair needed', 'Nut allergy at the table'];
        for ($i = 0; $i < 34; $i++) {
            // The first few are today, so the front desk always has guests expected.
            $offset = $i < 5 ? 0 : mt_rand(-16, 16);
            $day = $this->now->setTime(0, 0)->modify(($offset >= 0 ? '+' : '') . "{$offset} days");
            $dinner = array_values(array_filter($times, static fn ($t) => $t >= '18:00:00'));
            $time = mt_rand(1, 100) <= 70 ? $dinner[mt_rand(0, count($dinner) - 1)] : $times[mt_rand(0, count($times) - 1)];
            $area = $areas[mt_rand(0, count($areas) - 1)];
            $party = max((int) $area['min_party'], min((int) $area['max_party'], mt_rand(2, 6)));
            $start = new \DateTimeImmutable($day->format('Y-m-d') . ' ' . $time, Clock::zone());
            $status = $start < $this->now
                ? ($start > $this->now->modify('-2 hours') ? 'seated' : (mt_rand(1, 100) <= 85 ? 'completed' : (mt_rand(0, 1) ? 'no_show' : 'cancelled')))
                : (mt_rand(1, 100) <= 85 ? 'confirmed' : (mt_rand(1, 100) <= 60 ? 'pending' : 'cancelled'));
            $name = self::FIRST[mt_rand(0, count(self::FIRST) - 1)] . ' ' . self::LAST[mt_rand(0, count(self::LAST) - 1)];
            do {
                $code = Crypto::code(6, 'R-');
            } while ($this->db->scalar('SELECT 1 FROM reservations WHERE code = ?', [$code]));
            $this->db->insert('reservations', [
                'code' => $code,
                'guest_name' => $name,
                'guest_email' => 'guest' . mt_rand(100, 999) . '@example.com',
                'guest_phone' => '+23481' . mt_rand(30000000, 99999999),
                'party_size' => $party,
                'service_date' => $day->format('Y-m-d'),
                'start_time' => $time,
                'seating_area_id' => $area['id'],
                'occasion' => $occasions[mt_rand(0, count($occasions) - 1)],
                'notes' => $notes[mt_rand(0, count($notes) - 1)],
                'status' => $status,
                'table_label' => in_array($status, ['seated', 'completed'], true) ? 'T' . mt_rand(1, 24) : null,
                'cancelled_reason' => $status === 'cancelled' ? 'Cancelled by guest' : null,
                'created_at' => $this->sql($start->modify('-' . mt_rand(1, 12) . ' days')),
            ]);
        }
    }

    /* ----------------------------------------------------------------- reviews */

    private function reviews(): void
    {
        $texts = [
            ['smoky-party-jollof', 5, 'The real party jollof', 'Smoky, perfectly spiced and the plantain was sweet and caramelised. Delivery arrived hot.'],
            ['pierogi-ruskie', 5, 'Better than my babcia’s (don’t tell her)', 'Soft dough, generous filling and crispy onions. I order these every week now.'],
            ['beef-suya-platter', 5, 'Suya done right', 'Tender beef, fresh yaji and a squeeze of lime. Perfect with a cold Chapman.'],
            ['egusi-pounded-yam', 4, 'Hearty and rich', 'Egusi had plenty of assorted meat. Pounded yam was smooth. A little more pepper next time please.'],
            ['beef-wellington', 5, 'Showstopper', 'Carved at the table for our anniversary. Pastry crisp, beef pink and tender. Worth every naira.'],
            ['golabki', 4, 'Comforting', 'Cabbage rolls in a lovely tomato sauce. Reminded me of Kraków winters, even in Lagos heat.'],
            ['grilled-salmon', 5, 'Light and lovely', 'Salmon cooked beautifully with a buttery lemon sauce. Great for a business lunch.'],
            ['pierogi-z-miesem', 5, 'Meat pierogi heaven', 'Juicy filling and golden edges. The sour cream on the side is a must.'],
            ['zurek', 4, 'Sour rye soup in a bread bowl', 'Unusual and delicious. Staff explained the dish to my Nigerian friends who loved it.'],
            ['puff-puff', 5, 'Dessert of the night', 'Hot, fluffy puff-puff with a chocolate dip. We ordered a second round.'],
            ['tiramisu', 4, 'Classic', 'Creamy and not too sweet. Good espresso hit.'],
            ['chapman', 5, 'Best Chapman in VI', 'Bright, fizzy and not too sweet. Perfect in the lounge on a Friday.'],
            ['lobster-thermidor', 5, 'Special-occasion treat', 'Rich and indulgent. Service was attentive without hovering.'],
            ['paczki', 5, 'Pączki!', 'Rose jam pączki in Lagos. I nearly cried. Light and fresh.'],
            ['ofada-ayamase', 4, 'Proper ayamase', 'Green pepper sauce with real heat and depth. Ofada rice was fragrant.'],
            ['chocolate-fondant', 5, 'Molten middle every time', 'The fondant was perfect, with a scoop of vanilla ice cream. Great end to dinner.'],
            [null, 5, 'Three kitchens, one perfect evening', 'We tried something from every kitchen. The private dining room was elegant and the staff were wonderful.'],
            [null, 4, 'Lovely lounge', 'Great live band on Friday. Cocktails were excellent. Booking ahead is a good idea.'],
            ['bigos', 4, 'Hunter’s stew', 'Smoky and deeply flavoured. A generous portion.'],
            ['pepper-soup', 5, 'Cures everything', 'Fiery goat pepper soup with fresh uziza. Exactly what I wanted on a rainy evening.'],
            ['ribeye-peppercorn', 5, 'Perfect medium-rare', 'Steak cooked exactly as asked. Peppercorn sauce had a lovely kick.'],
            ['sernik', 4, 'Light cheesecake', 'Polish cheesecake with berry compote. Lighter than New York style, very nice.'],
            ['smoky-party-jollof', 5, 'Ordered for the office', 'Fed twelve of us for a team lunch. Everyone asked where it was from.'],
            ['pierogi-ruskie', 4, 'Great value', 'Filling lunch, quick delivery to Ikoyi.'],
            [null, 5, 'Birthday made special', 'They brought out a dessert with a candle and sang. Thoughtful touch.'],
            ['moi-moi', 4, 'Silky moi moi', 'Steamed perfectly with egg and fish inside.'],
            ['caesar-salad', 4, 'Fresh and crunchy', 'Good dressing and real parmesan. Nice lighter option.'],
            ['kotlet-schabowy', 5, 'Crispy schabowy', 'Huge, crisp cutlet with buttery potatoes and mizeria. Authentic.'],
            ['efo-riro', 4, 'Vegetable goodness', 'Rich efo riro with plenty of locust beans. Lovely with semo.'],
            ['creme-brulee', 5, 'That crack', 'Perfect caramel crust and silky custard.'],
        ];
        $pending = [
            ['asun', 3, 'Good but small', 'Tasty asun but the portion felt small for the price.'],
            ['seafood-linguine', 4, 'Nice pasta', 'Plenty of seafood. Arrived slightly cold, but the flavour was good.'],
            ['smoky-party-jollof', 5, 'Obsessed', 'Third order this month. Never misses.'],
        ];
        $order = fn () => $this->db->scalar("SELECT id FROM orders WHERE user_id IS NULL AND status IN ('delivered','completed') ORDER BY RAND() LIMIT 1");
        foreach ([[$texts, 'approved'], [$pending, 'pending']] as [$list, $status]) {
            foreach ($list as $i => [$slug, $rating, $title, $body]) {
                $at = $this->now->modify('-' . mt_rand($status === 'pending' ? 0 : 1, $status === 'pending' ? 2 : 75) . ' days')->setTime(mt_rand(10, 22), mt_rand(0, 59));
                $this->db->insert('reviews', [
                    'author_name' => self::FIRST[($i * 7) % count(self::FIRST)] . ' ' . mb_substr(self::LAST[($i * 5) % count(self::LAST)], 0, 1) . '.',
                    'dish_id' => $slug ? $this->db->scalar('SELECT id FROM dishes WHERE slug = ?', [$slug]) : null,
                    'order_id' => mt_rand(1, 100) <= 70 ? $order() : null,
                    'rating' => $rating,
                    'title' => $title,
                    'body' => $body,
                    'status' => $status,
                    'admin_reply' => $status === 'approved' && $i % 6 === 0 ? 'Thank you so much! We can’t wait to welcome you back to the table.' : null,
                    'replied_at' => $status === 'approved' && $i % 6 === 0 ? $this->sql($at->modify('+1 day')) : null,
                    'created_at' => $this->sql($at),
                ]);
            }
        }
    }

    /* --------------------------------------------------- enquiries and messages */

    private function enquiries(): void
    {
        $packages = array_column($this->db->all('SELECT id, slug FROM event_packages'), 'id', 'slug');
        $rows = [
            ['Chioma Adeyemi', 'Adeyemi & Co.', 'corporate', 40, 3500000, 'new', 'End-of-year dinner for our Lagos team. Interested in the three-kitchen tasting.', 2],
            ['Michał Zieliński', null, 'wedding', 120, 25000000, 'contacted', 'Nigerian-Polish wedding reception. Can you do both menus?', 5],
            ['Funke Bakare', null, 'birthday', 25, 2000000, 'quoted', 'Surprise 50th birthday for my mother. Private room, live music if possible.', 8],
            ['Emeka Obi', 'Lagos Fintech Week', 'corporate', 80, 12000000, 'booked', 'Networking dinner after the conference day.', 14],
            ['Anna Kowalska', 'Embassy staff association', 'private_dining', 14, 1500000, 'new', 'Independence Day lunch for embassy staff.', 1],
        ];
        $ids = array_values($packages);
        foreach ($rows as $i => [$name, $company, $type, $guests, $budgetNaira, $status, $message, $daysAgo]) {
            $this->db->insert('event_enquiries', [
                'name' => $name, 'email' => strtolower(preg_replace('/[^A-Za-z]/', '', iconv('UTF-8', 'ASCII//TRANSLIT', $name) ?: 'guest') ?? 'guest') . '@example.com',
                'phone' => '+23480' . mt_rand(30000000, 99999999), 'company' => $company, 'event_type' => $type,
                'package_id' => $ids[$i % max(1, count($ids))] ?? null,
                'event_date' => $this->now->modify('+' . (20 + $i * 9) . ' days')->format('Y-m-d'), 'guests' => $guests,
                'budget_kobo' => $budgetNaira * 100, 'message' => $message, 'status' => $status,
                'created_at' => $this->sql($this->now->modify("-{$daysAgo} days")->setTime(mt_rand(9, 20), mt_rand(0, 59))),
            ]);
        }
    }

    private function messages(): void
    {
        $rows = [
            ['Tolu Martins', 'Parking on Friday nights', 'Is there parking near the restaurant on Friday evenings? Coming with my parents.', 'new', 0],
            ['Kasia Nowak', 'Gluten-free pierogi?', 'Do you make a gluten-free version of the pierogi? My daughter is coeliac.', 'new', 1],
            ['Victor Eze', 'Lost umbrella', 'I left a black umbrella at table 12 on Saturday. Could you check?', 'read', 3],
            ['Amina Yusuf', 'Halal options', 'Which dishes are halal? Thank you for labelling the pork dishes.', 'replied', 6],
            ['David Cole', 'Corporate account', 'Can our company set up monthly invoicing for team lunches?', 'read', 9],
            ['Bisi Ade', 'Thank you!', 'Just wanted to say the staff made my birthday so special last week.', 'archived', 12],
        ];
        foreach ($rows as [$name, $subject, $message, $status, $daysAgo]) {
            $this->db->insert('contact_messages', [
                'name' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@example.com', 'phone' => null,
                'subject' => $subject, 'message' => $message, 'status' => $status,
                'created_at' => $this->sql($this->now->modify("-{$daysAgo} days")->setTime(mt_rand(8, 21), mt_rand(0, 59))),
            ]);
        }
    }

    private function sql(\DateTimeImmutable $at): string
    {
        return $at->format('Y-m-d H:i:s');
    }
}
