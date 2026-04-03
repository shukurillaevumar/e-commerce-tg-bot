export const STOREFRONT_CURRENCIES = ["RUB", "USD"] as const;

export type StorefrontCurrency = (typeof STOREFRONT_CURRENCIES)[number];

export function isStorefrontCurrency(value: string): value is StorefrontCurrency {
  return STOREFRONT_CURRENCIES.includes(value as StorefrontCurrency);
}

export function convertRubToUsd(rubAmount: number, rubPerUsd: number): number {
  if (rubAmount < 0) {
    throw new Error("rubAmount must be greater than or equal to zero");
  }
  if (rubPerUsd <= 0) {
    throw new Error("rubPerUsd must be greater than zero");
  }

  return Math.round((rubAmount / rubPerUsd) * 100) / 100;
}

export function getDisplayAmount(rubAmount: number, currency: StorefrontCurrency, rubPerUsd: number): number {
  return currency === "USD" ? convertRubToUsd(rubAmount, rubPerUsd) : rubAmount;
}

export function formatDisplayAmount(amount: number, currency: StorefrontCurrency): string {
  if (currency === "USD") {
    return `${amount.toFixed(2)} USD`;
  }

  return `${Math.round(amount)} RUB`;
}
