import type { AbuseEventType, FraudRiskLevel } from "@domain/enums";
import type { AbuseEvent } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";
import { decodeJson, encodeJson } from "@repositories/helpers";

interface AbuseEventRow extends Omit<AbuseEvent, "payload"> {
  payload: string;
}

const ABUSE_EVENT_SELECT = `SELECT
  id,
  user_id AS userId,
  event_type AS eventType,
  risk_level AS riskLevel,
  signal,
  payload,
  created_at AS createdAt
FROM abuse_events`;

export class AbuseEventsRepository {
  constructor(private readonly db: D1Runner) {}

  async create(input: {
    userId: string | null;
    eventType: AbuseEventType;
    riskLevel: FraudRiskLevel;
    signal: string;
    payload: Record<string, unknown>;
    now: string;
  }): Promise<void> {
    await this.db.run(
      `INSERT INTO abuse_events (id, user_id, event_type, risk_level, signal, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [createId("abuse"), input.userId, input.eventType, input.riskLevel, input.signal, encodeJson(input.payload), input.now],
    );
  }

  async listRecentByUserId(userId: string, since: string): Promise<AbuseEvent[]> {
    const rows = await this.db.all<AbuseEventRow>(
      `${ABUSE_EVENT_SELECT} WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC`,
      [userId, since],
    );
    return rows.map((row) => ({
      ...row,
      payload: decodeJson<Record<string, unknown>>(row.payload, {}),
    }));
  }
}
