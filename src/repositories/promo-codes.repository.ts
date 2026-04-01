import type { PromoCode, PromoRedemption } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";
import { decodeJson, encodeJson } from "@repositories/helpers";

interface PromoCodeRow extends Omit<PromoCode, "allowedSegments" | "isActive"> {
  allowedSegments: string;
  isActive: number;
}

const PROMO_CODE_SELECT = `SELECT
  id,
  code,
  type,
  value,
  is_active AS isActive,
  valid_from AS validFrom,
  valid_until AS validUntil,
  usage_limit_total AS usageLimitTotal,
  usage_limit_per_user AS usageLimitPerUser,
  product_id AS productId,
  product_variant_id AS productVariantId,
  allowed_segments AS allowedSegments,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM promo_codes`;

function mapPromoCode(row: PromoCodeRow | null): PromoCode | null {
  if (!row) {
    return null;
  }
  return {
    ...row,
    isActive: Boolean(row.isActive),
    allowedSegments: decodeJson<string[]>(row.allowedSegments, []),
  };
}

export class PromoCodesRepository {
  constructor(private readonly db: D1Runner) {}

  async findByCode(code: string): Promise<PromoCode | null> {
    const row = await this.db.first<PromoCodeRow>(`${PROMO_CODE_SELECT} WHERE code = ?`, [code.toUpperCase()]);
    return mapPromoCode(row);
  }

  async countUserAttempts(userId: string, promoCodeId: string): Promise<number> {
    const row = await this.db.first<{ total: number }>(
      "SELECT COUNT(*) AS total FROM promo_redemptions WHERE user_id = ? AND promo_code_id = ?",
      [userId, promoCodeId],
    );
    return Number(row?.total ?? 0);
  }

  async countRejectedAttempts(userId: string, since: string): Promise<number> {
    const row = await this.db.first<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM promo_redemptions
       WHERE user_id = ? AND status = 'rejected' AND created_at >= ?`,
      [userId, since],
    );
    return Number(row?.total ?? 0);
  }

  async createRedemption(input: {
    promoCodeId: string;
    userId: string;
    orderId: string | null;
    status: "applied" | "rejected";
    rejectionReason: string | null;
    now: string;
  }): Promise<PromoRedemption> {
    const id = createId("prmred");
    await this.db.run(
      `INSERT INTO promo_redemptions (id, promo_code_id, user_id, order_id, status, rejection_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.promoCodeId, input.userId, input.orderId, input.status, input.rejectionReason, input.now],
    );

    return {
      id,
      promoCodeId: input.promoCodeId,
      userId: input.userId,
      orderId: input.orderId,
      status: input.status,
      rejectionReason: input.rejectionReason,
      createdAt: input.now,
    };
  }

  async create(input: {
    code: string;
    type: PromoCode["type"];
    value: number;
    productId?: string | null;
    productVariantId?: string | null;
    allowedSegments?: string[];
    validFrom?: string | null;
    validUntil?: string | null;
    usageLimitTotal?: number | null;
    usageLimitPerUser?: number | null;
    now: string;
  }): Promise<string> {
    const id = createId("promo");
    await this.db.run(
      `INSERT INTO promo_codes (
        id, code, type, value, is_active, valid_from, valid_until, usage_limit_total, usage_limit_per_user,
        product_id, product_variant_id, allowed_segments, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.code.toUpperCase(),
        input.type,
        input.value,
        1,
        input.validFrom ?? null,
        input.validUntil ?? null,
        input.usageLimitTotal ?? null,
        input.usageLimitPerUser ?? null,
        input.productId ?? null,
        input.productVariantId ?? null,
        encodeJson(input.allowedSegments ?? []),
        input.now,
        input.now,
      ],
    );
    return id;
  }
}
