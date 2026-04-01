import { ConflictError, NotFoundError } from "@domain/errors";
import { uiText } from "@domain/messages";
import { assertValidOrderTransition } from "@domain/state-machine";
import type { CryptoPayInvoicePaidUpdate } from "@infra/crypto-pay";
import { FulfillmentService } from "@services/fulfillment.service";
import { FraudService } from "@services/fraud.service";
import { IdempotencyService } from "@services/idempotency.service";
import { NotificationsService } from "@services/notifications.service";
import type { ServiceDeps } from "@services/types";
import type { User } from "@domain/models";

export class PaymentService {
  private readonly idempotencyService: IdempotencyService;
  private readonly notificationsService: NotificationsService;
  private readonly fulfillmentService: FulfillmentService;
  private readonly fraudService: FraudService;

  constructor(private readonly deps: ServiceDeps) {
    this.idempotencyService = new IdempotencyService(deps);
    this.notificationsService = new NotificationsService(deps);
    this.fulfillmentService = new FulfillmentService(deps);
    this.fraudService = new FraudService(deps);
  }

  async validatePreCheckout(input: {
    preCheckoutQueryId: string;
    invoicePayload: string;
    userTelegramId: number;
    totalAmount: number;
  }): Promise<void> {
    const payment = await this.deps.repositories.payments.findByInvoicePayload(input.invoicePayload);
    if (!payment) {
      await this.deps.telegram.answerPreCheckoutQuery(input.preCheckoutQueryId, false, "Платёж не найден. Создайте новый счёт.");
      return;
    }

    if (payment.paymentMethod !== "telegram_stars") {
      await this.deps.telegram.answerPreCheckoutQuery(input.preCheckoutQueryId, false, "Этот счёт нельзя оплатить через Telegram Stars.");
      return;
    }

    const order = await this.deps.repositories.orders.findById(payment.orderId);
    if (!order || order.status !== "invoice_sent") {
      await this.deps.telegram.answerPreCheckoutQuery(input.preCheckoutQueryId, false, "Счёт уже недействителен.");
      return;
    }

    if (order.pricingSnapshot.xtrPrice !== input.totalAmount) {
      await this.deps.telegram.answerPreCheckoutQuery(input.preCheckoutQueryId, false, "Сумма счёта больше не актуальна.");
      return;
    }

    await this.deps.repositories.payments.updateStatus(payment.id, "pre_checkout_approved", this.deps.clock.now().toISOString());
    await this.deps.telegram.answerPreCheckoutQuery(input.preCheckoutQueryId, true);
  }

  async handleSuccessfulPayment(input: {
    paymentUpdateId: string;
    invoicePayload: string;
    telegramChargeId: string;
    totalAmount: number;
  }): Promise<void> {
    if (await this.idempotencyService.hasProcessedPaymentUpdate(input.paymentUpdateId)) {
      return;
    }

    const payment = await this.deps.repositories.payments.findByInvoicePayload(input.invoicePayload);
    if (!payment) {
      throw new NotFoundError("Платёж не найден");
    }

    if (payment.paymentMethod !== "telegram_stars") {
      throw new ConflictError("Получен платёж Telegram Stars для счёта другого провайдера");
    }

    const order = await this.deps.repositories.orders.findById(payment.orderId);
    if (!order) {
      throw new NotFoundError("Заказ для платежа не найден");
    }

    if (payment.status === "succeeded" || ["paid", "processing", "completed"].includes(order.status)) {
      await this.idempotencyService.markPaymentUpdateProcessed(input.paymentUpdateId);
      return;
    }

    if (order.status !== "invoice_sent") {
      throw new ConflictError("Платёж можно принять только по активному invoice");
    }

    if (order.pricingSnapshot.xtrPrice !== input.totalAmount) {
      throw new ConflictError("Сумма платежа не совпадает с зафиксированным snapshot");
    }

    const user = await this.deps.repositories.users.findById(order.userId);
    if (!user) {
      throw new NotFoundError("Пользователь заказа не найден");
    }

    const now = this.deps.clock.now().toISOString();
    assertValidOrderTransition(order.status, "paid");
    await this.deps.repositories.payments.markSucceeded(payment.id, input.telegramChargeId, { totalAmount: input.totalAmount }, now);
    await this.deps.repositories.orders.markPaid(order.id, now);

    assertValidOrderTransition("paid", "processing");
    await this.deps.repositories.orders.markProcessing(order.id, now);
    await this.notificationsService.notifyUserOrderProcessing(user, order);
    await this.fulfillmentService.enqueue({ ...order, status: "processing", paidAt: now, processingStartedAt: now }, order.requiresManualReview ? "high" : "normal");
    await this.idempotencyService.markPaymentUpdateProcessed(input.paymentUpdateId);
  }

  async handleCryptoPayInvoicePaid(update: CryptoPayInvoicePaidUpdate): Promise<void> {
    const providerInvoiceId = String(update.payload.invoice_id);
    const paymentUpdateId = `crypto:${providerInvoiceId}:${update.request_date}`;
    if (await this.idempotencyService.hasProcessedPaymentUpdate(paymentUpdateId)) {
      return;
    }

    const payment =
      (update.payload.payload ? await this.deps.repositories.payments.findByInvoicePayload(update.payload.payload) : null) ??
      (await this.deps.repositories.payments.findByProviderInvoiceId("crypto_bot", providerInvoiceId));
    if (!payment) {
      throw new NotFoundError("Платёж Crypto Bot не найден");
    }

    if (payment.paymentMethod !== "crypto_bot") {
      throw new ConflictError("Получен Crypto Bot webhook для счёта другого провайдера");
    }

    const order = await this.deps.repositories.orders.findById(payment.orderId);
    if (!order) {
      throw new NotFoundError("Заказ для платежа не найден");
    }

    if (payment.status === "succeeded" || ["paid", "processing", "completed"].includes(order.status)) {
      await this.idempotencyService.markPaymentUpdateProcessed(paymentUpdateId);
      return;
    }

    if (order.status !== "invoice_sent") {
      throw new ConflictError("Платёж можно принять только по активному invoice");
    }

    const user = await this.deps.repositories.users.findById(order.userId);
    if (!user) {
      throw new NotFoundError("Пользователь заказа не найден");
    }

    const now = this.deps.clock.now().toISOString();
    assertValidOrderTransition(order.status, "paid");
    await this.deps.repositories.payments.markSucceeded(
      payment.id,
      providerInvoiceId,
      {
        invoiceId: update.payload.invoice_id,
        paidAsset: update.payload.paid_asset ?? null,
        paidAmount: update.payload.paid_amount ?? null,
        payload: update.payload.payload ?? null,
      },
      now,
    );
    await this.deps.repositories.orders.markPaid(order.id, now);

    assertValidOrderTransition("paid", "processing");
    await this.deps.repositories.orders.markProcessing(order.id, now);
    await this.notificationsService.notifyUserOrderProcessing(user, order);
    await this.fulfillmentService.enqueue({ ...order, status: "processing", paidAt: now, processingStartedAt: now }, order.requiresManualReview ? "high" : "normal");
    await this.idempotencyService.markPaymentUpdateProcessed(paymentUpdateId);
  }

  async handlePaymentFailure(user: User, orderId: string, code: string, reason: string): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    const payment = await this.deps.repositories.payments.findByOrderId(orderId);
    if (payment) {
      await this.deps.repositories.payments.markFailed(payment.id, code, reason, { code, reason }, now);
    }
    await this.fraudService.recordFailedPayment(user, { orderId, code });

    const order = await this.deps.repositories.orders.findById(orderId);
    if (order) {
      await this.notificationsService.notifyUserPaymentFailed(user, order);
    }
  }

  async sendPaymentSuccessMessage(userTelegramId: number, orderId: string): Promise<void> {
    await this.deps.telegram.sendMessage(userTelegramId, `${uiText.paymentSuccess}\n\nЗаказ: ${orderId}`);
  }
}
