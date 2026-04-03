import { ConflictError, NotFoundError } from "@domain/errors";
import { uiText } from "@domain/messages";
import { assertValidOrderTransition } from "@domain/state-machine";
import type { Order, ProductVariant, User } from "@domain/models";
import { createInvoiceSlug } from "@infra/ids";
import { addMinutes } from "@infra/time";
import type { ServiceDeps } from "@services/types";
import { FraudService } from "@services/fraud.service";
import { NotificationsService } from "@services/notifications.service";
import { PricingService } from "@services/pricing.service";
import { SettingsService } from "@services/settings.service";

export class OrderService {
  private readonly pricingService: PricingService;
  private readonly settingsService: SettingsService;
  private readonly fraudService: FraudService;
  private readonly notificationsService: NotificationsService;

  constructor(private readonly deps: ServiceDeps) {
    this.pricingService = new PricingService(deps);
    this.settingsService = new SettingsService(deps);
    this.fraudService = new FraudService(deps);
    this.notificationsService = new NotificationsService(deps);
  }

  async createCheckoutOrder(input: {
    user: User;
    variantId: string;
    promoCode?: string | null;
    referralDiscountApplied?: boolean;
    campaignSource?: string | null;
  }): Promise<{ order: Order; variant: ProductVariant }> {
    await this.fraudService.recordOrderAttempt(input.user);
    const fraudDecision = await this.fraudService.evaluateCheckout(input.user);
    const { variant, snapshot } = await this.pricingService.quoteVariant({
      variantId: input.variantId,
      user: input.user,
      promoCode: input.promoCode,
      referralDiscountApplied: input.referralDiscountApplied,
    });

    const now = this.deps.clock.now().toISOString();
    const order = await this.deps.repositories.orders.create({
      userId: input.user.id,
      productId: variant.productId,
      productVariantId: variant.id,
      pricingSnapshot: snapshot,
      reviewStatus: fraudDecision.requiresManualReview ? "required" : "none",
      requiresManualReview: fraudDecision.requiresManualReview,
      campaignSource: input.campaignSource ?? null,
      referralId: null,
      promoCodeId: snapshot.promoCodeId,
      now,
    });

    if (!fraudDecision.allowed) {
      await this.notificationsService.notifyManualReview(order);
    }

    return { order, variant };
  }

  async issueInvoice(input: { user: User; orderId: string; variant?: ProductVariant }): Promise<Order> {
    const order = await this.deps.repositories.orders.findById(input.orderId);
    if (!order) {
      throw new NotFoundError("Заказ не найден");
    }

    if (order.requiresManualReview) {
      throw new ConflictError("Заказ находится на ручной проверке");
    }

    if (order.status !== "created" && order.status !== "invoice_sent") {
      throw new ConflictError("Счёт можно выставить только для нового или переоценённого заказа");
    }

    const variant = input.variant ?? (await this.deps.repositories.products.findVariantById(order.productVariantId));
    if (!variant) {
      throw new NotFoundError("Товарный вариант не найден");
    }

    if (order.retryCount >= 1 && order.status === "invoice_sent") {
      throw new ConflictError("Лимит повторного выставления invoice исчерпан");
    }

    const nowDate = this.deps.clock.now();
    const now = nowDate.toISOString();
    const invoiceLifetimeMinutes = await this.settingsService.getInvoiceLifetimeMinutes();
    const invoiceExpiresAt = addMinutes(nowDate, invoiceLifetimeMinutes).toISOString();
    const invoiceSlug = createInvoiceSlug(order.id);

    await this.deps.repositories.orders.setInvoice(order.id, {
      invoiceSlug,
      invoiceMessageId: null,
      invoiceSentAt: now,
      invoiceExpiresAt,
      retryCount: order.retryCount + 1,
      updatedAt: now,
    });

    await this.deps.repositories.payments.create({
      orderId: order.id,
      userId: order.userId,
      paymentMethod: "telegram_stars",
      telegramInvoicePayload: invoiceSlug,
      amountXtr: order.pricingSnapshot.xtrPrice,
      idempotencyKey: `${invoiceSlug}:created`,
      pricingSnapshot: order.pricingSnapshot,
      providerData: {
        invoiceExpiresAt,
      },
      now,
    });

    const invoiceResponse = await this.deps.telegram.sendInvoice({
      chatId: input.user.telegramId,
      title: variant.title,
      description:
        `${uiText.checkout}\n\nЦена: ${order.pricingSnapshot.rubPriceFinal} RUB\n` +
        `Оплата через Telegram Stars`,
      payload: invoiceSlug,
      startParameter: invoiceSlug.replaceAll(":", "_").slice(0, 64),
      prices: [{ label: `${variant.title} (${order.pricingSnapshot.rubPriceFinal} RUB)`, amount: order.pricingSnapshot.xtrPrice }],
    });

    await this.deps.repositories.orders.setInvoice(order.id, {
      invoiceSlug,
      invoiceMessageId: invoiceResponse.message_id ?? null,
      invoiceSentAt: now,
      invoiceExpiresAt,
      retryCount: order.retryCount + 1,
      updatedAt: now,
    });

    return (await this.deps.repositories.orders.findById(order.id)) as Order;
  }

  async expireInvoices(): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    const expiredOrders = await this.deps.repositories.orders.listExpiringInvoices(now);
    for (const order of expiredOrders) {
      if (order.status !== "invoice_sent") {
        continue;
      }
      assertValidOrderTransition(order.status, "cancelled");
      await this.deps.repositories.orders.cancel(order.id, "expired", now);
    }
  }
}

