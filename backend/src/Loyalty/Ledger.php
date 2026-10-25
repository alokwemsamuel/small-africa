<?php

declare(strict_types=1);

namespace App\Loyalty;

use App\Http\HttpError;
use App\Support\Clock;
use App\Support\Database;

/**
 * The only code that moves dining credit or points. Each movement:
 *  - runs in a transaction and locks the member's loyalty_accounts row (FOR UPDATE),
 *  - appends one row to wallet_ledger / points_ledger (append-only, enforced by triggers),
 *  - updates the cached balance in the same transaction,
 *  - is idempotent: replaying an idempotency key returns the original entry and changes nothing.
 */
final class Ledger
{
    public function __construct(private Database $db, private Clock $clock)
    {
    }

    /**
     * @return array{id: int, balanceAfter: int, replayed: bool}
     */
    public function wallet(int $userId, string $direction, string $type, int $amountKobo, string $description, ?string $reference = null, ?string $idempotencyKey = null, ?int $actorId = null): array
    {
        return $this->move('wallet', $userId, $direction, $type, $amountKobo, $description, $reference, $idempotencyKey, $actorId);
    }

    /**
     * @return array{id: int, balanceAfter: int, replayed: bool}
     */
    public function points(int $userId, string $direction, string $type, int $points, string $description, ?string $reference = null, ?string $idempotencyKey = null, ?int $actorId = null): array
    {
        return $this->move('points', $userId, $direction, $type, $points, $description, $reference, $idempotencyKey, $actorId);
    }

    /**
     * Locks and returns the member's account, creating it for members who signed up before
     * the Interest Account existed.
     *
     * @return array<string, mixed>
     */
    public function lockAccount(int $userId): array
    {
        $account = $this->db->one('SELECT * FROM loyalty_accounts WHERE user_id = ? FOR UPDATE', [$userId]);
        if ($account === null) {
            $this->db->run('INSERT IGNORE INTO loyalty_accounts (user_id) VALUES (?)', [$userId]);
            $account = $this->db->one('SELECT * FROM loyalty_accounts WHERE user_id = ? FOR UPDATE', [$userId]);
        }
        return $account ?? throw new \RuntimeException("No loyalty account for user {$userId}");
    }

    /**
     * The lowest wallet balance held between two instants: the opening balance, then every
     * balance the ledger passed through. Used for monthly interest ("held for the whole month").
     */
    public function lowestWalletBalance(int $userId, string $fromSql, string $toSql): int
    {
        $opening = $this->db->scalar(
            'SELECT balance_after_kobo FROM wallet_ledger WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 1',
            [$userId, $fromSql],
        );
        $lowestInside = $this->db->scalar(
            'SELECT MIN(balance_after_kobo) FROM wallet_ledger WHERE user_id = ? AND created_at >= ? AND created_at < ?',
            [$userId, $fromSql, $toSql],
        );
        $opening = $opening === null ? 0 : (int) $opening;
        return $lowestInside === null ? $opening : min($opening, (int) $lowestInside);
    }

    /**
     * Rebuilds balances from the ledgers and compares them with the cached values.
     *
     * @return array{walletLedger: int, walletCached: int, pointsLedger: int, pointsCached: int, ok: bool}
     */
    public function reconcile(int $userId): array
    {
        $wallet = (int) $this->db->scalar(
            "SELECT COALESCE(SUM(CASE direction WHEN 'credit' THEN amount_kobo ELSE -CAST(amount_kobo AS SIGNED) END), 0) FROM wallet_ledger WHERE user_id = ?",
            [$userId],
        );
        $points = (int) $this->db->scalar(
            "SELECT COALESCE(SUM(CASE direction WHEN 'credit' THEN points ELSE -CAST(points AS SIGNED) END), 0) FROM points_ledger WHERE user_id = ?",
            [$userId],
        );
        $account = $this->db->one('SELECT wallet_balance_kobo, points_balance FROM loyalty_accounts WHERE user_id = ?', [$userId]);
        $walletCached = (int) ($account['wallet_balance_kobo'] ?? 0);
        $pointsCached = (int) ($account['points_balance'] ?? 0);
        return [
            'walletLedger' => $wallet,
            'walletCached' => $walletCached,
            'pointsLedger' => $points,
            'pointsCached' => $pointsCached,
            'ok' => $wallet === $walletCached && $points === $pointsCached,
        ];
    }

    /** @return array{id: int, balanceAfter: int, replayed: bool} */
    private function move(string $kind, int $userId, string $direction, string $type, int $amount, string $description, ?string $reference, ?string $idempotencyKey, ?int $actorId): array
    {
        if ($amount <= 0) {
            throw new \InvalidArgumentException('Ledger amounts must be positive.');
        }
        if (!in_array($direction, ['credit', 'debit'], true)) {
            throw new \InvalidArgumentException('Direction must be credit or debit.');
        }
        [$table, $amountCol, $balanceCol, $cacheCol] = $kind === 'wallet'
            ? ['wallet_ledger', 'amount_kobo', 'balance_after_kobo', 'wallet_balance_kobo']
            : ['points_ledger', 'points', 'balance_after', 'points_balance'];

        return $this->db->transaction(function () use ($table, $amountCol, $balanceCol, $cacheCol, $kind, $userId, $direction, $type, $amount, $description, $reference, $idempotencyKey, $actorId): array {
            $account = $this->lockAccount($userId);
            if ($idempotencyKey !== null) {
                // Checked after taking the lock, so two concurrent replays can't both pass.
                $existing = $this->db->one("SELECT id, {$balanceCol} AS bal FROM {$table} WHERE idempotency_key = ?", [$idempotencyKey]);
                if ($existing) {
                    return ['id' => (int) $existing['id'], 'balanceAfter' => (int) $existing['bal'], 'replayed' => true];
                }
            }
            $balance = (int) $account[$cacheCol];
            $after = $direction === 'credit' ? $balance + $amount : $balance - $amount;
            if ($after < 0) {
                throw $kind === 'wallet'
                    ? HttpError::conflict('There isn’t enough dining credit in your wallet for that.')
                    : HttpError::conflict('You don’t have enough points for that.');
            }
            $id = $this->db->insert($table, [
                'user_id' => $userId,
                'entry_type' => $type,
                'direction' => $direction,
                $amountCol => $amount,
                $balanceCol => $after,
                'reference' => $reference,
                'description' => mb_substr($description, 0, 255),
                'idempotency_key' => $idempotencyKey,
                'created_by_user_id' => $actorId,
                'created_at' => $this->clock->sql(),
            ]);
            $this->db->run("UPDATE loyalty_accounts SET {$cacheCol} = ? WHERE user_id = ?", [$after, $userId]);
            return ['id' => $id, 'balanceAfter' => $after, 'replayed' => false];
        });
    }
}
