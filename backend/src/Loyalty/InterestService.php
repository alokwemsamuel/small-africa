<?php

declare(strict_types=1);

namespace App\Loyalty;

use App\Audit\AuditLogger;
use App\Http\HttpError;
use App\Support\Clock;
use App\Support\Database;
use App\Support\Logger;
use App\Support\Settings;

/**
 * Monthly "interest" paid as dining credit on the lowest wallet balance held through the
 * month. Never pays twice:
 *  - interest_runs has one row per month (unique period) that a run must claim first;
 *  - every credit carries the idempotency key interest:{period}:{user}, so a run that
 *    crashed halfway can simply be re-run and only finishes the members it missed.
 */
final class InterestService
{
    private const STALE_RUN_MINUTES = 30;

    public function __construct(
        private Database $db,
        private Settings $settings,
        private Ledger $ledger,
        private Notifier $notifier,
        private AuditLogger $audit,
        private Clock $clock,
        private Logger $logger,
    ) {
    }

    /**
     * @param 'cron'|'admin'|'demo' $trigger demo may run the current month to date (never in production)
     * @return array{period: string, status: string, accountsCredited: int, totalKobo: int}
     */
    public function run(string $period, string $trigger = 'cron', ?int $actorId = null): array
    {
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) {
            throw HttpError::badRequest('Period must look like 2026-10.');
        }
        $start = new \DateTimeImmutable("{$period}-01 00:00:00", Clock::zone());
        $end = $start->modify('+1 month');
        $now = $this->clock->now();
        if ($start > $now) {
            throw HttpError::badRequest('That month hasn’t started yet.');
        }
        if ($end > $now && $trigger !== 'demo') {
            throw HttpError::badRequest('Interest is paid after the month ends.');
        }
        $until = min($end, $now);

        $this->claim($period, $trigger, $actorId);
        try {
            $rules = new LoyaltyRules($this->settings->group('loyalty'));
            $label = $start->format('F Y');
            $members = $this->db->all(
                "SELECT u.id FROM users u JOIN loyalty_accounts a ON a.user_id = u.id
                 WHERE u.role = 'customer' AND u.is_active = 1 AND u.created_at < ? ORDER BY u.id",
                [$this->clock->sql($until)],
            );
            foreach ($members as $m) {
                $userId = (int) $m['id'];
                $lowest = $this->ledger->lowestWalletBalance($userId, $this->clock->sql($start), $this->clock->sql($until));
                $interest = $rules->interest($lowest);
                if ($interest <= 0) {
                    continue;
                }
                $entry = $this->ledger->wallet($userId, 'credit', 'interest', $interest, "Interest for {$label} (dining credit)", $period, "interest:{$period}:{$userId}");
                if (!$entry['replayed']) {
                    $amount = Notifier::naira($interest);
                    $this->notifier->notify($userId, 'interest', "You earned {$amount} interest", "You earned {$amount} interest this month — come and enjoy it!", ['period' => $period], [
                        'subject' => "You earned {$amount} interest — Small Africa",
                        'heading' => "You earned {$amount} interest this month",
                        'body' => "Come and enjoy it! You kept " . Notifier::naira($lowest) . " or more in your dining wallet all through {$label}, so we’ve added {$amount} of dining credit to your Interest Account.",
                    ]);
                }
            }
            $totals = $this->db->one(
                "SELECT COUNT(*) AS n, COALESCE(SUM(amount_kobo), 0) AS total FROM wallet_ledger WHERE entry_type = 'interest' AND reference = ?",
                [$period],
            );
            $this->db->run(
                "UPDATE interest_runs SET status = 'completed', accounts_credited = ?, total_kobo = ?, finished_at = ?, error = NULL WHERE period = ?",
                [(int) $totals['n'], (int) $totals['total'], $this->clock->sql(), $period],
            );
        } catch (\Throwable $e) {
            $this->db->run("UPDATE interest_runs SET status = 'failed', error = ?, finished_at = ? WHERE period = ?", [mb_substr($e->getMessage(), 0, 500), $this->clock->sql(), $period]);
            $this->logger->error('Interest run failed', ['period' => $period, 'error' => $e->getMessage()]);
            throw $e;
        }
        $this->audit->record($actorId, 'loyalty.interest_run', 'interest_run', $period, ['trigger' => $trigger, 'accounts' => (int) $totals['n'], 'total_kobo' => (int) $totals['total']]);
        return ['period' => $period, 'status' => 'completed', 'accountsCredited' => (int) $totals['n'], 'totalKobo' => (int) $totals['total']];
    }

    /** The month most recently finished, e.g. "2026-09" on 1 October. */
    public function previousPeriod(): string
    {
        return $this->clock->now()->modify('first day of last month')->format('Y-m');
    }

    private function claim(string $period, string $trigger, ?int $actorId): void
    {
        $claimed = $this->db->transaction(function () use ($period, $trigger, $actorId): bool {
            $run = $this->db->one('SELECT * FROM interest_runs WHERE period = ? FOR UPDATE', [$period]);
            if ($run === null) {
                $this->db->insert('interest_runs', [
                    'period' => $period, 'status' => 'running', 'triggered_by' => $trigger, 'run_by_user_id' => $actorId, 'started_at' => $this->clock->sql(),
                ]);
                return true;
            }
            if ($run['status'] === 'completed') {
                return false;
            }
            $stale = $run['started_at'] < $this->clock->sql($this->clock->now()->modify('-' . self::STALE_RUN_MINUTES . ' minutes'));
            if ($run['status'] === 'running' && !$stale) {
                throw HttpError::conflict('Interest for that month is being paid right now.');
            }
            $this->db->run(
                "UPDATE interest_runs SET status = 'running', triggered_by = ?, run_by_user_id = ?, started_at = ?, error = NULL WHERE period = ?",
                [$trigger, $actorId, $this->clock->sql(), $period],
            );
            return true;
        });
        if (!$claimed) {
            throw new AlreadyPaid($period);
        }
    }
}
