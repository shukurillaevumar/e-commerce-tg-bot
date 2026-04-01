import type { PaymentStatus } from "@domain/enums";
import type { Payment, PricingSnapshot } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";
import { decodeJson, encodeJson } from "@repositories/helpers";

interface PaymentRow extends Omit<Payment, "providerData" | "pricingSnapshot"> {
  providerData: string;
  pricingSnapshot: string;
}

const PAYMENT_SELECT = `SELECT
  id,
  order_id AS orderId,
  user_id AS userId,
  telegram_payment_charge_id AS telegramPaymentChargeId,
  telegram_invoice_payload AS telegramInvoicePayload,
  telegram_currency AS telegramCurrency,
  amount_xtr AS amountXtr,
  status,
  provider_data AS providerData,
  idempotency_key AS idempotencyKey,
  pricing_snapshot AS pricingSnapshot,
  failure_code AS failureCode,
  failure_reason AS failureReason,
  created_at AS createdAt,
  updated_at AS updatedAt,
  succeeded_at AS succeededAt
FROM payments`;

function mapPayment(row: PaymentRow | null): Payment | null {
  if (!row) {
    return null;
  }

  return {
    ...row,
    providerData: decodeJson<Record<string, unknown>>(row.providerData, {}),
    pricingSnapshot: decodeJson<PricingSnapshot>(row.pricingSnapshot, {} as PricingSnapshot),
  };
}

export class PaymentsRepository {
  constructor(private readonly db: D1Runner) {}

  async create(input: {
    orderId: string;
    userId: string;
    telegramInvoicePayload: string;
    amountXtr: number;
    idempotencyKey: string;
    pricingSnapshot: PricingSnapshot;
    providerData?: Record<string, unknown>;
    now: string;
  }): Promise<Payment> {
    const id = createId("pay");
    await this.db.run(
      `INSERT INTO payments (
        id, order_id, user_id, telegram_payment_charge_id, telegram_invoice_payload, telegram_currency,
        amount_xtr, status, provider_data, idempotency_key, pricing_snapshot, failure_code,
        failure_reason, created_at, updated_at, succeeded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.orderId,
        input.userId,
        null,
        input.telegramInvoicePayload,
        "XTR",
        input.amountXtr,
        "created",
        encodeJson(input.providerData ?? {}),
        input.idempotencyKey,
        encodeJson(input.pricingSnapshot),
        null,
        null,
        input.now,
        input.now,
        null,
      ],
    );

    return (await this.findById(id)) as Payment;
  }

  async findById(paymentId: string): Promise<Payment | null> {
    const row = await this.db.first<PaymentRow>(`${PAYMENT_SELECT} WHERE id = ?`, [paymentId]);
    return mapPayment(row);
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const row = await this.db.first<PaymentRow>(
      `${PAYMENT_SELECT} WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    return mapPayment(row);
  }

  async findByInvoicePayload(payload: string): Promise<Payment | null> {
    const row = await this.db.first<PaymentRow>(`${PAYMENT_SELECT} WHERE telegram_invoice_payload = ?`, [payload]);
    return mapPayment(row);
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    const row = await this.db.first<PaymentRow>(`${PAYMENT_SELECT} WHERE idempotency_key = ?`, [key]);
    return mapPayment(row);
  }

  async updateStatus(paymentId: string, status: PaymentStatus, now: string): Promise<void> {
    await this.db.run("UPDATE payments SET status = ?, updated_at = ? WHERE id = ?", [status, now, paymentId]);
  }

  async markSucceeded(paymentId: string, chargeId: string, providerData: Record<string, unknown>, now: string): Promise<void> {
    await this.db.run(
      `UPDATE payments
       SET status = 'succeeded', telegram_payment_charge_id = ?, provider_data = ?, succeeded_at = ?, updated_at = ?
       WHERE id = ?`,
      [chargeId, encodeJson(providerData), now, now, paymentId],
    );
  }

  async markFailed(paymentId: string, code: string, reason: string, providerData: Record<string, unknown>, now: string): Promise<void> {
    await this.db.run(
      `UPDATE payments
       SET status = 'failed', failure_code = ?, failure_reason = ?, provider_data = ?, updated_at = ?
       WHERE id = ?`,
      [code, reason, encodeJson(providerData), now, paymentId],
    );
  }
}
