import { NotFoundError, ValidationError } from "@domain/errors";
import { buildPricingSnapshot } from "@domain/pricing";
import type { PricingSnapshot, ProductVariant, User } from "@domain/models";
import type { ServiceDeps } from "@services/types";
import { SettingsService } from "@services/settings.service";

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

    const rate = await this.deps.repositories.exchangeRates.getCurrent();
    if (!rate) {
      throw new ValidationError("Курс RUB/XTR не настроен");
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
      rateVersion: rate.version,
      rateValue: rate.rateRubPerStar,
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
