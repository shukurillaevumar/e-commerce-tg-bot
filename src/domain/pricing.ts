import type { PricingSnapshot } from "@domain/models";
import type { StorefrontCurrency } from "@domain/currency";

export interface PricingInput {
  rubPriceBase: number;
  rubPriceFinal: number;
  displayCurrency: StorefrontCurrency;
  displayAmount: number;
  rateVersion: number;
  rateValue: number;
  discountSource: PricingSnapshot["discountSource"];
  discountType: PricingSnapshot["discountType"];
  discountValue: number;
  promoCodeId: string | null;
  referralDiscountApplied: boolean;
  pricingRuleVersion: number;
}

export function convertRubToStars(rubPrice: number, rateRubPerStar: number): number {
  if (rubPrice <= 0) {
    throw new Error("rubPrice must be greater than zero");
  }
  if (rateRubPerStar <= 0) {
    throw new Error("rateRubPerStar must be greater than zero");
  }
  return Math.ceil(rubPrice / rateRubPerStar);
}

export function buildPricingSnapshot(input: PricingInput): PricingSnapshot {
  return {
    rubPriceBase: input.rubPriceBase,
    rubPriceFinal: input.rubPriceFinal,
    displayCurrency: input.displayCurrency,
    displayAmount: input.displayAmount,
    rateVersion: input.rateVersion,
    rateValue: input.rateValue,
    xtrPrice: input.rateValue > 0 ? convertRubToStars(input.rubPriceFinal, input.rateValue) : 0,
    discountSource: input.discountSource,
    discountType: input.discountType,
    discountValue: input.discountValue,
    promoCodeId: input.promoCodeId,
    referralDiscountApplied: input.referralDiscountApplied,
    pricingRuleVersion: input.pricingRuleVersion,
  };
}
