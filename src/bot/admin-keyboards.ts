import { InlineKeyboard } from "grammy";
import { encodeCallbackData } from "@utils/callback-data";

export function buildAdminDashboardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🛍️ Товары", encodeCallbackData("admin_products"))
    .text("💱 Валюта", encodeCallbackData("admin_rate"))
    .row()
    .text("🏷️ Промокоды", encodeCallbackData("admin_promos"))
    .text("🛡️ Риски", encodeCallbackData("admin_risk"))
    .row()
    .text("📦 Ручная проверка", encodeCallbackData("admin_manual"))
    .text("🏠 Главное меню", encodeCallbackData("menu_home"));
}

export function buildAdminProductsKeyboard(
  items: Array<{ id: string; title: string; hasPhoto: boolean; variantsCount: number }>,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const item of items) {
    const badge = item.hasPhoto ? "🖼️" : "▫️";
    keyboard.text(`${badge} ${item.title} (${item.variantsCount})`, encodeCallbackData("admin_product", item.id)).row();
  }
  keyboard.text("➕ Новый товар", encodeCallbackData("admin_product_new")).row();
  keyboard.text("⬅️ Назад", encodeCallbackData("admin_home"));
  return keyboard;
}

export function buildAdminProductKeyboard(productId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Название", encodeCallbackData("admin_product_edit", productId, "title"))
    .text("📝 Описание", encodeCallbackData("admin_product_edit", productId, "description"))
    .row()
    .text("🖼️ Фото", encodeCallbackData("admin_photo", productId))
    .text("📦 Варианты", encodeCallbackData("admin_variants", productId))
    .row()
    .text("👁️ Открыть карточку", encodeCallbackData("product", productId))
    .row()
    .text("⬅️ К товарам", encodeCallbackData("admin_products"))
    .text("🏠 Главное меню", encodeCallbackData("menu_home"));
}

export function buildAdminVariantsKeyboard(
  productId: string,
  items: Array<{ id: string; title: string; rubPrice: number; strategy: string }>,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const item of items) {
    keyboard.text(`${item.title} • ${item.rubPrice} RUB`, encodeCallbackData("admin_variant_item", item.id)).row();
  }
  keyboard.text("➕ Добавить вариант", encodeCallbackData("admin_variant", productId)).row();
  keyboard.text("⬅️ К товару", encodeCallbackData("admin_product", productId));
  return keyboard;
}

export function buildAdminVariantKeyboard(productId: string, variantId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Название", encodeCallbackData("admin_variant_edit", variantId, "title"))
    .row()
    .text("💵 Изменить цену", encodeCallbackData("admin_variant_edit", variantId, "price"))
    .row()
    .text("⬅️ К вариантам", encodeCallbackData("admin_variants", productId))
    .text("🏠 Главное меню", encodeCallbackData("menu_home"));
}

export function buildAdminVariantStrategyKeyboard(productId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🧪 Mock", encodeCallbackData("admin_variant_strategy", productId, "mock"))
    .row()
    .text("🧾 Manual", encodeCallbackData("admin_variant_strategy", productId, "manual"))
    .row()
    .text("🔌 External API", encodeCallbackData("admin_variant_strategy", productId, "external_api"))
    .row()
    .text("⚙️ Custom", encodeCallbackData("admin_variant_strategy", productId, "custom"))
    .row()
    .text("⬅️ Назад", encodeCallbackData("admin_product", productId));
}

export function buildAdminPromosKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Новый промокод", encodeCallbackData("admin_promo_new"))
    .row()
    .text("⬅️ Назад", encodeCallbackData("admin_home"));
}

export function buildAdminPromoTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("💸 Фикс в RUB", encodeCallbackData("admin_promo_type", "", "fixed_rub"))
    .row()
    .text("📉 Процент", encodeCallbackData("admin_promo_type", "", "percent"))
    .row()
    .text("🎯 Фикс цены", encodeCallbackData("admin_promo_type", "", "price_override"))
    .row()
    .text("❌ Отмена", encodeCallbackData("admin_cancel"));
}

export function buildAdminRateKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("💱 Курс USD", encodeCallbackData("admin_rate_edit"))
    .row()
    .text("⬅️ Назад", encodeCallbackData("admin_home"));
}

export function buildUserSettingsKeyboard(currentCurrency: "RUB" | "USD"): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${currentCurrency === "RUB" ? "✅ " : ""}₽ RUB`, encodeCallbackData("settings_currency_set", "", "RUB"))
    .text(`${currentCurrency === "USD" ? "✅ " : ""}$ USD`, encodeCallbackData("settings_currency_set", "", "USD"))
    .row()
    .text("⬅️ Назад", encodeCallbackData("menu_home"));
}

export function buildAdminRiskKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚩 Обновить fraud-флаг", encodeCallbackData("admin_flag"))
    .row()
    .text("⬅️ Назад", encodeCallbackData("admin_home"));
}

export function buildAdminManualKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Обновить", encodeCallbackData("admin_manual"))
    .row()
    .text("⬅️ Назад", encodeCallbackData("admin_home"));
}

export function buildAdminCancelKeyboard(backAction = "admin_home", backId?: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("❌ Отмена", encodeCallbackData("admin_cancel"))
    .row()
    .text("⬅️ Назад", encodeCallbackData(backAction, backId));
}

export function buildAdminRiskLevelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🟢 Низкий", encodeCallbackData("admin_flag_level", "", "low"))
    .text("🟡 Средний", encodeCallbackData("admin_flag_level", "", "medium"))
    .row()
    .text("🔴 Высокий", encodeCallbackData("admin_flag_level", "", "high"))
    .row()
    .text("❌ Отмена", encodeCallbackData("admin_cancel"));
}

export function buildAdminSuspiciousKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Подозрительный", encodeCallbackData("admin_flag_suspicious", "", "1"))
    .text("👌 Нормальный", encodeCallbackData("admin_flag_suspicious", "", "0"))
    .row()
    .text("❌ Отмена", encodeCallbackData("admin_cancel"));
}
