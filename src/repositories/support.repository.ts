import type { SupportMessageAuthor, SupportTicketStatus } from "@domain/enums";
import type { SupportMessage, SupportTicket } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";

const SUPPORT_TICKET_SELECT = `SELECT
  id,
  user_id AS userId,
  status,
  subject,
  priority,
  assigned_admin_id AS assignedAdminId,
  created_at AS createdAt,
  updated_at AS updatedAt,
  resolved_at AS resolvedAt
FROM support_tickets`;

export class SupportRepository {
  constructor(private readonly db: D1Runner) {}

  async findActiveByUserId(userId: string): Promise<SupportTicket | null> {
    return this.db.first<SupportTicket>(
      `${SUPPORT_TICKET_SELECT} WHERE user_id = ? AND status IN ('open', 'in_progress', 'waiting_user') LIMIT 1`,
      [userId],
    );
  }

  async listByUserId(userId: string, limit = 20): Promise<SupportTicket[]> {
    return this.db.all<SupportTicket>(
      `${SUPPORT_TICKET_SELECT} WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit],
    );
  }

  async createTicket(input: {
    userId: string;
    subject: string;
    priority: "normal" | "high";
    message: string;
    now: string;
  }): Promise<SupportTicket> {
    const ticketId = createId("tkt");
    await this.db.run(
      `INSERT INTO support_tickets (
        id, user_id, status, subject, priority, assigned_admin_id, created_at, updated_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, input.userId, "open", input.subject, input.priority, null, input.now, input.now, null],
    );

    await this.addMessage({
      ticketId,
      authorType: "user",
      authorUserId: input.userId,
      messageText: input.message,
      now: input.now,
    });

    return (await this.db.first<SupportTicket>(`${SUPPORT_TICKET_SELECT} WHERE id = ?`, [ticketId])) as SupportTicket;
  }

  async addMessage(input: {
    ticketId: string;
    authorType: SupportMessageAuthor;
    authorUserId: string | null;
    messageText: string;
    now: string;
  }): Promise<SupportMessage> {
    const id = createId("tmsg");
    await this.db.run(
      `INSERT INTO support_messages (id, ticket_id, author_type, author_user_id, message_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.ticketId, input.authorType, input.authorUserId, input.messageText, input.now],
    );
    await this.db.run("UPDATE support_tickets SET updated_at = ? WHERE id = ?", [input.now, input.ticketId]);

    return {
      id,
      ticketId: input.ticketId,
      authorType: input.authorType,
      authorUserId: input.authorUserId,
      messageText: input.messageText,
      createdAt: input.now,
    };
  }

  async updateStatus(ticketId: string, status: SupportTicketStatus, now: string): Promise<void> {
    await this.db.run(
      `UPDATE support_tickets
       SET status = ?, updated_at = ?, resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN ? ELSE resolved_at END
       WHERE id = ?`,
      [status, now, status, now, ticketId],
    );
  }
}
