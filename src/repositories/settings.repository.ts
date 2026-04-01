import type { D1Runner } from "@infra/db";

export class SettingsRepository {
  constructor(private readonly db: D1Runner) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.first<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
    return row?.value ?? null;
  }

  async upsert(key: string, value: string, updatedByAdminId: string | null, now: string): Promise<void> {
    const existing = await this.get(key);
    if (existing === null) {
      await this.db.run(
        "INSERT INTO settings (key, value, updated_by_admin_id, updated_at) VALUES (?, ?, ?, ?)",
        [key, value, updatedByAdminId, now],
      );
      return;
    }

    await this.db.run("UPDATE settings SET value = ?, updated_by_admin_id = ?, updated_at = ? WHERE key = ?", [
      value,
      updatedByAdminId,
      now,
      key,
    ]);
  }
}
