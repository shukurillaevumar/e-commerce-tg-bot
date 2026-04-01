import type { FraudRiskLevel, UserSegment } from "@domain/enums";
import type { User } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";

interface UserRow extends Omit<User, "telegramId" | "isBot" | "suspicious" | "allowlisted" | "denylisted"> {
  telegramId: number;
  isBot: number;
  suspicious: number;
  allowlisted: number;
  denylisted: number;
}

const USER_SELECT = `SELECT
  id,
  telegram_id AS telegramId,
  username,
  first_name AS firstName,
  last_name AS lastName,
  language_code AS languageCode,
  is_bot AS isBot,
  risk_level AS riskLevel,
  suspicious,
  allowlisted,
  denylisted,
  referred_by_user_id AS referredByUserId,
  referral_code AS referralCode,
  active_ticket_id AS activeTicketId,
  segment,
  created_at AS createdAt,
  updated_at AS updatedAt,
  last_seen_at AS lastSeenAt
FROM users`;

function mapUser(row: UserRow | null): User | null {
  if (!row) {
    return null;
  }
  return {
    ...row,
    isBot: Boolean(row.isBot),
    suspicious: Boolean(row.suspicious),
    allowlisted: Boolean(row.allowlisted),
    denylisted: Boolean(row.denylisted),
  };
}

export class UsersRepository {
  constructor(private readonly db: D1Runner) {}

  async findByTelegramId(telegramId: number): Promise<User | null> {
    const row = await this.db.first<UserRow>(`${USER_SELECT} WHERE telegram_id = ?`, [telegramId]);
    return mapUser(row);
  }

  async findById(userId: string): Promise<User | null> {
    const row = await this.db.first<UserRow>(`${USER_SELECT} WHERE id = ?`, [userId]);
    return mapUser(row);
  }

  async createOrUpdateFromTelegramUser(input: {
    telegramId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    languageCode: string | null;
    isBot: boolean;
    referralCode: string;
    now: string;
  }): Promise<User> {
    const existing = await this.findByTelegramId(input.telegramId);
    if (existing) {
      await this.db.run(
        `UPDATE users
         SET username = ?, first_name = ?, last_name = ?, language_code = ?, is_bot = ?, last_seen_at = ?, updated_at = ?
         WHERE telegram_id = ?`,
        [
          input.username,
          input.firstName,
          input.lastName,
          input.languageCode,
          input.isBot ? 1 : 0,
          input.now,
          input.now,
          input.telegramId,
        ],
      );
      return (await this.findByTelegramId(input.telegramId)) as User;
    }

    const id = createId("usr");
    await this.db.run(
      `INSERT INTO users (
        id, telegram_id, username, first_name, last_name, language_code, is_bot,
        risk_level, suspicious, allowlisted, denylisted, referred_by_user_id, referral_code,
        active_ticket_id, segment, created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.telegramId,
        input.username,
        input.firstName,
        input.lastName,
        input.languageCode,
        input.isBot ? 1 : 0,
        "low",
        0,
        0,
        0,
        null,
        input.referralCode,
        null,
        "new",
        input.now,
        input.now,
        input.now,
      ],
    );

    return (await this.findByTelegramId(input.telegramId)) as User;
  }

  async updateRiskState(userId: string, riskLevel: FraudRiskLevel, suspicious: boolean, now: string): Promise<void> {
    await this.db.run(
      "UPDATE users SET risk_level = ?, suspicious = ?, updated_at = ? WHERE id = ?",
      [riskLevel, suspicious ? 1 : 0, now, userId],
    );
  }

  async setListFlags(
    userId: string,
    flags: {
      allowlisted?: boolean;
      denylisted?: boolean;
      suspicious?: boolean;
      riskLevel?: FraudRiskLevel;
      segment?: UserSegment;
    },
    now: string,
  ): Promise<void> {
    const current = await this.findById(userId);
    if (!current) {
      return;
    }

    await this.db.run(
      `UPDATE users
       SET allowlisted = ?, denylisted = ?, suspicious = ?, risk_level = ?, segment = ?, updated_at = ?
       WHERE id = ?`,
      [
        (flags.allowlisted ?? current.allowlisted) ? 1 : 0,
        (flags.denylisted ?? current.denylisted) ? 1 : 0,
        (flags.suspicious ?? current.suspicious) ? 1 : 0,
        flags.riskLevel ?? current.riskLevel,
        flags.segment ?? current.segment,
        now,
        userId,
      ],
    );
  }

  async setActiveTicket(userId: string, ticketId: string | null, now: string): Promise<void> {
    await this.db.run("UPDATE users SET active_ticket_id = ?, updated_at = ? WHERE id = ?", [ticketId, now, userId]);
  }
}
