<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Security\Permissions;
use Slim\Psr7\Factory\StreamFactory;
use Slim\Psr7\UploadedFile;

/** Admin panel API: role-based access, and the main admin actions. Clock: Tue 20 Oct 2026, 12:00. */
final class AdminTest extends IntegrationTestCase
{
    private const ACCOUNTS = [
        'super_admin' => ['admin@smallafrica.demo', 'SmallAfrica@Admin2026'],
        'manager' => ['manager@smallafrica.demo', 'SmallAfrica@Manager2026'],
        'kitchen' => ['kitchen@smallafrica.demo', 'SmallAfrica@Kitchen2026'],
        'front_desk' => ['frontdesk@smallafrica.demo', 'SmallAfrica@Desk2026'],
        'customer' => ['guest@smallafrica.demo', 'SmallAfrica@Guest2026'],
    ];

    /** @return array<string, string> */
    private function as(string $who): array
    {
        $this->session->destroy();
        [$email, $password] = self::ACCOUNTS[$who];
        [$res, $body] = $this->request('POST', '/api/auth/login', ['email' => $email, 'password' => $password], $this->spaHeaders());
        self::assertSame(200, $res->getStatusCode(), json_encode($body));
        return ['X-CSRF-Token' => $body['csrfToken'], 'Origin' => 'http://localhost:5173'];
    }

    private function code(string $method, string $path, array $headers, ?array $body = null): int
    {
        [$res] = $this->request($method, $path, $body, $headers);
        return $res->getStatusCode();
    }

    private function paidOrder(): string
    {
        $this->session->destroy();
        [, $placed] = $this->request('POST', '/api/orders', [
            'items' => [['dish_id' => (int) $this->db->scalar("SELECT id FROM dishes WHERE slug = 'smoky-party-jollof'"), 'quantity' => 1]],
            'fulfilment' => 'pickup', 'name' => 'Walk In', 'email' => 'walkin@example.com', 'phone' => '08031234567',
        ], $this->spaHeaders() + ['Idempotency-Key' => bin2hex(random_bytes(12))]);
        $ref = $placed['order']['reference'];
        $this->request('POST', '/api/payments/simulate', ['reference' => $ref, 'outcome' => 'success'], $this->spaHeaders());
        return $ref;
    }

    public function testEveryAdminRouteIsProtectedOnTheServer(): void
    {
        $this->session->destroy();
        self::assertSame(401, $this->code('GET', '/api/admin/dashboard', []));
        $guest = $this->as('customer');
        foreach (['/api/admin/dashboard', '/api/admin/orders', '/api/admin/customers', '/api/admin/settings', '/api/admin/audit', '/api/admin/me'] as $path) {
            self::assertSame(403, $this->code('GET', $path, $guest), "Customer must not reach {$path}");
        }
    }

    public function testPermissionsFollowRoleAndPosition(): void
    {
        $kitchen = $this->as('kitchen');
        self::assertSame(200, $this->code('GET', '/api/admin/dashboard', $kitchen));
        self::assertSame(200, $this->code('GET', '/api/admin/orders', $kitchen));
        self::assertSame(200, $this->code('GET', '/api/admin/menu', $kitchen));
        self::assertSame(403, $this->code('GET', '/api/admin/customers', $kitchen));
        self::assertSame(403, $this->code('GET', '/api/admin/reservations', $kitchen));
        self::assertSame(403, $this->code('PUT', '/api/admin/loyalty/settings', $kitchen, []));
        self::assertSame(403, $this->code('POST', '/api/admin/dishes', $kitchen, []));

        $desk = $this->as('front_desk');
        self::assertSame(200, $this->code('GET', '/api/admin/reservations', $desk));
        self::assertSame(200, $this->code('GET', '/api/admin/customers', $desk));
        self::assertSame(403, $this->code('GET', '/api/admin/settings', $desk));
        self::assertSame(403, $this->code('PUT', '/api/admin/capacity', $desk, []));

        $manager = $this->as('manager');
        self::assertSame(200, $this->code('GET', '/api/admin/settings', $manager));
        self::assertSame(200, $this->code('GET', '/api/admin/loyalty/analytics', $manager));
        self::assertSame(403, $this->code('GET', '/api/admin/staff', $manager), 'Only Super Admin manages staff');
        self::assertSame(403, $this->code('POST', '/api/admin/customers/1/adjust', $manager, []), 'Only Super Admin adjusts balances');

        [, $me] = $this->request('GET', '/api/admin/me', null, $manager);
        self::assertContains('loyalty.manage', $me['permissions']);
        self::assertNotContains('staff.manage', $me['permissions']);
        self::assertFalse(Permissions::can(['role' => 'staff', 'staff_position' => 'kitchen', 'is_active' => 1], 'customers.view'));
        self::assertFalse(Permissions::can(['role' => 'manager', 'staff_position' => null, 'is_active' => 0], 'dashboard.view'), 'Suspended accounts have no permissions');
    }

    public function testDashboardFiguresAndLiveFeed(): void
    {
        $ref = $this->paidOrder();
        $h = $this->as('manager');
        [$res, $d] = $this->request('GET', '/api/admin/dashboard?days=30', null, $h);
        self::assertSame(200, $res->getStatusCode());
        self::assertCount(30, $d['series']);
        self::assertGreaterThanOrEqual(1, $d['today']['orders']);
        self::assertSame(intdiv($d['today']['revenueKobo'], $d['today']['orders']), $d['today']['averageOrderKobo']);
        self::assertContains($ref, array_column($d['live'], 'reference'));
    }

    public function testKitchenMovesOrdersThroughTheKitchenOnly(): void
    {
        $ref = $this->paidOrder();
        $kitchen = $this->as('kitchen');
        [, $detail] = $this->request('GET', "/api/admin/orders/{$ref}", null, $kitchen);
        self::assertSame(['preparing'], $detail['order']['nextStatuses'], 'Kitchen can’t cancel');
        self::assertSame(403, $this->code('POST', "/api/admin/orders/{$ref}/status", $kitchen, ['status' => 'cancelled']));
        [, $moved] = $this->request('POST', "/api/admin/orders/{$ref}/status", ['status' => 'preparing'], $kitchen);
        self::assertSame('preparing', $moved['order']['status']);
        self::assertSame('Ibrahim Musa', end($moved['order']['history'])['by']);

        $manager = $this->as('manager');
        self::assertSame(422, $this->code('POST', "/api/admin/orders/{$ref}/refund-flag", $manager, ['flag' => true, 'reason' => 'x']));
        [, $flagged] = $this->request('POST', "/api/admin/orders/{$ref}/refund-flag", ['flag' => true, 'reason' => 'Guest received a cold dish'], $manager);
        self::assertTrue($flagged['order']['refundFlag']);
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'order.refund_flagged' AND entity_id = ?", [$ref]));
    }

    public function testMenuManagerCreatesEditsAndKitchenMarksSoldOut(): void
    {
        $m = $this->as('manager');
        $cat = (int) $this->db->scalar("SELECT id FROM categories WHERE slug = 'mains'");
        [$res, $menu] = $this->request('POST', '/api/admin/dishes', [
            'name' => 'Ofe Owerri', 'category_id' => $cat, 'kitchen_id' => (int) $this->db->scalar("SELECT id FROM kitchens WHERE slug = 'nigerian'"),
            'short_description' => 'Rich Owerri soup', 'description' => 'Thick vegetable soup with assorted meats.', 'price_naira' => 21000,
            'allergens' => ['fish'], 'options' => [
                ['group' => 'portion', 'name' => 'Regular', 'price_delta_naira' => 0, 'is_default' => true],
                ['group' => 'addon', 'name' => 'Extra pounded yam', 'price_delta_naira' => 2500],
            ],
        ], $m);
        self::assertSame(201, $res->getStatusCode(), json_encode($menu));
        $dish = array_values(array_filter($menu['dishes'], static fn ($d) => $d['name'] === 'Ofe Owerri'))[0];
        self::assertSame('ofe-owerri', $dish['slug']);
        self::assertCount(2, $dish['options']);

        $this->request('PATCH', "/api/admin/dishes/{$dish['id']}", ['price_naira' => 22500], $m);
        self::assertSame(2250000, (int) $this->db->scalar('SELECT price_kobo FROM dishes WHERE id = ?', [$dish['id']]));
        $audit = json_decode((string) $this->db->scalar("SELECT meta FROM audit_logs WHERE action = 'menu.dish_updated' ORDER BY id DESC LIMIT 1"), true);
        self::assertSame(['from' => 2100000, 'to' => 2250000], $audit['price']);

        self::assertSame(422, $this->code('POST', '/api/admin/dishes', $m, ['name' => 'Bad', 'category_id' => $cat, 'short_description' => 'x', 'description' => 'x', 'price_naira' => 1000,
            'options' => [['group' => 'portion', 'name' => 'A', 'price_delta_naira' => 0], ['group' => 'portion', 'name' => 'B', 'price_delta_naira' => 0]]]), 'Exactly one default portion');

        $kitchen = $this->as('kitchen');
        [, $after] = $this->request('POST', "/api/admin/dishes/{$dish['id']}/availability", ['sold_out_today' => true], $kitchen);
        $row = array_values(array_filter($after['dishes'], static fn ($d) => $d['id'] === $dish['id']))[0];
        self::assertTrue($row['soldOutToday']);
        self::assertSame(403, $this->code('PATCH', "/api/admin/dishes/{$dish['id']}", $kitchen, ['price_naira' => 1]));
    }

    public function testImageUploadsAreValidatedAndReEncoded(): void
    {
        $m = $this->as('manager');
        $dishId = (int) $this->db->scalar("SELECT id FROM dishes WHERE slug = 'sernik'");

        $fake = $this->upload("<?php echo 'hi'; ?>", 'evil.jpg', 'image/jpeg');
        [$bad, $err] = $this->uploadRequest("/api/admin/dishes/{$dishId}/image", $fake, $m);
        self::assertSame(422, $bad->getStatusCode());
        self::assertStringContainsString('JPEG, PNG or WebP', $err['error']['fields']['image']);

        $img = imagecreatetruecolor(800, 600);
        imagefill($img, 0, 0, imagecolorallocate($img, 201, 162, 75));
        ob_start();
        imagepng($img);
        $png = (string) ob_get_clean();
        [$ok, $menu] = $this->uploadRequest("/api/admin/dishes/{$dishId}/image", $this->upload($png, 'cake.png', 'image/png'), $m);
        self::assertSame(200, $ok->getStatusCode(), json_encode($menu));
        $url = array_values(array_filter($menu['dishes'], static fn ($d) => $d['id'] === $dishId))[0]['imageUrl'];
        self::assertMatchesRegularExpression('#^/media/dishes/sernik-[a-f0-9]{10}\.webp$#', $url);

        [$served] = $this->request('GET', '/api' . $url);
        self::assertSame(200, $served->getStatusCode());
        self::assertSame('image/webp', $served->getHeaderLine('Content-Type'));
        self::assertSame('RIFF', substr((string) $served->getBody(), 0, 4), 'Stored as real WebP');
        self::assertSame(404, $this->code('GET', '/api/media/dishes/..%2F..%2F.env', []));

        $this->request('DELETE', "/api/admin/dishes/{$dishId}/image", null, $m);
        [$gone] = $this->request('GET', '/api' . $url);
        self::assertSame(404, $gone->getStatusCode(), 'Replaced/removed files are deleted');
    }

    public function testLoyaltySettingsAreValidatedAndAudited(): void
    {
        $m = $this->as('manager');
        [, $current] = $this->request('GET', '/api/admin/loyalty/settings', null, $m);
        $s = $current['settings'];
        $bad = $s;
        $bad['tiers'][2]['min_spend_naira'] = 100; // below Silver
        self::assertSame(422, $this->code('PUT', '/api/admin/loyalty/settings', $m, $bad));

        $s['earn_points_per_1000_naira'] = 4;
        $s['interest_rate_bp'] = 150;
        [$res, $saved] = $this->request('PUT', '/api/admin/loyalty/settings', $s, $m);
        self::assertSame(200, $res->getStatusCode(), json_encode($saved));
        self::assertSame(4, $saved['settings']['earn_points_per_1000_naira']);
        $meta = json_decode((string) $this->db->scalar("SELECT meta FROM audit_logs WHERE action = 'loyalty.settings_updated' ORDER BY id DESC LIMIT 1"), true);
        self::assertEqualsCanonicalizing(['earn_points_per_1000_naira', 'interest_rate_bp'], $meta['changed']);
        self::assertSame(5, $meta['before']['earn_points_per_1000_naira']);
    }

    public function testSuperAdminAdjustsBalancesWithAReason(): void
    {
        $guest = (int) $this->db->scalar("SELECT id FROM users WHERE email = 'guest@smallafrica.demo'");
        $a = $this->as('super_admin');
        self::assertSame(422, $this->code('POST', "/api/admin/customers/{$guest}/adjust", $a, ['kind' => 'wallet', 'direction' => 'credit', 'amount' => 500, 'reason' => '']));
        [, $r] = $this->request('POST', "/api/admin/customers/{$guest}/adjust", ['kind' => 'wallet', 'direction' => 'credit', 'amount' => 500, 'reason' => 'Goodwill: late delivery'], $a);
        self::assertSame(6850000 + 50000, $r['balanceAfter']);
        $entry = $this->db->one("SELECT * FROM wallet_ledger WHERE user_id = ? AND entry_type = 'adjustment' ORDER BY id DESC LIMIT 1", [$guest]);
        self::assertNotNull($entry['created_by_user_id'], 'The ledger records who made the adjustment');
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'loyalty.adjustment' AND entity_id = ?", [(string) $guest]));
        self::assertSame(409, $this->code('POST', "/api/admin/customers/{$guest}/adjust", $a, ['kind' => 'points', 'direction' => 'debit', 'amount' => 999999, 'reason' => 'Too many points']), 'Balances can’t go negative');
    }

    public function testFrontDeskRecordsADineInBill(): void
    {
        $guest = (int) $this->db->scalar("SELECT id FROM users WHERE email = 'guest@smallafrica.demo'");
        $before = (int) $this->db->scalar('SELECT points_balance FROM loyalty_accounts WHERE user_id = ?', [$guest]);
        $desk = $this->as('front_desk');
        [$res, $v] = $this->request('POST', "/api/admin/customers/{$guest}/visits", ['amount_naira' => 40000], $desk);
        self::assertSame(201, $res->getStatusCode(), json_encode($v));
        // ₦40,000 on a Tuesday: 200 base points, 2× (double day beats Gold 1.5×).
        self::assertSame(400, $v['visit']['points']);
        self::assertSame($before + 400, (int) $this->db->scalar('SELECT points_balance FROM loyalty_accounts WHERE user_id = ?', [$guest]));
        self::assertSame(409, $this->code('POST', "/api/admin/customers/{$guest}/visits", $desk, ['amount_naira' => 40000]), 'Accidental double entry is blocked');
    }

    public function testInterestRunsAreSuperAdminOnlyAndDemoSimulationIsOffByDefault(): void
    {
        self::assertSame(403, $this->code('POST', '/api/admin/loyalty/interest-runs', $this->as('manager'), ['period' => '2026-09']));
        $a = $this->as('super_admin');
        [$res] = $this->request('POST', '/api/admin/loyalty/interest-runs', ['period' => '2026-09'], $a);
        self::assertSame(409, $res->getStatusCode(), 'September was already paid');
        self::assertSame(404, $this->code('POST', '/api/admin/loyalty/interest-runs/simulate', $a, []));
    }

    public function testReservationsCapacityAndCancellationEmail(): void
    {
        $this->session->destroy();
        [, $booked] = $this->request('POST', '/api/reservations', [
            'date' => '2026-10-23', 'time' => '19:00', 'party_size' => 4, 'area' => 'terrace', 'name' => 'Ada Obi', 'email' => 'ada@example.com', 'phone' => '08031234567',
        ], $this->spaHeaders());
        $code = $booked['reservation']['code'];
        $desk = $this->as('front_desk');
        [, $list] = $this->request('GET', '/api/admin/reservations?from=2026-10-23&to=2026-10-23', null, $desk);
        self::assertContains($code, array_column($list['reservations'], 'code'));
        [, $seated] = $this->request('PATCH', "/api/admin/reservations/{$code}", ['table_label' => 'T4'], $desk);
        self::assertSame('T4', $seated['reservation']['tableLabel']);
        self::assertSame(409, $this->code('PATCH', "/api/admin/reservations/{$code}", $desk, ['status' => 'completed']), 'Must be seated first');
        $this->request('PATCH', "/api/admin/reservations/{$code}", ['status' => 'cancelled', 'reason' => 'Terrace closed for rain'], $desk);
        self::assertStringContainsString('cancelled', end($this->mailer->sent)['subject']);

        $m = $this->as('manager');
        [, $cap] = $this->request('PUT', '/api/admin/capacity', ['date' => '2026-10-24', 'area' => 'terrace', 'covers' => 0, 'reason' => 'Private event'], $m);
        $terrace = array_values(array_filter($cap['areas'], static fn ($a) => $a['slug'] === 'terrace'))[0];
        self::assertSame(0, $terrace['slots'][0]['covers']);
        [, $avail] = $this->request('GET', '/api/reservations/availability?date=2026-10-24&party=2');
        $t = array_values(array_filter($avail['areas'], static fn ($a) => $a['slug'] === 'terrace'))[0];
        self::assertFalse(array_reduce($t['slots'], static fn ($c, $s) => $c || $s['available'], false), 'Closed for the day');
    }

    public function testStaffManagementSafeguards(): void
    {
        $a = $this->as('super_admin');
        [$res, $list] = $this->request('POST', '/api/admin/staff', ['first_name' => 'Kemi', 'last_name' => 'Ade', 'email' => 'kemi@smallafrica.demo', 'role' => 'staff', 'staff_position' => 'front_desk'], $a);
        self::assertSame(201, $res->getStatusCode(), json_encode($list));
        self::assertStringContainsString('invited', end($this->mailer->sent)['subject']);
        self::assertSame(422, $this->code('POST', '/api/admin/staff', $a, ['first_name' => 'X', 'last_name' => 'Y', 'email' => 'x@example.com', 'role' => 'staff']), 'Staff need a position');

        $selfId = (int) $this->db->scalar("SELECT id FROM users WHERE email = 'admin@smallafrica.demo'");
        self::assertSame(409, $this->code('PATCH', "/api/admin/staff/{$selfId}", $a, ['role' => 'manager']));
        $managerId = (int) $this->db->scalar("SELECT id FROM users WHERE email = 'manager@smallafrica.demo'");
        $this->request('PATCH', "/api/admin/staff/{$managerId}", ['is_active' => false], $a);
        self::assertSame(0, (int) $this->db->scalar('SELECT is_active FROM users WHERE id = ?', [$managerId]));
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM audit_logs WHERE action = 'staff.updated' AND entity_id = ?", [(string) $managerId]));
    }

    public function testCouponsReviewsSettingsAndAudit(): void
    {
        $m = $this->as('manager');
        [$res, $c] = $this->request('POST', '/api/admin/coupons', ['code' => 'SUYA20', 'description' => '20% off suya', 'discount_type' => 'percent', 'discount_value' => 20, 'valid_weekdays' => [5, 6]], $m);
        self::assertSame(201, $res->getStatusCode(), json_encode($c));
        $coupon = array_values(array_filter($c['coupons'], static fn ($x) => $x['code'] === 'SUYA20'))[0];
        self::assertSame([5, 6], $coupon['validWeekdays']);
        self::assertSame(422, $this->code('POST', '/api/admin/coupons', $m, ['code' => 'BIG', 'description' => 'x', 'discount_type' => 'percent', 'discount_value' => 150]));
        [, $exp] = $this->request('POST', "/api/admin/coupons/{$coupon['id']}/expire", [], $m);
        self::assertFalse(array_values(array_filter($exp['coupons'], static fn ($x) => $x['code'] === 'SUYA20'))[0]['live']);

        $reviewId = (int) $this->db->scalar('SELECT id FROM reviews ORDER BY id LIMIT 1');
        [, $r] = $this->request('PATCH', "/api/admin/reviews/{$reviewId}", ['status' => 'hidden', 'reply' => 'Thank you for the feedback.'], $m);
        self::assertSame('hidden', $r['review']['status']);
        self::assertSame('Thank you for the feedback.', $r['review']['reply']);

        $hours = array_map(static fn ($d) => ['day_of_week' => $d, 'opens_at' => '12:00', 'closes_at' => '11:00', 'is_closed' => false], range(0, 6));
        self::assertSame(422, $this->code('PUT', '/api/admin/settings/hours', $m, ['hours' => $hours]), 'Opening before closing');
        [, $set] = $this->request('PUT', '/api/admin/settings/restaurant', [
            'name' => 'Small Africa', 'tagline' => 'Three kitchens. One table.', 'address' => '12 Adeola Odeku St, Victoria Island, Lagos',
            'phone' => '+234 803 000 0000', 'whatsapp' => '+2348030000000', 'email' => 'hello@smallafrica.ng', 'map_embed_query' => 'Adeola Odeku Street, Lagos',
        ], $m);
        self::assertSame('12 Adeola Odeku St, Victoria Island, Lagos', $set['groups']['restaurant']['address']);

        [, $audit] = $this->request('GET', '/api/admin/audit?action=coupon', null, $m);
        self::assertContains('coupon.expired', array_column($audit['items'], 'action'));
        self::assertSame('Tomasz Kowalski', $audit['items'][0]['actor']['name']);
    }

    private function upload(string $bytes, string $name, string $type): UploadedFile
    {
        return new UploadedFile((new StreamFactory())->createStream($bytes), $name, $type, strlen($bytes), UPLOAD_ERR_OK);
    }

    /** @return array{0: \Psr\Http\Message\ResponseInterface, 1: array<string, mixed>} */
    private function uploadRequest(string $path, UploadedFile $file, array $headers): array
    {
        $app = \App\App::create($this->c);
        $request = (new \Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('POST', $path, ['REMOTE_ADDR' => '203.0.113.10'])
            ->withUploadedFiles(['image' => $file])
            ->withParsedBody(['alt' => 'Sernik slice']);
        foreach ($headers as $k => $v) {
            $request = $request->withHeader($k, $v);
        }
        $response = $app->handle($request);
        return [$response, json_decode((string) $response->getBody(), true) ?? []];
    }
}
