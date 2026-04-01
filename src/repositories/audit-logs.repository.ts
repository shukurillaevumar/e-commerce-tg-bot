import type { AuditAction } from "@domain/enums";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";
import { encodeJson } from "@repositories/helpers";

export class AuditLogsRepository {
  constructor(private readonly db: D1Runner) {}

  async create(input: {
    actorAdminId: string | null;
    actorUserId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    now: string;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO audit_logs (id, actor_admin_id, actor_user_id, action, entity_type, entity_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [createId("audit"), input.actorAdminId, input.actorUserId, input.action, input.entityType, input.entityId, encodeJson(input.payload), input.now],
    );
  }
}
