<?php

declare(strict_types=1);

namespace App\Loyalty;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Http\ValidationError;
use App\Payments\PaymentAttempts;
use App\Security\Crypto;
use App\Security\RateLimiter;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Settings;

/**
 * Dining-wallet top-ups through Paystack. Credit (and any top-up bonus) is added only after
 * the server has verified the payment with Paystack, exactly once per top-up.
 */
final class WalletService
{
    public function __construct(
        private Database $db,
        private Settings $settings,
        private Ledger $ledger,
        private PaymentAttempts $attempts,
        private Notifier $notifier,
        private RateLimiter $limiter,
        private AuditLogger $audit,
        private Clock $clock,
        private string $frontendUrl,
    ) {
    }

    /**
     * @param array<string, mixed> $user
     * @return array{topup: array<string, mixed>, payment: array<string, mixed>}
     */
    public function startTopup(array $user, int $amountKobo, ?string $idempotencyKey): array
    {
        $userId = (int) $user['id'];
        if ($user['email_verified_at'] === null) {
            throw HttpError::forbidden('Please confirm your email address before topping up your wallet.');
        }
        if ($idempotencyKey !== null && !preg_match('/^[A-Za-z0-9_-]{16,80}$/', $idempotencyKey)) {
            throw HttpError::badRequest('Invalid Idempotency-Key header.');
        }
        $rules = new LoyaltyRules($this->settings->group('loyalty'));
        $limits = $rules->topupLimits();
        if ($amountKobo < $limits['min'] || $amountKobo > $limits['max']) {
            throw ValidationError::field('amount', sprintf('Top-ups must be between %s and %s.', Notifier::naira($limits['min']), Notifier::naira($limits['max'])));
        }
        if ($amountKobo % 100 !== 0) {
            throw ValidationError::field('amount', 'Please top up in whole naira.');
        }

        $topup = $idempotencyKey !== null
            ? $this->db->one('SELECT * FROM wallet_topups WHERE user_id = ? AND idempotency_key = ?', [$userId, $idempotencyKey])
            : null;
        if ($topup === null) {
            $this->limiter->hit("topup:uid:{$userId}", 10, 3600);
            do {
                $reference = Crypto::code(6, 'TU-');
            } while ($this->db->scalar('SELECT 1 FROM wallet_topups WHERE reference = ?', [$reference]));
            $id = $this->db->insert('wallet_topups', [
                'reference' => $reference,
                'user_id' => $userId,
                'amount_kobo' => $amountKobo,
                'bonus_kobo' => $rules->topupBonus($amountKobo),
                'idempotency_key' => $idempotencyKey,
                'created_at' => $this->clock->sql(),
            ]);
            $topup = $this->db->one('SELECT * FROM wallet_topups WHERE id = ?', [$id]) ?? [];
        }
        if ($topup['status'] === 'paid') {
            return ['topup' => $this->toPublic($topup), 'payment' => null];
        }
        $payment = $this->attempts->start(
            'wallet_topup', (int) $topup['id'], $userId, $topup['reference'], (int) $topup['amount_kobo'], $user['email'],
            ['topup_reference' => $topup['reference']],
            "{$this->frontendUrl}/account?tab=rewards&topup={$topup['reference']}",
        );
        return ['topup' => $this->toPublic($topup), 'payment' => $payment];
    }

    /**
     * Server-side verification. Safe to call any number of times (browser, webhook, retries).
     *
     * @return array<string, mixed> public top-up
     */
    public function verify(string $reference, ?int $userId): array
    {
        $topup = $this->db->one('SELECT * FROM wallet_topups WHERE reference = ?', [$reference]);
        if (!$topup || ($userId !== null && (int) $topup['user_id'] !== $userId)) {
            throw HttpError::notFound('We couldn’t find that top-up.');
        }
        if ($topup['status'] !== 'paid') {
            $payment = $this->attempts->latest('wallet_topup', (int) $topup['id']);
            if ($payment && $payment['status'] !== 'success') {
                $result = $this->attempts->check($payment);
                if ($result['status'] === 'success') {
                    $this->credit($payment['reference'], $result);
                } elseif ($result['status'] === 'failed') {
                    $this->db->run("UPDATE wallet_topups SET status = 'failed' WHERE id = ? AND status = 'pending'", [$topup['id']]);
                }
            }
        }
        return $this->toPublic($this->db->one('SELECT * FROM wallet_topups WHERE id = ?', [$topup['id']]) ?? $topup);
    }

    /** @param array{status: string, amountKobo: int, currency: string, paidAt: ?string, raw: array<string, mixed>} $result */
    public function credit(string $paymentReference, array $result): void
    {
        $topup = $this->db->transaction(function () use ($paymentReference, $result): ?array {
            $now = $this->clock->sql();
            if (!$this->attempts->markSuccess($paymentReference, $result, $now)) {
                return null;
            }
            $payment = $this->attempts->byReference($paymentReference);
            $topup = $this->db->one('SELECT * FROM wallet_topups WHERE id = ? FOR UPDATE', [$payment['payable_id']]);
            if (!$topup || $topup['status'] === 'paid') {
                return null;
            }
            $userId = (int) $topup['user_id'];
            $amount = (int) $topup['amount_kobo'];
            $bonus = (int) $topup['bonus_kobo'];
            $this->ledger->wallet($userId, 'credit', 'topup', $amount, 'Wallet top-up', $topup['reference'], "topup:{$topup['reference']}");
            if ($bonus > 0) {
                $pct = rtrim(rtrim(number_format($bonus * 100 / $amount, 1), '0'), '.');
                $this->ledger->wallet($userId, 'credit', 'topup_bonus', $bonus, "Top-up bonus ({$pct}%)", $topup['reference'], "topup-bonus:{$topup['reference']}");
            }
            $this->db->run("UPDATE wallet_topups SET status = 'paid', paid_at = ? WHERE id = ?", [$now, $topup['id']]);
            $this->db->run('UPDATE loyalty_accounts SET last_activity_at = ? WHERE user_id = ?', [$now, $userId]);
            return $topup;
        });
        if ($topup === null) {
            return;
        }
        $userId = (int) $topup['user_id'];
        $total = (int) $topup['amount_kobo'] + (int) $topup['bonus_kobo'];
        $this->audit->record($userId, 'wallet.topup', 'wallet_topup', $topup['reference'], ['amount_kobo' => (int) $topup['amount_kobo'], 'bonus_kobo' => (int) $topup['bonus_kobo']]);
        $bonusText = (int) $topup['bonus_kobo'] > 0 ? ' including a ' . Notifier::naira((int) $topup['bonus_kobo']) . ' bonus' : '';
        $this->notifier->notify($userId, 'topup', Notifier::naira($total) . ' added to your wallet', 'Your top-up' . $bonusText . ' is ready to spend at Small Africa.', ['reference' => $topup['reference']], [
            'subject' => 'Wallet topped up — Small Africa',
            'heading' => Notifier::naira($total) . ' of dining credit added',
            'body' => 'Thank you! Your top-up of ' . Notifier::naira((int) $topup['amount_kobo']) . $bonusText . ' is in your Interest Account. Keep a balance of '
                . Notifier::naira((int) ($this->settings->get('loyalty', 'interest_min_balance_naira', 20000)) * 100) . ' or more through a whole month to earn interest as dining credit.',
        ]);
    }

    /** @param array<string, mixed> $t */
    private function toPublic(array $t): array
    {
        return [
            'reference' => $t['reference'],
            'amountKobo' => (int) $t['amount_kobo'],
            'bonusKobo' => (int) $t['bonus_kobo'],
            'status' => $t['status'],
            'paidAt' => $t['paid_at'],
        ];
    }
}
