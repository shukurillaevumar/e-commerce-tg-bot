import { ValidationError } from "@domain/errors";
import type { ServiceDeps } from "@services/types";
import { AuditService } from "@services/audit.service";
import { NotificationsService } from "@services/notifications.service";
import { SettingsService } from "@services/settings.service";

export class AdminService {
  private readonly auditService: AuditService;
  private readonly settingsService: SettingsService;
  private readonly notificationsService: NotificationsService;

  constructor(private readonly deps: ServiceDeps) {
    this.auditService = new AuditService(deps);
    this.settingsService = new SettingsService(deps);
    this.notificationsService = new NotificationsService(deps);
  }

  async updateExchangeRate(input: {
    actorAdminId: string;
    rateRubPerStar: number;
    comment?: string | null;
  }): Promise<void> {
    if (input.rateRubPerStar <= 0) {
      throw new ValidationError("Курс должен быть больше нуля");
    }

    const current = await this.deps.repositories.exchangeRates.getCurrent();
    const version = (current?.version ?? 0) + 1;
    const now = this.deps.clock.now().toISOString();
    const rateId = await this.deps.repositories.exchangeRates.create({
      version,
      rateRubPerStar: input.rateRubPerStar,
      comment: input.comment ?? null,
      createdByAdminId: input.actorAdminId,
      now,
    });

    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: null,
      action: "exchange_rate_updated",
      entityType: "exchange_rate",
      entityId: rateId,
      payload: {
        version,
        rateRubPerStar: input.rateRubPerStar,
      },
    });
  }

  async createProduct(input: {
    actorAdminId: string;
    slug: string;
    title: string;
    description: string;
    isFeatured?: boolean;
  }): Promise<string> {
    const now = this.deps.clock.now().toISOString();
    const productId = await this.deps.repositories.products.createProduct({
      slug: input.slug,
      title: input.title,
      description: input.description,
      isFeatured: Boolean(input.isFeatured),
      now,
    });

    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: null,
      action: "product_created",
      entityType: "product",
      entityId: productId,
      payload: {
        slug: input.slug,
      },
    });

    return productId;
  }

  async createVariant(input: {
    actorAdminId: string;
    productId: string;
    sku: string;
    title: string;
    rubPrice: number;
    fulfillmentStrategy: "mock" | "manual" | "external_api" | "custom";
    packageSize?: string | null;
    tariff?: string | null;
    offerType?: string | null;
  }): Promise<string> {
    const now = this.deps.clock.now().toISOString();
    const variantId = await this.deps.repositories.products.createVariant({
      productId: input.productId,
      sku: input.sku,
      title: input.title,
      packageSize: input.packageSize ?? null,
      tariff: input.tariff ?? null,
      offerType: input.offerType ?? null,
      rubPrice: input.rubPrice,
      fulfillmentStrategy: input.fulfillmentStrategy,
      now,
    });

    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: null,
      action: "variant_created",
      entityType: "product_variant",
      entityId: variantId,
      payload: {
        productId: input.productId,
        sku: input.sku,
      },
    });

    return variantId;
  }

  async createPromoCode(input: {
    actorAdminId: string;
    code: string;
    type: "fixed_rub" | "percent" | "price_override";
    value: number;
    productId?: string | null;
    productVariantId?: string | null;
  }): Promise<string> {
    const now = this.deps.clock.now().toISOString();
    const promoId = await this.deps.repositories.promoCodes.create({
      code: input.code,
      type: input.type,
      value: input.value,
      productId: input.productId ?? null,
      productVariantId: input.productVariantId ?? null,
      now,
    });

    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: null,
      action: "promo_created",
      entityType: "promo_code",
      entityId: promoId,
      payload: {
        code: input.code.toUpperCase(),
        type: input.type,
        value: input.value,
      },
    });

    return promoId;
  }

  async flagUser(input: {
    actorAdminId: string;
    userId: string;
    riskLevel: "low" | "medium" | "high";
    suspicious: boolean;
    allowlisted?: boolean;
    denylisted?: boolean;
  }): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    await this.deps.repositories.users.setListFlags(
      input.userId,
      {
        riskLevel: input.riskLevel,
        suspicious: input.suspicious,
        allowlisted: input.allowlisted,
        denylisted: input.denylisted,
        segment: input.suspicious ? "suspicious" : undefined,
      },
      now,
    );
    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: input.userId,
      action: "fraud_flag_updated",
      entityType: "user",
      entityId: input.userId,
      payload: {
        riskLevel: input.riskLevel,
        suspicious: input.suspicious,
        allowlisted: input.allowlisted,
        denylisted: input.denylisted,
      },
    });
  }

  async getDashboardSummary(): Promise<Record<string, unknown>> {
    const [currentRate, ordersThresholds, manualReviewOrders] = await Promise.all([
      this.deps.repositories.exchangeRates.getCurrent(),
      this.settingsService.getFraudThresholds(),
      this.deps.repositories.orders.listManualReview(10),
    ]);

    return {
      currentRate,
      fraudThresholds: ordersThresholds,
      manualReviewCount: manualReviewOrders.length,
      manualReviewOrders: manualReviewOrders.map((order) => ({
        publicId: order.publicId,
        status: order.status,
        reviewStatus: order.reviewStatus,
      })),
    };
  }

  async sendManualQueueReminders(): Promise<void> {
    const manualReviewOrders = await this.deps.repositories.orders.listManualReview(10);
    if (manualReviewOrders.length === 0) {
      return;
    }

    const lines = ["Очередь ручной проверки требует внимания:\n"];
    for (const order of manualReviewOrders) {
      lines.push(`${order.publicId} — ${order.status} / ${order.reviewStatus}`);
    }

    await this.notificationsService.notifyAdmins(lines.join("\n"));
  }

  async listManualReviewOrders(): Promise<Array<{ publicId: string; status: string; reviewStatus: string }>> {
    const orders = await this.deps.repositories.orders.listManualReview(20);
    return orders.map((order) => ({
      publicId: order.publicId,
      status: order.status,
      reviewStatus: order.reviewStatus,
    }));
  }
}
