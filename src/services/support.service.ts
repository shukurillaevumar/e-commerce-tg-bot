import { ConflictError } from "@domain/errors";
import type { User } from "@domain/models";
import type { ServiceDeps } from "@services/types";

export class SupportService {
  constructor(private readonly deps: ServiceDeps) {}

  async createTicket(user: User, subject: string, message: string): Promise<void> {
    const existing = await this.deps.repositories.support.findActiveByUserId(user.id);
    if (existing) {
      throw new ConflictError("У вас уже есть активное обращение. Дождитесь ответа или продолжите в текущем тикете.");
    }

    const now = this.deps.clock.now().toISOString();
    const ticket = await this.deps.repositories.support.createTicket({
      userId: user.id,
      subject,
      priority: user.suspicious ? "high" : "normal",
      message,
      now,
    });
    await this.deps.repositories.users.setActiveTicket(user.id, ticket.id, now);
  }
}
