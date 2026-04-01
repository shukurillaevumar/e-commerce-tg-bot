import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";
import { decodeJson, encodeJson } from "@repositories/helpers";
import type { Admin } from "@domain/models";
import type { AdminRole } from "@domain/enums";

interface AdminRow extends Omit<Admin, "permissions" | "isActive"> {
  permissions: string;
  isActive: number;
}

const ADMIN_SELECT = `SELECT
  id,
  user_id AS userId,
  telegram_id AS telegramId,
  role,
  permissions,
  is_active AS isActive,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM admins`;

function mapAdmin(row: AdminRow | null): Admin | null {
  if (!row) {
    return null;
  }
  return {
    ...row,
    permissions: decodeJson<string[]>(row.permissions, []),
    isActive: Boolean(row.isActive),
  };
}

export class AdminsRepository {
  constructor(private readonly db: D1Runner) {}

  async findByTelegramId(telegramId: number): Promise<Admin | null> {
    const row = await this.db.first<AdminRow>(`${ADMIN_SELECT} WHERE telegram_id = ? AND is_active = 1`, [telegramId]);
    return mapAdmin(row);
  }

  async listActive(): Promise<Admin[]> {
    const rows = await this.db.all<AdminRow>(`${ADMIN_SELECT} WHERE is_active = 1 ORDER BY created_at ASC`);
    return rows.map((row) => mapAdmin(row) as Admin);
  }

  async bootstrapOwner(input: { userId: string; telegramId: number; permissions: string[]; now: string }): Promise<void> {
    const existing = await this.db.first<AdminRow>(`${ADMIN_SELECT} WHERE telegram_id = ?`, [input.telegramId]);
    if (existing) {
      return;
    }

    await this.db.run(
      `INSERT INTO admins (id, user_id, telegram_id, role, permissions, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [createId("adm"), input.userId, input.telegramId, "owner", encodeJson(input.permissions), 1, input.now, input.now],
    );
  }

  async upsertAdmin(input: {
    userId: string;
    telegramId: number;
    role: AdminRole;
    permissions: string[];
    isActive: boolean;
    now: string;
  }): Promise<void> {
    const existing = await this.db.first<AdminRow>(`${ADMIN_SELECT} WHERE telegram_id = ?`, [input.telegramId]);
    if (existing) {
      await this.db.run(
        `UPDATE admins
         SET user_id = ?, role = ?, permissions = ?, is_active = ?, updated_at = ?
         WHERE telegram_id = ?`,
        [input.userId, input.role, encodeJson(input.permissions), input.isActive ? 1 : 0, input.now, input.telegramId],
      );
      return;
    }

    await this.db.run(
      `INSERT INTO admins (id, user_id, telegram_id, role, permissions, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createId("adm"),
        input.userId,
        input.telegramId,
        input.role,
        encodeJson(input.permissions),
        input.isActive ? 1 : 0,
        input.now,
        input.now,
      ],
    );
  }
}
