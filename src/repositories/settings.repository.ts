import type { D1Runner } from "@infra/db";

export class SettingsRepository {
  private tableEnsured = false;

  constructor(private readonly db: D1Runner) {}

  private async ensureTable(): Promise<void> {
    if (this.tableEnsured) {
      return;
    }

    await this.db.run(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by_admin_id TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id)
      )`,
    );

    this.tableEnsured = true;
  }

  async get(key: string): Promise<string | null> {
    await this.ensureTable();
    const row = await this.db.first<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
    return row?.value ?? null;
  }

  async upsert(key: string, value: string, updatedByAdminId: string | null, now: string): Promise<void> {
    await this.ensureTable();
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
