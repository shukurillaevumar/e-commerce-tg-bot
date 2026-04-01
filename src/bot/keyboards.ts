import { InlineKeyboard } from "grammy";
import type { CatalogItem } from "@services/catalog.service";
import { encodeCallbackData } from "@utils/callback-data";

export function buildMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Каталог", encodeCallbackData("menu_catalog"))
    .text("История", encodeCallbackData("menu_history"))
    .row()
    .text("Профиль", encodeCallbackData("menu_profile"))
    .text("Поддержка", encodeCallbackData("menu_support"));
}

export function buildCatalogKeyboard(catalog: CatalogItem[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const item of catalog) {
    keyboard.text(item.product.title, encodeCallbackData("product", item.product.id)).row();
  }
  keyboard.text("Назад", encodeCallbackData("menu_home"));
  return keyboard;
}

export function buildProductKeyboard(productId: string, variantButtons: Array<{ id: string; label: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const variant of variantButtons) {
    keyboard.text(variant.label, encodeCallbackData("checkout", variant.id)).row();
  }
  keyboard.text("К каталогу", encodeCallbackData("menu_catalog")).row();
  keyboard.text("Главное меню", encodeCallbackData("menu_home"));
  return keyboard;
}
