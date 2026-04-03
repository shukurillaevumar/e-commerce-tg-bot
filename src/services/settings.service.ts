import { ValidationError } from "@domain/errors";
import { isStorefrontCurrency, type StorefrontCurrency } from "@domain/currency";
import type { ServiceDeps } from "@services/types";

const DEFAULTS = {
  pricingRuleVersion: 1,
  rubPerUsd: 0,
  fraudOrdersPer10m: 5,
  fraudFailedPaymentsPer30m: 3,
  fraudPromoRejectedPer24h: 3,
  invoiceLifetimeMinutes: 15,
  manualFulfillmentSlaMinutes: 30,
  checkoutStateTtlSeconds: 3600,
  catalogCacheTtlSeconds: 60,
} as const;

function userCurrencyKey(userId: string): string {
  return `user.${userId}.currency`;
}

export class SettingsService {
  constructor(private readonly deps: ServiceDeps) {}

  private async seedDefault(key: string, value: string, now: string): Promise<void> {
    const existing = await this.deps.repositories.settings.get(key);
    if (existing !== null) {
      return;
    }

    await this.deps.repositories.settings.upsert(key, value, null, now);
  }

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

  async getRubPerUsd(): Promise<number> {
    return this.getNumber("storefront.rub_per_usd", DEFAULTS.rubPerUsd);
  }

  async getUserCurrencyPreference(userId: string): Promise<StorefrontCurrency> {
    const value = await this.deps.repositories.settings.get(userCurrencyKey(userId));
    if (value === null) {
      return "RUB";
    }

    if (!isStorefrontCurrency(value)) {
      throw new ValidationError(`Настройка ${userCurrencyKey(userId)} имеет некорректное значение: ${value}`);
    }

    return value;
  }

  async updateUserCurrencyPreference(userId: string, currency: StorefrontCurrency): Promise<void> {
    if (currency === "USD") {
      const rubPerUsd = await this.getRubPerUsd();
      if (rubPerUsd <= 0) {
        throw new ValidationError("USD временно недоступен: администратор ещё не настроил курс RUB/USD");
      }
    }

    const now = this.deps.clock.now().toISOString();
    await this.deps.repositories.settings.upsert(userCurrencyKey(userId), currency, null, now);
  }

  async getStorefrontPricing(): Promise<{ rubPerUsd: number }> {
    const rubPerUsd = await this.getRubPerUsd();
    return { rubPerUsd };
  }

  async updateRubPerUsd(rubPerUsd: number, updatedByAdminId: string | null): Promise<void> {
    if (rubPerUsd <= 0) {
      throw new ValidationError("Курс RUB/USD должен быть больше нуля");
    }

    const now = this.deps.clock.now().toISOString();
    await this.deps.repositories.settings.upsert("storefront.rub_per_usd", String(rubPerUsd), updatedByAdminId, now);
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
      this.seedDefault("pricing.rule_version", String(DEFAULTS.pricingRuleVersion), now),
      this.seedDefault("storefront.rub_per_usd", String(DEFAULTS.rubPerUsd), now),
      this.seedDefault("fraud.orders_per_10m", String(DEFAULTS.fraudOrdersPer10m), now),
      this.seedDefault("fraud.failed_payments_per_30m", String(DEFAULTS.fraudFailedPaymentsPer30m), now),
      this.seedDefault("fraud.promo_rejected_per_24h", String(DEFAULTS.fraudPromoRejectedPer24h), now),
      this.seedDefault("checkout.invoice_lifetime_minutes", String(DEFAULTS.invoiceLifetimeMinutes), now),
      this.seedDefault("fulfillment.manual_sla_minutes", String(DEFAULTS.manualFulfillmentSlaMinutes), now),
      this.seedDefault("cache.catalog_ttl_seconds", String(DEFAULTS.catalogCacheTtlSeconds), now),
    ]);
  }
}
