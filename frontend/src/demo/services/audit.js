import { db } from '../db';

/** The audit trail (AuditLogger): every admin action in the demo is recorded like the real thing. */
export function audit(
  actorId: number | null,
  action: string,
  entityType: string | null = null,
  entityId: string | number | null = null,
  meta: Record<string, unknown> | null = null,
): void {
  db.insert('audit_logs', {
    actor_user_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId === null ? null : String(entityId),
    meta: meta ? JSON.stringify(meta) : null,
    ip: '127.0.0.1',
  });
}
