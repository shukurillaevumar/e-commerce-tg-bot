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
  payment_method AS paymentMethod,
  telegram_payment_charge_id AS telegramPaymentChargeId,
  telegram_invoice_payload AS telegramInvoicePayload,
  telegram_currency AS telegramCurrency,
  amount_xtr AS amountXtr,
  provider_invoice_id AS providerInvoiceId,
  provider_currency AS providerCurrency,
  provider_amount AS providerAmount,
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
    paymentMethod: Payment["paymentMethod"];
    telegramInvoicePayload: string;
    amountXtr: number;
    idempotencyKey: string;
    pricingSnapshot: PricingSnapshot;
    providerInvoiceId?: string | null;
    providerCurrency?: string | null;
    providerAmount?: string | null;
    providerData?: Record<string, unknown>;
    now: string;
  }): Promise<Payment> {
    const id = createId("pay");
    await this.db.run(
      `INSERT INTO payments (
        id, order_id, user_id, payment_method, telegram_payment_charge_id, telegram_invoice_payload, telegram_currency,
        amount_xtr, provider_invoice_id, provider_currency, provider_amount, status, provider_data, idempotency_key, pricing_snapshot,
        failure_code, failure_reason, created_at, updated_at, succeeded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.orderId,
        input.userId,
        input.paymentMethod,
        null,
        input.telegramInvoicePayload,
        "XTR",
        input.amountXtr,
        input.providerInvoiceId ?? null,
        input.providerCurrency ?? null,
        input.providerAmount ?? null,
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

  async findByProviderInvoiceId(paymentMethod: Payment["paymentMethod"], providerInvoiceId: string): Promise<Payment | null> {
    const row = await this.db.first<PaymentRow>(
      `${PAYMENT_SELECT} WHERE payment_method = ? AND provider_invoice_id = ? ORDER BY created_at DESC LIMIT 1`,
      [paymentMethod, providerInvoiceId],
    );
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
