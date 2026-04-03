import { InlineKeyboard } from "grammy";
import type { CatalogItem } from "@services/catalog.service";
import { encodeCallbackData } from "@utils/callback-data";

export function buildMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🛍️ Каталог", encodeCallbackData("menu_catalog"))
    .text("📦 Заказы", encodeCallbackData("menu_history"))
    .row()
    .text("👤 Профиль", encodeCallbackData("menu_profile"))
    .text("⚙️ Настройки", encodeCallbackData("menu_settings"))
    .row()
    .text("💬 Поддержка", encodeCallbackData("menu_support"));
}

export function buildCatalogKeyboard(catalog: CatalogItem[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const item of catalog) {
    keyboard.text(item.product.title, encodeCallbackData("product", item.product.id)).row();
  }
  keyboard.text("⬅️ Назад", encodeCallbackData("menu_home"));
  return keyboard;
}

export function buildProductKeyboard(_productId: string, variantButtons: Array<{ id: string; label: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const variant of variantButtons) {
    keyboard.text(variant.label, encodeCallbackData("checkout", variant.id)).row();
  }
  keyboard.text("🛍️ К каталогу", encodeCallbackData("menu_catalog")).row();
  keyboard.text("🏠 Главное меню", encodeCallbackData("menu_home"));
  return keyboard;
}

export function buildPaymentMethodKeyboard(
  variantId: string,
  options: {
    allowTelegramStars: boolean;
    allowCryptoBot: boolean;
  },
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (options.allowTelegramStars) {
    keyboard.text("⭐ Telegram Stars", encodeCallbackData("checkout_pay", variantId, "telegram_stars")).row();
  }
  if (options.allowCryptoBot) {
    keyboard.text("💎 Crypto Bot", encodeCallbackData("checkout_pay", variantId, "crypto_bot")).row();
  }
  keyboard.text("⬅️ Назад", encodeCallbackData("checkout_back", variantId)).row();
  keyboard.text("🏠 Главное меню", encodeCallbackData("menu_home"));
  return keyboard;
}

export function buildCryptoInvoiceKeyboard(url: string): InlineKeyboard {
  return new InlineKeyboard().url("💎 Оплатить в Crypto Bot", url).row().text("🏠 Главное меню", encodeCallbackData("menu_home"));
}
