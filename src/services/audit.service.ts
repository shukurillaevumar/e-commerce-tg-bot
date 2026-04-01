import type { AuditAction } from "@domain/enums";
import type { ServiceDeps } from "@services/types";

export class AuditService {
  constructor(private readonly deps: ServiceDeps) {}

  async log(input: {
    actorAdminId: string | null;
    actorUserId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    await this.deps.repositories.auditLogs.create({
      ...input,
      payload: input.payload ?? {},
      now,
    });
  }
}
