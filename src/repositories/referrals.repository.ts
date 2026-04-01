import type { Referral } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";

const REFERRAL_SELECT = `SELECT
  id,
  referrer_user_id AS referrerUserId,
  referred_user_id AS referredUserId,
  start_parameter AS startParameter,
  first_order_id AS firstOrderId,
  reward_granted_at AS rewardGrantedAt,
  created_at AS createdAt
FROM referrals`;

export class ReferralsRepository {
  constructor(private readonly db: D1Runner) {}

  async findByStartParameter(startParameter: string): Promise<Referral | null> {
    return this.db.first<Referral>(`${REFERRAL_SELECT} WHERE start_parameter = ?`, [startParameter]);
  }

  async findByReferredUserId(referredUserId: string): Promise<Referral | null> {
    return this.db.first<Referral>(`${REFERRAL_SELECT} WHERE referred_user_id = ?`, [referredUserId]);
  }

  async create(input: {
    referrerUserId: string;
    referredUserId: string;
    startParameter: string;
    now: string;
  }): Promise<Referral> {
    const id = createId("ref");
    await this.db.run(
      `INSERT INTO referrals (
        id, referrer_user_id, referred_user_id, start_parameter, first_order_id, reward_granted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.referrerUserId, input.referredUserId, input.startParameter, null, null, input.now],
    );

    return {
      id,
      referrerUserId: input.referrerUserId,
      referredUserId: input.referredUserId,
      startParameter: input.startParameter,
      firstOrderId: null,
      rewardGrantedAt: null,
      createdAt: input.now,
    };
  }
}
