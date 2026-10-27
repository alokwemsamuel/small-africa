import { db } from '@/lib/demo/db';

/** The audit trail (AuditLogger): every admin action in the demo is recorded like the real thing. */
export function audit(actorId, action, entityType = null, entityId = null, meta = null) {
  db.insert('audit_logs', {
    actor_user_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId === null ? null : String(entityId),
    meta: meta ? JSON.stringify(meta) : null,
    ip: '127.0.0.1',
  });
}
