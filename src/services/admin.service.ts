import { ValidationError } from "@domain/errors";
import { catalogCacheKey } from "@infra/kv";
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

  private async invalidateCatalog(): Promise<void> {
    await this.deps.kv.delete(catalogCacheKey());
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

  async updateUsdRate(input: {
    actorAdminId: string;
    rubPerUsd: number;
  }): Promise<void> {
    await this.settingsService.updateRubPerUsd(input.rubPerUsd, input.actorAdminId);
    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: null,
      action: "settings_updated",
      entityType: "settings",
      entityId: "storefront.rub_per_usd",
      payload: {
        rubPerUsd: input.rubPerUsd,
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

    await this.invalidateCatalog();

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

    await this.invalidateCatalog();

    return variantId;
  }

  async updateProductPhoto(input: {
    actorAdminId: string;
    productId: string;
    photoFileId: string;
    photoUniqueId: string | null;
  }): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    await this.deps.repositories.products.updateProduct(input.productId, {
      photoFileId: input.photoFileId,
      photoUniqueId: input.photoUniqueId,
      now,
    });

    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: null,
      action: "product_updated",
      entityType: "product",
      entityId: input.productId,
      payload: {
        photoUpdated: true,
      },
    });

    await this.invalidateCatalog();
  }

  async updateProductDetails(input: {
    actorAdminId: string;
    productId: string;
    title?: string;
    description?: string;
  }): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    await this.deps.repositories.products.updateProduct(input.productId, {
      title: input.title,
      description: input.description,
      now,
    });

    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: null,
      action: "product_updated",
      entityType: "product",
      entityId: input.productId,
      payload: {
        titleUpdated: input.title !== undefined,
        descriptionUpdated: input.description !== undefined,
      },
    });

    await this.invalidateCatalog();
  }

  async updateVariantDetails(input: {
    actorAdminId: string;
    variantId: string;
    title?: string;
    rubPrice?: number;
  }): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    await this.deps.repositories.products.updateVariant(input.variantId, {
      title: input.title,
      rubPrice: input.rubPrice,
      now,
    });

    await this.auditService.log({
      actorAdminId: input.actorAdminId,
      actorUserId: null,
      action: "variant_updated",
      entityType: "product_variant",
      entityId: input.variantId,
      payload: {
        titleUpdated: input.title !== undefined,
        rubPriceUpdated: input.rubPrice !== undefined,
      },
    });

    await this.invalidateCatalog();
  }

  async listProducts(): Promise<Array<{ product: import("@domain/models").Product; variantsCount: number }>> {
    const products = await this.deps.repositories.products.listProducts();
    const result: Array<{ product: import("@domain/models").Product; variantsCount: number }> = [];
    for (const product of products) {
      const variants = await this.deps.repositories.products.listVariantsByProductId(product.id);
      result.push({ product, variantsCount: variants.length });
    }
    return result;
  }

  async createPromoCode(input: {
    actorAdminId: string;
    code: string;
    type: "fixed_rub" | "percent" | "price_override";
    value: number;
    productId?: string | null;
    productVariantId?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    usageLimitTotal?: number | null;
    usageLimitPerUser?: number | null;
  }): Promise<string> {
    if (!input.code.trim()) {
      throw new ValidationError("Промокод не может быть пустым");
    }

    if (input.value <= 0) {
      throw new ValidationError("Значение промокода должно быть больше нуля");
    }

    if (input.type === "percent" && input.value > 100) {
      throw new ValidationError("Процент скидки не может быть больше 100");
    }

    if (input.validFrom && input.validUntil && input.validUntil <= input.validFrom) {
      throw new ValidationError("Дата окончания должна быть позже даты начала");
    }

    if (input.usageLimitTotal !== undefined && input.usageLimitTotal !== null && input.usageLimitTotal <= 0) {
      throw new ValidationError("Лимит использований должен быть больше нуля");
    }

    if (input.usageLimitPerUser !== undefined && input.usageLimitPerUser !== null && input.usageLimitPerUser <= 0) {
      throw new ValidationError("Лимит на пользователя должен быть больше нуля");
    }

    const now = this.deps.clock.now().toISOString();
    const promoId = await this.deps.repositories.promoCodes.create({
      code: input.code,
      type: input.type,
      value: input.value,
      productId: input.productId ?? null,
      productVariantId: input.productVariantId ?? null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      usageLimitTotal: input.usageLimitTotal ?? null,
      usageLimitPerUser: input.usageLimitPerUser ?? null,
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
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        usageLimitTotal: input.usageLimitTotal ?? null,
        usageLimitPerUser: input.usageLimitPerUser ?? null,
      },
    });

    return promoId;
  }

  async listPromos(): Promise<import("@domain/models").PromoCode[]> {
    return this.deps.repositories.promoCodes.listRecent(20);
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
    const [storefrontPricing, currentRate, ordersThresholds, manualReviewOrders] = await Promise.all([
      this.settingsService.getStorefrontPricing(),
      this.deps.repositories.exchangeRates.getCurrent(),
      this.settingsService.getFraudThresholds(),
      this.deps.repositories.orders.listManualReview(10),
    ]);

    return {
      storefrontPricing,
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

