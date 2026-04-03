import { getDisplayAmount } from "@domain/currency";
import { NotFoundError, ValidationError } from "@domain/errors";
import type { PricingSnapshot, ProductVariant, User } from "@domain/models";
import { buildPricingSnapshot } from "@domain/pricing";
import { SettingsService } from "@services/settings.service";
import type { ServiceDeps } from "@services/types";

export class PricingService {
  private readonly settingsService: SettingsService;

  constructor(private readonly deps: ServiceDeps) {
    this.settingsService = new SettingsService(deps);
  }

  async quoteVariant(input: {
    variantId: string;
    user: User;
    promoCode?: string | null;
    referralDiscountApplied?: boolean;
  }): Promise<{ variant: ProductVariant; snapshot: PricingSnapshot }> {
    const variant = await this.deps.repositories.products.findVariantById(input.variantId);
    if (!variant || !variant.isActive) {
      throw new NotFoundError("Товарный вариант недоступен");
    }

    const [preferredCurrency, rubPerUsd, currentRate] = await Promise.all([
      this.settingsService.getUserCurrencyPreference(input.user.id),
      this.settingsService.getRubPerUsd(),
      this.deps.repositories.exchangeRates.getCurrent(),
    ]);
    if (preferredCurrency === "USD" && rubPerUsd <= 0) {
      throw new ValidationError("Курс RUB/USD не настроен");
    }

    let rubPriceFinal = variant.rubPrice;
    let discountSource: PricingSnapshot["discountSource"] = "none";
    let discountType: PricingSnapshot["discountType"] = "none";
    let discountValue = 0;
    let promoCodeId: string | null = null;
    const referralDiscountApplied = Boolean(input.referralDiscountApplied);

    if (input.promoCode) {
      const promo = await this.deps.repositories.promoCodes.findByCode(input.promoCode);
      if (!promo || !promo.isActive) {
        throw new ValidationError("Промокод недоступен");
      }

      const now = this.deps.clock.now().toISOString();
      if (promo.validFrom && promo.validFrom > now) {
        throw new ValidationError("Промокод ещё не активен");
      }
      if (promo.validUntil && promo.validUntil < now) {
        throw new ValidationError("Срок действия промокода истёк");
      }
      if (promo.usageLimitTotal !== null) {
        const totalApplied = await this.deps.repositories.promoCodes.countAppliedTotal(promo.id);
        if (totalApplied >= promo.usageLimitTotal) {
          throw new ValidationError("Лимит использований промокода исчерпан");
        }
      }
      if (promo.usageLimitPerUser !== null) {
        const userApplied = await this.deps.repositories.promoCodes.countAppliedByUser(input.user.id, promo.id);
        if (userApplied >= promo.usageLimitPerUser) {
          throw new ValidationError("Для этого пользователя лимит промокода исчерпан");
        }
      }
      if (promo.productVariantId && promo.productVariantId !== variant.id) {
        throw new ValidationError("Промокод не подходит для выбранного пакета");
      }
      if (promo.productId && promo.productId !== variant.productId) {
        throw new ValidationError("Промокод не подходит для выбранного товара");
      }

      discountSource = "promo";
      promoCodeId = promo.id;

      if (promo.type === "fixed_rub") {
        discountType = "fixed_rub";
        discountValue = promo.value;
        rubPriceFinal = Math.max(1, variant.rubPrice - promo.value);
      } else if (promo.type === "percent") {
        discountType = "percent";
        discountValue = promo.value;
        rubPriceFinal = Math.max(1, Math.ceil(variant.rubPrice * (1 - promo.value / 100)));
      } else {
        discountType = "price_override";
        discountValue = promo.value;
        rubPriceFinal = promo.value;
      }
    } else if (referralDiscountApplied) {
      discountSource = "referral";
      discountType = "referral_first_purchase";
      discountValue = Math.ceil(variant.rubPrice * 0.1);
      rubPriceFinal = Math.max(1, variant.rubPrice - discountValue);
    }

    const pricingRuleVersion = await this.settingsService.getPricingRuleVersion();
    const snapshot = buildPricingSnapshot({
      rubPriceBase: variant.rubPrice,
      rubPriceFinal,
      displayCurrency: preferredCurrency,
      displayAmount: getDisplayAmount(rubPriceFinal, preferredCurrency, rubPerUsd),
      rateVersion: currentRate?.version ?? 0,
      rateValue: currentRate?.rateRubPerStar ?? 0,
      discountSource,
      discountType,
      discountValue,
      promoCodeId,
      referralDiscountApplied,
      pricingRuleVersion,
    });

    return { variant, snapshot };
  }
}
