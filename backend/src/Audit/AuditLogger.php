<?php

declare(strict_types=1);

namespace App\Audit;

use App\Support\Database;

/** Append-only audit trail (the table rejects UPDATE/DELETE via triggers). */
final class AuditLogger
{
    private ?string $ip = null;
    private ?string $userAgent = null;

    public function __construct(private Database $db)
    {
    }

    public function withRequestContext(?string $ip, ?string $userAgent): void
    {
        $this->ip = $ip;
        $this->userAgent = $userAgent !== null ? mb_substr($userAgent, 0, 255) : null;
    }

    /** @param array<string, mixed> $meta never include secrets, passwords or full card data */
    public function record(?int $actorId, string $action, ?string $entityType = null, int|string|null $entityId = null, array $meta = []): void
    {
        $this->db->insert('audit_logs', [
            'actor_user_id' => $actorId,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId === null ? null : (string) $entityId,
            'meta' => $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'ip' => $this->ip,
            'user_agent' => $this->userAgent,
        ]);
    }
}
