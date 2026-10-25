<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Loyalty\AlreadyPaid;
use App\Loyalty\InterestService;
use App\Loyalty\Ledger;
use App\Loyalty\LoyaltyJobs;
use App\Loyalty\LoyaltyService;
use App\Services\OrderService;

/**
 * Interest Account money flows against the real database. The demo guest starts as seeded:
 * Gold, ₦68,500 dining credit, 2,340 points, 7 stamps. Clock: Tuesday 20 Oct 2026, 12:00.
 */
final class InterestAccountTest extends IntegrationTestCase
{
    private const GUEST = 'guest@smallafrica.demo';

    private function guestId(): int
    {
        return (int) $this->db->scalar('SELECT id FROM users WHERE email = ?', [self::GUEST]);
    }

    /** @return array<string, string> */
    private function signInGuest(): array
    {
        [, $login] = $this->request('POST', '/api/auth/login', ['email' => self::GUEST, 'password' => 'SmallAfrica@Guest2026'], $this->spaHeaders());
        return ['X-CSRF-Token' => $login['csrfToken'], 'Origin' => 'http://localhost:5173'];
    }

    private function wallet(int $userId): int
    {
        return (int) $this->db->scalar('SELECT wallet_balance_kobo FROM loyalty_accounts WHERE user_id = ?', [$userId]);
    }

    private function points(int $userId): int
    {
        return (int) $this->db->scalar('SELECT points_balance FROM loyalty_accounts WHERE user_id = ?', [$userId]);
    }

    /** @return array<string, mixed> */
    private function order(array $over = []): array
    {
        return $over + [
            'items' => [['dish_id' => (int) $this->db->scalar("SELECT id FROM dishes WHERE slug = 'smoky-party-jollof'"), 'quantity' => 2]],
            'fulfilment' => 'pickup',
            'name' => 'Chiamaka Bello',
            'email' => self::GUEST,
            'phone' => '08030000003',
        ];
    }

    private function simulate(string $reference, string $outcome): array
    {
        [, $body] = $this->request('POST', '/api/payments/simulate', ['reference' => $reference, 'outcome' => $outcome], $this->spaHeaders());
        return $body;
    }

    private function key(): string
    {
        return bin2hex(random_bytes(12));
    }

    public function testTheSeededGuestMatchesTheDemoBrief(): void
    {
        $this->signInGuest();
        [$res, $s] = $this->request('GET', '/api/account/loyalty');
        self::assertSame(200, $res->getStatusCode());
        self::assertSame('gold', $s['tier']['key']);
        self::assertSame(6850000, $s['wallet']['balanceKobo']);
        self::assertSame(2340, $s['points']['balance']);
        self::assertSame(7, $s['stampCard']['stamps']);
        self::assertSame('GUEST2026', $s['referral']['code']);
        self::assertSame('black_diamond', $s['tier']['next']['key']);
        self::assertTrue($this->c->get(Ledger::class)->reconcile($this->guestId())['ok'], 'Cached balances match the ledgers');
    }

    public function testTopUpIsCreditedOnceAfterVerificationWithBonus(): void
    {
        $headers = $this->signInGuest();
        $key = $this->key();
        [$res, $start] = $this->request('POST', '/api/account/wallet/topups', ['amount_naira' => 50000], $headers + ['Idempotency-Key' => $key]);
        self::assertSame(201, $res->getStatusCode());
        $ref = $start['topup']['reference'];
        self::assertSame(250000, $start['topup']['bonusKobo'], '5% bonus on ₦50,000');
        self::assertSame('simulated', $start['payment']['provider']);
        self::assertSame(6850000, $this->wallet($this->guestId()), 'Nothing credited before payment is verified');

        [, $again] = $this->request('POST', '/api/account/wallet/topups', ['amount_naira' => 50000], $headers + ['Idempotency-Key' => $key]);
        self::assertSame($ref, $again['topup']['reference'], 'Same Idempotency-Key, same top-up');

        $paid = $this->simulate($ref, 'success');
        self::assertSame('paid', $paid['topup']['status']);
        self::assertSame(6850000 + 5000000 + 250000, $this->wallet($this->guestId()));
        // Verifying again (browser + webhook racing) changes nothing.
        $this->request('POST', '/api/account/wallet/topups/verify', ['reference' => $ref], $headers);
        $this->simulate($ref, 'success');
        self::assertSame(6850000 + 5250000, $this->wallet($this->guestId()));
        self::assertSame(2, (int) $this->db->scalar('SELECT COUNT(*) FROM wallet_ledger WHERE reference = ?', [$ref]));
        self::assertTrue($this->c->get(Ledger::class)->reconcile($this->guestId())['ok']);
    }

    public function testTopUpLimitsAndVerifiedEmailRequired(): void
    {
        $headers = $this->signInGuest();
        [$small] = $this->request('POST', '/api/account/wallet/topups', ['amount_naira' => 1000], $headers);
        self::assertSame(422, $small->getStatusCode());
        $this->db->run('UPDATE users SET email_verified_at = NULL WHERE id = ?', [$this->guestId()]);
        [$unverified] = $this->request('POST', '/api/account/wallet/topups', ['amount_naira' => 10000], $headers);
        self::assertSame(403, $unverified->getStatusCode());
    }

    public function testADeclinedPaymentRetriesWithAFreshReference(): void
    {
        $headers = $this->signInGuest();
        $key = $this->key();
        [, $first] = $this->request('POST', '/api/orders', $this->order(), $headers + ['Idempotency-Key' => $key]);
        $ref = $first['order']['reference'];
        self::assertSame($ref, $first['payment']['reference'], 'First attempt uses the order reference');
        $declined = $this->simulate($ref, 'failed');
        self::assertSame('failed', $declined['order']['paymentStatus']);

        // The guest presses Pay again: same order, new Paystack reference (Paystack refuses duplicates).
        [, $retry] = $this->request('POST', '/api/orders', $this->order(), $headers + ['Idempotency-Key' => $key]);
        self::assertSame($ref, $retry['order']['reference']);
        self::assertSame("{$ref}-2", $retry['payment']['reference']);
        $paid = $this->simulate($ref, 'success');
        self::assertSame('paid', $paid['order']['paymentStatus']);

        // Closing the popup without paying resumes the same attempt instead of making a new one.
        $key2 = $this->key();
        [, $opened] = $this->request('POST', '/api/orders', $this->order(), $headers + ['Idempotency-Key' => $key2]);
        [, $resumed] = $this->request('POST', '/api/orders', $this->order(), $headers + ['Idempotency-Key' => $key2]);
        self::assertSame($opened['payment']['reference'], $resumed['payment']['reference']);
        self::assertSame($opened['payment']['accessCode'], $resumed['payment']['accessCode']);
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM payments WHERE reference LIKE ?", [$opened['order']['reference'] . '%']));
    }

    public function testPayingEntirelyWithDiningCredit(): void
    {
        $headers = $this->signInGuest();
        [, $quote] = $this->request('POST', '/api/checkout/quote', $this->order(['use_wallet' => true]), $headers);
        $total = $quote['quote']['totalKobo'];
        self::assertSame($total, $quote['quote']['walletAppliedKobo']);
        self::assertSame(0, $quote['quote']['payableKobo']);

        [$res, $placed] = $this->request('POST', '/api/orders', $this->order(['use_wallet' => true]), $headers + ['Idempotency-Key' => $this->key()]);
        self::assertSame(201, $res->getStatusCode());
        self::assertNull($placed['payment'], 'No card payment needed');
        self::assertSame('paid', $placed['order']['paymentStatus']);
        self::assertSame($total, $placed['order']['walletAppliedKobo']);
        self::assertSame(6850000 - $total, $this->wallet($this->guestId()));
        self::assertStringContainsString('Paid with dining credit', end($this->mailer->sent)['text']);
    }

    public function testSplitPaymentHoldsCreditAndReturnsItIfTheOrderExpires(): void
    {
        $headers = $this->signInGuest();
        $big = $this->order(['items' => [['dish_id' => (int) $this->db->scalar("SELECT id FROM dishes WHERE slug = 'beef-wellington'"), 'quantity' => 2]], 'use_wallet' => true]);
        [, $placed] = $this->request('POST', '/api/orders', $big, $headers + ['Idempotency-Key' => $this->key()]);
        self::assertSame(6850000, $placed['order']['walletAppliedKobo'], 'All the credit is used');
        self::assertGreaterThan(0, $placed['order']['totalKobo'], 'The rest goes on the card');
        self::assertSame(0, $this->wallet($this->guestId()), 'Credit is held while the card payment is pending');

        $this->clock->freeze('2026-10-20 14:30:00');
        self::assertSame(1, $this->c->get(OrderService::class)->expireUnpaid());
        self::assertSame(6850000, $this->wallet($this->guestId()), 'Held credit returned when the order expired');
        self::assertSame('cancelled', $this->db->scalar('SELECT status FROM orders WHERE reference = ?', [$placed['order']['reference']]));
        self::assertSame(0, $this->c->get(OrderService::class)->expireUnpaid(), 'Idempotent');
        self::assertTrue($this->c->get(Ledger::class)->reconcile($this->guestId())['ok']);
    }

    public function testGoldMembersGetFreeDelivery(): void
    {
        $headers = $this->signInGuest();
        [, $q] = $this->request('POST', '/api/checkout/quote', $this->order(['fulfilment' => 'delivery', 'zone' => 'lekki']), $headers);
        self::assertSame(0, $q['quote']['deliveryFeeKobo']);
        self::assertTrue($q['quote']['freeDeliveryPerk']);
    }

    public function testCompletingAnOrderEarnsPointsAndAStampOnce(): void
    {
        $headers = $this->signInGuest();
        [, $placed] = $this->request('POST', '/api/orders', $this->order(), $headers + ['Idempotency-Key' => $this->key()]);
        $ref = $placed['order']['reference'];
        $this->simulate($ref, 'success');
        $orders = $this->c->get(OrderService::class);
        foreach (['preparing', 'ready', 'completed'] as $s) {
            $orders->updateStatus($ref, $s, null);
        }
        // ₦37,000 of a featured dish on a Tuesday at Gold: multipliers don't stack, the highest (2×) applies: 185 × 2.
        self::assertSame(2340 + 370, $this->points($this->guestId()));
        self::assertSame(370, (int) $this->db->scalar('SELECT points_earned FROM orders WHERE reference = ?', [$ref]));
        self::assertSame(8, (int) $this->db->scalar('SELECT stamps FROM loyalty_accounts WHERE user_id = ?', [$this->guestId()]));

        $id = (int) $this->db->scalar('SELECT id FROM orders WHERE reference = ?', [$ref]);
        $this->c->get(LoyaltyService::class)->onOrderCompleted($id);
        self::assertSame(2340 + 370, $this->points($this->guestId()), 'Processing twice changes nothing');
        self::assertTrue($this->c->get(Ledger::class)->reconcile($this->guestId())['ok']);
    }

    public function testRedeemPointsForCreditAndForAVoucherUsedAtCheckout(): void
    {
        $headers = $this->signInGuest();
        [$res, $credit] = $this->request('POST', '/api/account/rewards/credit-1000/redeem', [], $headers + ['Idempotency-Key' => $this->key()]);
        self::assertSame(200, $res->getStatusCode());
        self::assertSame(2240, $credit['account']['points']['balance']);
        self::assertSame(6850000 + 100000, $credit['account']['wallet']['balanceKobo']);

        [, $item] = $this->request('POST', '/api/account/rewards/free-dessert/redeem', [], $headers + ['Idempotency-Key' => $this->key()]);
        $code = $item['result']['voucher']['code'];
        self::assertSame(1540, $item['account']['points']['balance']);

        $sernik = (int) $this->db->scalar("SELECT id FROM dishes WHERE slug = 'sernik'");
        $withDessert = $this->order(['items' => [['dish_id' => $sernik, 'quantity' => 1], ['dish_id' => (int) $this->db->scalar("SELECT id FROM dishes WHERE slug = 'smoky-party-jollof'"), 'quantity' => 1]], 'voucher_code' => $code]);
        [, $q] = $this->request('POST', '/api/checkout/quote', $withDessert, $headers);
        $price = (int) $this->db->scalar('SELECT price_kobo FROM dishes WHERE id = ?', [$sernik]);
        self::assertSame($price, $q['quote']['voucherDiscountKobo'], 'The dessert is free');

        [, $placed] = $this->request('POST', '/api/orders', $withDessert, $headers + ['Idempotency-Key' => $this->key()]);
        [$reuse, $err] = $this->request('POST', '/api/checkout/quote', $withDessert, $headers);
        self::assertSame(422, $reuse->getStatusCode(), 'A voucher works once');
        self::assertArrayHasKey('voucher_code', $err['error']['fields']);

        // If that order expires unpaid, the voucher comes back.
        $this->clock->freeze('2026-10-20 15:00:00');
        $this->c->get(OrderService::class)->expireUnpaid();
        self::assertSame('issued', $this->db->scalar('SELECT status FROM reward_vouchers WHERE code = ?', [$code]));
        self::assertNotEmpty($placed['order']['reference']);

        [$broke] = $this->request('POST', '/api/account/rewards/tasting-upgrade/redeem', [], $headers);
        self::assertSame(409, $broke->getStatusCode(), 'Not enough points');
    }

    public function testMonthlyInterestIsPaidOnceOnTheLowestBalance(): void
    {
        $ledger = $this->c->get(Ledger::class);
        $saver = $this->newMember('saver@example.com');
        $dipper = $this->newMember('dipper@example.com');
        $this->clock->freeze('2027-01-20 10:00:00');
        $ledger->wallet($saver, 'credit', 'topup', 5000000, 'Top-up');   // ₦50,000
        $ledger->wallet($dipper, 'credit', 'topup', 5000000, 'Top-up');
        $this->clock->freeze('2027-02-14 10:00:00');
        $ledger->wallet($saver, 'debit', 'payment', 1000000, 'Order');  // lowest in Feb: ₦40,000
        $ledger->wallet($dipper, 'debit', 'payment', 3500000, 'Order'); // dips to ₦15,000
        $ledger->wallet($dipper, 'credit', 'topup', 5000000, 'Top-up'); // back up, but too late

        $this->clock->freeze('2027-03-01 00:10:00');
        $interest = $this->c->get(InterestService::class);
        $run = $interest->run('2027-02');
        self::assertSame('completed', $run['status']);
        self::assertSame(4000000 + 80000, $this->wallet($saver), '2% of ₦40,000 = ₦800');
        self::assertSame(6500000, $this->wallet($dipper), 'Dipped below ₦20,000: no interest');
        self::assertStringContainsString('You earned ₦800 interest', (string) $this->db->scalar("SELECT title FROM notifications WHERE user_id = ? AND type = 'interest'", [$saver]));

        try {
            $interest->run('2027-02');
            self::fail('A month must never be paid twice');
        } catch (AlreadyPaid) {
        }
        self::assertSame(4080000, $this->wallet($saver));

        // A crashed run is resumed safely: members already paid are skipped by their idempotency key.
        $this->db->run("UPDATE interest_runs SET status = 'failed' WHERE period = '2027-02'");
        $interest->run('2027-02');
        self::assertSame(4080000, $this->wallet($saver));

        $this->expectException(\App\Http\HttpError::class);
        $interest->run('2027-03'); // month not finished
    }

    public function testReferralPaysBothAfterTheFriendsFirstCompletedOrderAndBlocksRepeatDevices(): void
    {
        $guest = $this->guestId();
        $before = $this->wallet($guest);
        $first = $this->referredFriendCompletesOrder('ada.friend@example.com', '08091112222', 'device-aaaaaaaaaaaaaaaa');
        self::assertSame($before + 200000, $this->wallet($guest), '₦2,000 for the referrer');
        self::assertSame(200000, $this->wallet($first), '₦2,000 for the friend');

        $second = $this->referredFriendCompletesOrder('ada.again@example.com', '08093334444', 'device-aaaaaaaaaaaaaaaa');
        self::assertSame(0, $this->wallet($second));
        self::assertSame('Device already used for a referral', $this->db->scalar('SELECT reject_reason FROM referrals WHERE referred_user_id = ?', [$second]));
        self::assertSame($before + 200000, $this->wallet($guest));
    }

    public function testDailyJobsExpirePointsWarnAndRewardBirthdaysOnce(): void
    {
        $ledger = $this->c->get(Ledger::class);
        $idle = $this->newMember('idle@example.com');
        $quiet = $this->newMember('quiet@example.com');
        $ledger->points($idle, 'credit', 'earn', 400, 'Old points');
        $ledger->points($quiet, 'credit', 'earn', 300, 'Old points');
        $this->db->run("UPDATE loyalty_accounts SET last_activity_at = '2025-10-01 12:00:00' WHERE user_id = ?", [$idle]);
        $this->db->run("UPDATE loyalty_accounts SET last_activity_at = '2025-11-05 12:00:00' WHERE user_id = ?", [$quiet]);
        $this->db->run("UPDATE users SET birthday = '1990-10-20' WHERE id = ?", [$quiet]);

        $jobs = $this->c->get(LoyaltyJobs::class);
        $report = $jobs->daily();
        self::assertSame(0, $this->points($idle), 'Expired after 12 months without activity');
        self::assertSame(300, $this->points($quiet), 'Warned, not expired');
        self::assertNotNull($this->db->scalar('SELECT points_expiry_warned_at FROM loyalty_accounts WHERE user_id = ?', [$quiet]));
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM reward_vouchers WHERE user_id = ? AND source = 'birthday'", [$quiet]));
        self::assertIsArray($report['pointsExpiry']);

        $jobs->daily();
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM reward_vouchers WHERE user_id = ? AND source = 'birthday'", [$quiet]), 'Once a year');
        self::assertSame(1, (int) $this->db->scalar("SELECT COUNT(*) FROM points_ledger WHERE user_id = ? AND entry_type = 'expire'", [$idle]));
        self::assertTrue($ledger->reconcile($idle)['ok']);
    }

    public function testLedgersAreAppendOnly(): void
    {
        $this->expectException(\PDOException::class);
        $this->db->run('UPDATE wallet_ledger SET amount_kobo = 1 WHERE user_id = ?', [$this->guestId()]);
    }

    public function testNotificationCentre(): void
    {
        $headers = $this->signInGuest();
        $this->c->get(\App\Loyalty\Notifier::class)->notify($this->guestId(), 'offer', 'Hello', 'A test offer');
        [, $list] = $this->request('GET', '/api/account/notifications');
        self::assertGreaterThanOrEqual(1, $list['unread']);
        self::assertSame('Hello', $list['items'][0]['title']);
        [, $after] = $this->request('POST', '/api/account/notifications/read', [], $headers);
        self::assertSame(0, $after['unread']);
    }

    /* ---------------------------------------------------------------- helpers */

    private function newMember(string $email): int
    {
        $id = $this->db->insert('users', [
            'role' => 'customer', 'first_name' => 'Test', 'last_name' => 'Member', 'email' => $email,
            'password_hash' => 'x', 'email_verified_at' => '2025-01-01 00:00:00', 'created_at' => '2025-01-01 00:00:00',
        ]);
        $this->db->insert('loyalty_accounts', ['user_id' => $id]);
        return $id;
    }

    private function referredFriendCompletesOrder(string $email, string $phone, string $device): int
    {
        $this->session->destroy();
        [$res, $reg] = $this->request('POST', '/api/auth/register', [
            'first_name' => 'Ada', 'last_name' => 'Friend', 'email' => $email, 'phone' => $phone,
            'password' => 'Lagos-Table-2026!x', 'referral_code' => 'GUEST2026', 'device_id' => $device, 'accept_terms' => true,
        ], $this->spaHeaders());
        self::assertSame(201, $res->getStatusCode(), json_encode($reg));
        $id = (int) $reg['user']['id'];
        $this->db->run('UPDATE users SET email_verified_at = ? WHERE id = ?', ['2026-10-20 12:00:00', $id]);
        $headers = ['X-CSRF-Token' => $reg['csrfToken'], 'Origin' => 'http://localhost:5173'];
        [, $placed] = $this->request('POST', '/api/orders', $this->order(['email' => $email, 'name' => 'Ada Friend', 'phone' => $phone]), $headers + ['Idempotency-Key' => $this->key()]);
        $ref = $placed['order']['reference'];
        $this->simulate($ref, 'success');
        foreach (['preparing', 'ready', 'completed'] as $s) {
            $this->c->get(OrderService::class)->updateStatus($ref, $s, null);
        }
        return $id;
    }
}
