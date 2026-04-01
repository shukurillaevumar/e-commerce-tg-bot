import type { OrderCancellationReason, OrderReviewStatus, OrderStatus } from "@domain/enums";
import type { Order, PricingSnapshot } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId, createPublicOrderId } from "@infra/ids";
import { decodeJson, encodeJson } from "@repositories/helpers";

interface OrderRow extends Omit<Order, "pricingSnapshot" | "requiresManualReview"> {
  pricingSnapshot: string;
  requiresManualReview: number;
}

const ORDER_SELECT = `SELECT
  id,
  public_id AS publicId,
  user_id AS userId,
  product_id AS productId,
  product_variant_id AS productVariantId,
  status,
  review_status AS reviewStatus,
  cancellation_reason AS cancellationReason,
  retry_count AS retryCount,
  invoice_slug AS invoiceSlug,
  invoice_message_id AS invoiceMessageId,
  invoice_sent_at AS invoiceSentAt,
  invoice_expires_at AS invoiceExpiresAt,
  paid_at AS paidAt,
  processing_started_at AS processingStartedAt,
  completed_at AS completedAt,
  failed_at AS failedAt,
  pricing_snapshot AS pricingSnapshot,
  campaign_source AS campaignSource,
  referral_id AS referralId,
  promo_code_id AS promoCodeId,
  requires_manual_review AS requiresManualReview,
  notes,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM orders`;

function mapOrder(row: OrderRow | null): Order | null {
  if (!row) {
    return null;
  }
  return {
    ...row,
    pricingSnapshot: decodeJson<PricingSnapshot>(row.pricingSnapshot, {} as PricingSnapshot),
    requiresManualReview: Boolean(row.requiresManualReview),
  };
}

export class OrdersRepository {
  constructor(private readonly db: D1Runner) {}

  async create(input: {
    userId: string;
    productId: string;
    productVariantId: string;
    pricingSnapshot: PricingSnapshot;
    reviewStatus: OrderReviewStatus;
    requiresManualReview: boolean;
    campaignSource: string | null;
    referralId: string | null;
    promoCodeId: string | null;
    now: string;
  }): Promise<Order> {
    const id = createId("ord");
    await this.db.run(
      `INSERT INTO orders (
        id, public_id, user_id, product_id, product_variant_id, status, review_status, cancellation_reason,
        retry_count, invoice_slug, invoice_message_id, invoice_sent_at, invoice_expires_at, paid_at,
        processing_started_at, completed_at, failed_at, pricing_snapshot, campaign_source, referral_id,
        promo_code_id, requires_manual_review, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        createPublicOrderId(),
        input.userId,
        input.productId,
        input.productVariantId,
        "created",
        input.reviewStatus,
        null,
        0,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        encodeJson(input.pricingSnapshot),
        input.campaignSource,
        input.referralId,
        input.promoCodeId,
        input.requiresManualReview ? 1 : 0,
        null,
        input.now,
        input.now,
      ],
    );
    return (await this.findById(id)) as Order;
  }

  async findById(orderId: string): Promise<Order | null> {
    const row = await this.db.first<OrderRow>(`${ORDER_SELECT} WHERE id = ?`, [orderId]);
    return mapOrder(row);
  }

  async findByInvoiceSlug(invoiceSlug: string): Promise<Order | null> {
    const row = await this.db.first<OrderRow>(`${ORDER_SELECT} WHERE invoice_slug = ?`, [invoiceSlug]);
    return mapOrder(row);
  }

  async listByUserId(userId: string, limit = 20): Promise<Order[]> {
    const rows = await this.db.all<OrderRow>(
      `${ORDER_SELECT} WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit],
    );
    return rows.map((row) => mapOrder(row) as Order);
  }

  async listExpiringInvoices(now: string, limit = 50): Promise<Order[]> {
    const rows = await this.db.all<OrderRow>(
      `${ORDER_SELECT}
       WHERE status = 'invoice_sent' AND invoice_expires_at IS NOT NULL AND invoice_expires_at <= ?
       ORDER BY invoice_expires_at ASC
       LIMIT ?`,
      [now, limit],
    );
    return rows.map((row) => mapOrder(row) as Order);
  }

  async listManualReview(limit = 50): Promise<Order[]> {
    const rows = await this.db.all<OrderRow>(
      `${ORDER_SELECT}
       WHERE requires_manual_review = 1 AND status IN ('created', 'paid', 'processing')
       ORDER BY created_at ASC
       LIMIT ?`,
      [limit],
    );
    return rows.map((row) => mapOrder(row) as Order);
  }

  async setInvoice(orderId: string, input: {
    invoiceSlug: string;
    invoiceMessageId: number | null;
    invoiceSentAt: string;
    invoiceExpiresAt: string;
    retryCount: number;
    updatedAt: string;
  }): Promise<void> {
    await this.db.run(
      `UPDATE orders
       SET status = 'invoice_sent', invoice_slug = ?, invoice_message_id = ?, invoice_sent_at = ?, invoice_expires_at = ?,
           retry_count = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.invoiceSlug,
        input.invoiceMessageId,
        input.invoiceSentAt,
        input.invoiceExpiresAt,
        input.retryCount,
        input.updatedAt,
        orderId,
      ],
    );
  }

  async transitionStatus(orderId: string, to: OrderStatus, now: string): Promise<void> {
    await this.db.run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", [to, now, orderId]);
  }

  async markPaid(orderId: string, now: string): Promise<void> {
    await this.db.run("UPDATE orders SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?", [now, now, orderId]);
  }

  async markProcessing(orderId: string, now: string): Promise<void> {
    await this.db.run(
      "UPDATE orders SET status = 'processing', processing_started_at = ?, updated_at = ? WHERE id = ?",
      [now, now, orderId],
    );
  }

  async markCompleted(orderId: string, now: string): Promise<void> {
    await this.db.run("UPDATE orders SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?", [
      now,
      now,
      orderId,
    ]);
  }

  async markFailed(orderId: string, now: string, notes?: string): Promise<void> {
    await this.db.run(
      "UPDATE orders SET status = 'failed', failed_at = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?",
      [now, notes ?? null, now, orderId],
    );
  }

  async cancel(orderId: string, reason: OrderCancellationReason, now: string): Promise<void> {
    await this.db.run("UPDATE orders SET status = 'cancelled', cancellation_reason = ?, updated_at = ? WHERE id = ?", [
      reason,
      now,
      orderId,
    ]);
  }

  async replacePricingSnapshot(orderId: string, pricingSnapshot: PricingSnapshot, now: string): Promise<void> {
    await this.db.run(
      `UPDATE orders
       SET pricing_snapshot = ?, invoice_slug = NULL, invoice_message_id = NULL, invoice_sent_at = NULL,
           invoice_expires_at = NULL, status = 'created', updated_at = ?
       WHERE id = ?`,
      [encodeJson(pricingSnapshot), now, orderId],
    );
  }

  async setReviewStatus(orderId: string, reviewStatus: OrderReviewStatus, requiresManualReview: boolean, now: string): Promise<void> {
    await this.db.run(
      "UPDATE orders SET review_status = ?, requires_manual_review = ?, updated_at = ? WHERE id = ?",
      [reviewStatus, requiresManualReview ? 1 : 0, now, orderId],
    );
  }
}
