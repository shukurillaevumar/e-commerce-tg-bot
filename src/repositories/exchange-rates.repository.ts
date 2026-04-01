import type { ExchangeRate } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";

interface ExchangeRateRow extends Omit<ExchangeRate, "isCurrent"> {
  isCurrent: number;
}

const EXCHANGE_RATE_SELECT = `SELECT
  id,
  version,
  rate_rub_per_star AS rateRubPerStar,
  source,
  comment,
  created_by_admin_id AS createdByAdminId,
  created_at AS createdAt,
  is_current AS isCurrent
FROM exchange_rates`;

function mapExchangeRate(row: ExchangeRateRow | null): ExchangeRate | null {
  if (!row) {
    return null;
  }
  return {
    ...row,
    isCurrent: Boolean(row.isCurrent),
  };
}

export class ExchangeRatesRepository {
  constructor(private readonly db: D1Runner) {}

  async getCurrent(): Promise<ExchangeRate | null> {
    const row = await this.db.first<ExchangeRateRow>(`${EXCHANGE_RATE_SELECT} WHERE is_current = 1 ORDER BY version DESC LIMIT 1`);
    return mapExchangeRate(row);
  }

  async getHistory(limit = 20): Promise<ExchangeRate[]> {
    const rows = await this.db.all<ExchangeRateRow>(`${EXCHANGE_RATE_SELECT} ORDER BY version DESC LIMIT ?`, [limit]);
    return rows.map((row) => mapExchangeRate(row) as ExchangeRate);
  }

  async create(input: {
    version: number;
    rateRubPerStar: number;
    comment: string | null;
    createdByAdminId: string;
    now: string;
  }): Promise<string> {
    const id = createId("rate");
    await this.db.run("UPDATE exchange_rates SET is_current = 0 WHERE is_current = 1");
    await this.db.run(
      `INSERT INTO exchange_rates (
        id, version, rate_rub_per_star, source, comment, created_by_admin_id, created_at, is_current
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.version, input.rateRubPerStar, "manual", input.comment, input.createdByAdminId, input.now, 1],
    );
    return id;
  }
}
