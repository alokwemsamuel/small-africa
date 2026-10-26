<?php

declare(strict_types=1);

namespace App\Seeds;

use App\Support\Database;

/**
 * DEMO / PRESENTATION DATA ONLY: invented guests and reviews so the site and admin look
 * alive in development and during the client presentation. Never run in production:
 * real reviews must come from real guests. Run with: php bin/seed.php --demo
 * DemoLoyaltySeeder adds past orders and Interest Account history.
 */
final class DemoSeeder
{
    private const REVIEWS = [
        ['Funmilayo A.', 'smoky-party-jollof', 5, 'Proper party jollof', 'That smoky bottom-pot flavour I thought only my aunty could make. The plantain was perfectly caramelised. We will be back for birthdays.'],
        ['Katarzyna W.', 'pierogi-ruskie', 5, 'Tastes like Kraków', 'I am Polish and living in Lagos for six years. These pierogi made me emotional: soft dough, real twaróg, and the onions are exactly right.'],
        ['Tunde O.', 'beef-wellington', 5, 'Worth every naira', 'Carved at the table, pink in the middle, crisp pastry. Service was warm without hovering. Best anniversary dinner we have had in Lagos.'],
        ['Chiamaka N.', 'egusi-pounded-yam', 4, 'Rich and generous', 'Egusi was thick and full of meat, pounded yam smooth. Only wish there was a little more pepper, but they offered to adjust it.'],
        ['Piotr N.', 'zurek', 5, 'Żurek in a bread bowl!', 'Did not expect to find proper żurek in Victoria Island. Sour, smoky and comforting. The staff explained every dish to my Nigerian colleagues.'],
        ['Adebayo K.', 'beef-suya-platter', 5, 'Better than Abuja suya', 'Tender sirloin and the yaji is fresh. Great with a Chapman in the lounge on a Friday night when the band plays.'],
        ['Ngozi E.', null, 5, 'Three kitchens, one perfect night', 'We did the Chef’s Tasting Menu for my mother’s 60th. Moving from pepper soup to pierogi to a fillet felt like travelling. The private room was beautiful.'],
        ['Marta K.', 'sernik', 4, 'Lovely sernik', 'Light and creamy like my grandmother’s, with a lovely berry compote. Coffee was excellent too.'],
        ['Ifeoma C.', 'grilled-croaker', 5, 'Fish was perfect', 'Whole croaker grilled beautifully with a pepper sauce that had real depth. Portion was big enough to share.'],
        ['Oluwaseun B.', 'ribeye-peppercorn', 4, 'Great steak', 'Cooked exactly medium-rare as asked, peppercorn sauce had a nice kick. Triple-cooked chips were addictive.'],
    ];

    public function __construct(private Database $db)
    {
    }

    public function run(): void
    {
        $this->db->transaction(function (): void {
            foreach (self::REVIEWS as $i => [$author, $slug, $rating, $title, $body]) {
                $dishId = $slug ? $this->db->scalar('SELECT id FROM dishes WHERE slug = ?', [$slug]) : null;
                $this->db->insert('reviews', [
                    'author_name' => $author,
                    'dish_id' => $dishId ?: null,
                    'rating' => $rating,
                    'title' => $title,
                    'body' => $body,
                    'status' => 'approved',
                    'created_at' => date('Y-m-d H:i:s', strtotime('-' . (3 + $i * 4) . ' days')),
                ]);
            }
        });
        (new DemoLoyaltySeeder($this->db))->run();
        (new DemoOperationsSeeder($this->db))->run();
    }
}
