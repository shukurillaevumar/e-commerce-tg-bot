import { ValidationError } from "@domain/errors";
import type { ServiceDeps } from "@services/types";

const DEFAULTS = {
  pricingRuleVersion: 1,
  fraudOrdersPer10m: 5,
  fraudFailedPaymentsPer30m: 3,
  fraudPromoRejectedPer24h: 3,
  invoiceLifetimeMinutes: 15,
  manualFulfillmentSlaMinutes: 30,
  checkoutStateTtlSeconds: 3600,
  catalogCacheTtlSeconds: 60,
} as const;

export class SettingsService {
  constructor(private readonly deps: ServiceDeps) {}

  async getNumber(key: string, fallback: number): Promise<number> {
    const value = await this.deps.repositories.settings.get(key);
    if (value === null) {
      return fallback;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new ValidationError(`Настройка ${key} имеет некорректное числовое значение`);
    }
    return parsed;
  }

  async getPricingRuleVersion(): Promise<number> {
    return this.getNumber("pricing.rule_version", DEFAULTS.pricingRuleVersion);
  }

  async getInvoiceLifetimeMinutes(): Promise<number> {
    return this.getNumber("checkout.invoice_lifetime_minutes", DEFAULTS.invoiceLifetimeMinutes);
  }

  async getManualFulfillmentSlaMinutes(): Promise<number> {
    return this.getNumber("fulfillment.manual_sla_minutes", DEFAULTS.manualFulfillmentSlaMinutes);
  }

  async getFraudThresholds(): Promise<{
    ordersPer10m: number;
    failedPaymentsPer30m: number;
    promoRejectedPer24h: number;
  }> {
    const [ordersPer10m, failedPaymentsPer30m, promoRejectedPer24h] = await Promise.all([
      this.getNumber("fraud.orders_per_10m", DEFAULTS.fraudOrdersPer10m),
      this.getNumber("fraud.failed_payments_per_30m", DEFAULTS.fraudFailedPaymentsPer30m),
      this.getNumber("fraud.promo_rejected_per_24h", DEFAULTS.fraudPromoRejectedPer24h),
    ]);

    return { ordersPer10m, failedPaymentsPer30m, promoRejectedPer24h };
  }

  async bootstrapDefaults(): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    await Promise.all([
      this.deps.repositories.settings.upsert("pricing.rule_version", String(DEFAULTS.pricingRuleVersion), null, now),
      this.deps.repositories.settings.upsert("fraud.orders_per_10m", String(DEFAULTS.fraudOrdersPer10m), null, now),
      this.deps.repositories.settings.upsert("fraud.failed_payments_per_30m", String(DEFAULTS.fraudFailedPaymentsPer30m), null, now),
      this.deps.repositories.settings.upsert("fraud.promo_rejected_per_24h", String(DEFAULTS.fraudPromoRejectedPer24h), null, now),
      this.deps.repositories.settings.upsert("checkout.invoice_lifetime_minutes", String(DEFAULTS.invoiceLifetimeMinutes), null, now),
      this.deps.repositories.settings.upsert("fulfillment.manual_sla_minutes", String(DEFAULTS.manualFulfillmentSlaMinutes), null, now),
      this.deps.repositories.settings.upsert("cache.catalog_ttl_seconds", String(DEFAULTS.catalogCacheTtlSeconds), null, now),
    ]);
  }
}
