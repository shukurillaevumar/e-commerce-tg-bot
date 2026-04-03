import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { formatDisplayAmount } from "@domain/currency";
import { adminText, uiText } from "@domain/messages";
import type { PricingSnapshot, ProductVariant } from "@domain/models";
import { activeUiMessageKey, adminFlowStateKey } from "@infra/kv";
import { createServiceContainer, type ServiceContainer } from "@services/container";
import type { Env } from "@infra/bindings";
import type { BotContext } from "@bot/context";
import { buildCatalogKeyboard, buildCryptoInvoiceKeyboard, buildMainMenuKeyboard, buildPaymentMethodKeyboard, buildProductKeyboard } from "@bot/keyboards-v2";
import {
  buildAdminCancelKeyboard,
  buildAdminDashboardKeyboard,
  buildAdminProductKeyboard,
  buildAdminProductsKeyboard,
  buildAdminPromoTypeKeyboard,
  buildAdminPromosKeyboard,
  buildAdminRateKeyboard,
  buildAdminRiskKeyboard,
  buildAdminVariantKeyboard,
  buildAdminVariantsKeyboard,
  buildAdminVariantStrategyKeyboard,
  buildAdminManualKeyboard,
  buildUserSettingsKeyboard,
} from "@bot/admin-keyboards";
import { decodeCallbackData } from "@utils/callback-data";

const ACTIVE_UI_TTL_SECONDS = 60 * 60 * 24 * 14;
const ADMIN_FLOW_TTL_SECONDS = 60 * 60 * 2;

interface ActiveUiState {
  messageId: number;
}

type AdminFlowState =
  | {
      scope: "update_usd_rate";
    }
  | {
      scope: "create_product";
      step: "slug" | "title" | "description";
      slug?: string;
      title?: string;
    }
  | {
      scope: "edit_product";
      productId: string;
      field: "title" | "description";
    }
  | {
      scope: "update_product_photo";
      productId: string;
    }
  | {
      scope: "create_variant";
      productId: string;
      strategy: "mock" | "manual" | "external_api" | "custom";
      step: "sku" | "title" | "price";
      sku?: string;
      title?: string;
    }
  | {
      scope: "edit_variant";
      productId: string;
      variantId: string;
      field: "title" | "price";
    }
  | {
      scope: "create_promo";
      step: "code" | "value" | "usage_limit" | "duration_hours";
      promoType: "fixed_rub" | "percent" | "price_override";
      code?: string;
      value?: number;
      usageLimitTotal?: number | null;
    };

function formatSnapshotPrice(snapshot: Pick<PricingSnapshot, "rubPriceFinal" | "displayAmount" | "displayCurrency">): string {
  return formatDisplayAmount(snapshot.displayAmount ?? snapshot.rubPriceFinal, snapshot.displayCurrency ?? "RUB");
}

function formatVariantSummary(
  variant: ProductVariant,
  snapshot: Pick<PricingSnapshot, "rubPriceFinal" | "displayAmount" | "displayCurrency">,
): string {
  const parts = [variant.title, `Цена: ${formatSnapshotPrice(snapshot)}`];
  if ((snapshot.displayCurrency ?? "RUB") !== "RUB") {
    parts.push(`Базовая цена: ${snapshot.rubPriceFinal} RUB`);
  }
  if (variant.packageSize) {
    parts.push(`Пакет: ${variant.packageSize}`);
  }
  if (variant.tariff) {
    parts.push(`Тариф: ${variant.tariff}`);
  }
  return parts.join("\n");
}

function currentUiMessageId(ctx: BotContext): number | null {
  const callbackMessage = ctx.callbackQuery?.message;
  if (!callbackMessage || !("message_id" in callbackMessage)) {
    return null;
  }
  return callbackMessage.message_id;
}

function isMessageNotModifiedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("message is not modified");
}

function isExpiredCallbackQueryError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("answerCallbackQuery") &&
    (error.message.includes("query is too old") || error.message.includes("query ID is invalid"))
  );
}

async function getActiveUiState(ctx: BotContext): Promise<ActiveUiState | null> {
  if (!ctx.chat) {
    return null;
  }
  return ctx.services.deps.kv.get<ActiveUiState>(activeUiMessageKey(ctx.chat.id));
}

async function setActiveUiMessage(ctx: BotContext, messageId: number): Promise<void> {
  if (!ctx.chat) {
    return;
  }
  await ctx.services.deps.kv.put(activeUiMessageKey(ctx.chat.id), JSON.stringify({ messageId }), ACTIVE_UI_TTL_SECONDS);
}

async function getAdminFlowState(ctx: BotContext): Promise<AdminFlowState | null> {
  if (!ctx.chat) {
    return null;
  }
  return ctx.services.deps.kv.get<AdminFlowState>(adminFlowStateKey(ctx.chat.id));
}

async function setAdminFlowState(ctx: BotContext, state: AdminFlowState): Promise<void> {
  if (!ctx.chat) {
    return;
  }
  await ctx.services.deps.kv.put(adminFlowStateKey(ctx.chat.id), JSON.stringify(state), ADMIN_FLOW_TTL_SECONDS);
}

async function clearAdminFlowState(ctx: BotContext): Promise<void> {
  if (!ctx.chat) {
    return;
  }
  await ctx.services.deps.kv.delete(adminFlowStateKey(ctx.chat.id));
}

async function clearActiveUiMessage(ctx: BotContext): Promise<void> {
  if (!ctx.chat) {
    return;
  }
  await ctx.services.deps.kv.delete(activeUiMessageKey(ctx.chat.id));
}

async function deleteTrackedUiMessage(ctx: BotContext, excludeMessageId?: number | null): Promise<void> {
  if (!ctx.chat) {
    return;
  }

  const activeUi = await getActiveUiState(ctx);
  if (!activeUi || activeUi.messageId === excludeMessageId) {
    return;
  }

  try {
    await ctx.api.deleteMessage(ctx.chat.id, activeUi.messageId);
  } catch {
    // Ignore stale or already deleted messages.
  }

  await clearActiveUiMessage(ctx);
}

async function renderUiScreen(ctx: BotContext, text: string, replyMarkup: InlineKeyboard): Promise<void> {
  const messageId = currentUiMessageId(ctx);
  if (messageId !== null) {
    try {
      await ctx.editMessageText(text, {
        reply_markup: replyMarkup,
      });
      await setActiveUiMessage(ctx, messageId);
      return;
    } catch (error) {
      if (isMessageNotModifiedError(error)) {
        await setActiveUiMessage(ctx, messageId);
        return;
      }
    }
  }

  await deleteTrackedUiMessage(ctx);
  const sent = await ctx.reply(text, {
    reply_markup: replyMarkup,
  });
  await setActiveUiMessage(ctx, sent.message_id);
}

async function renderPhotoUiScreen(
  ctx: BotContext,
  photoUrl: string | undefined,
  caption: string,
  replyMarkup: InlineKeyboard,
): Promise<void> {
  const trimmedPhotoUrl = photoUrl?.trim();
  if (!trimmedPhotoUrl) {
    await renderUiScreen(ctx, caption, replyMarkup);
    return;
  }

  await deleteTrackedUiMessage(ctx);
  const sent = await ctx.replyWithPhoto(trimmedPhotoUrl, {
    caption,
    reply_markup: replyMarkup,
  });
  await setActiveUiMessage(ctx, sent.message_id);
}

async function hydrateActor(ctx: BotContext): Promise<void> {
  const telegramUser = ctx.from;
  if (!telegramUser) {
    return;
  }

  const user = await ctx.services.userService.ensureUser({
    telegramId: telegramUser.id,
    username: telegramUser.username ?? null,
    firstName: telegramUser.first_name ?? null,
    lastName: telegramUser.last_name ?? null,
    languageCode: telegramUser.language_code ?? null,
    isBot: telegramUser.is_bot ?? false,
  });
  ctx.appUser = user;
  ctx.appAdmin = await ctx.services.adminAuthService.getAdminByTelegramId(telegramUser.id);
}

async function renderCatalog(ctx: BotContext): Promise<void> {
  const catalog = await ctx.services.catalogService.getCatalog();
  await renderUiScreen(ctx, uiText.catalog, buildCatalogKeyboard(catalog));
}

async function renderProduct(ctx: BotContext, productId: string): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const catalog = await ctx.services.catalogService.getCatalog();
  const item = catalog.find((entry) => entry.product.id === productId);
  if (!item) {
    await ctx.reply("Товар не найден.");
    return;
  }

  const buttons: Array<{ id: string; label: string }> = [];
  const lines = [`${uiText.productCard}\n`, item.product.title, item.product.description, ""];

  for (const variant of item.variants) {
    const quote = await ctx.services.pricingService.quoteVariant({
      variantId: variant.id,
      user: ctx.appUser,
    });
    buttons.push({
      id: variant.id,
      label: `${variant.title} • ${formatSnapshotPrice(quote.snapshot)}`,
    });
    lines.push(formatVariantSummary(variant, quote.snapshot));
    lines.push("");
  }

  await ctx.reply(lines.join("\n"), {
    reply_markup: buildProductKeyboard(productId, buttons),
  });
}

async function checkoutVariant(ctx: BotContext, variantId: string): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const variant = await ctx.services.repositories.products.findVariantById(variantId);
  if (!variant) {
    await ctx.reply("Пакет не найден.");
    return;
  }

  const { order } = await ctx.services.orderService.createCheckoutOrder({
    user: ctx.appUser,
    variantId,
  });

  if (order.requiresManualReview) {
    await ctx.reply(uiText.suspiciousBlocked, {
      reply_markup: buildMainMenuKeyboard(),
    });
    return;
  }

  const updatedOrder = await ctx.services.orderService.issueInvoice({
    user: ctx.appUser,
    orderId: order.id,
    paymentMethod: "crypto_bot",
    variant,
  });

  await ctx.reply(
    `${uiText.checkout}\n\nЗаказ: ${updatedOrder.order.publicId}\n` +
      `Цена: ${formatSnapshotPrice(updatedOrder.order.pricingSnapshot)}\n` +
      `Способ оплаты: Crypto Bot`,
  );
}

async function renderHistory(ctx: BotContext): Promise<void> {
  if (!ctx.appUser) {
    return;
  }
  const orders = await ctx.services.repositories.orders.listByUserId(ctx.appUser.id);
  if (orders.length === 0) {
    await ctx.reply(uiText.historyEmpty, { reply_markup: buildMainMenuKeyboard() });
    return;
  }

  const lines = ["📦 История заказов:\n"];
  for (const order of orders) {
    lines.push(`• ${order.publicId} — ${order.status}\n  ${formatSnapshotPrice(order.pricingSnapshot)}`);
  }

  await ctx.reply(lines.join("\n"), { reply_markup: buildMainMenuKeyboard() });
}

async function renderProfile(ctx: BotContext): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  await ctx.reply(
    `${uiText.profile}\n\n` +
      `🆔 Telegram ID: ${ctx.appUser.telegramId}\n` +
      `🛡️ Статус риска: ${ctx.appUser.riskLevel}\n` +
      `🎟️ Реферальный код: ${ctx.appUser.referralCode}`,
    { reply_markup: buildMainMenuKeyboard() },
  );
}

async function renderSupport(ctx: BotContext): Promise<void> {
  await ctx.reply(
    `${uiText.supportIntro}\n\n📝 Формат для открытия обращения:\n/support Тема | Описание`,
    { reply_markup: buildMainMenuKeyboard() },
  );
}

async function renderAdmin(ctx: BotContext): Promise<void> {
  if (!ctx.appAdmin) {
    await ctx.reply(adminText.accessDenied);
    return;
  }

  const summary = await ctx.services.adminService.getDashboardSummary();
  await ctx.reply(
    `${adminText.dashboard}\n\n` +
      `Ручная проверка: ${summary.manualReviewCount}\n` +
      `Базовая валюта магазина: RUB\n` +
      `Курс RUB/USD: ${String((summary.storefrontPricing as { rubPerUsd: number }).rubPerUsd ?? 0)}`,
    {
      reply_markup: new InlineKeyboard()
        .text("Валюта", "admin_rate")
        .text("Промокоды", "admin_promos")
        .row()
        .text("Главное меню", "menu_home"),
    },
  );
}

async function renderAdminCurrencyUi(ctx: BotContext): Promise<void> {
  if (!ctx.appAdmin) {
    await renderAdminUi(ctx);
    return;
  }

  const summary = await ctx.services.adminService.getDashboardSummary();
  await renderPhotoUiScreen(
    ctx,
    ctx.services.deps.env.ADMIN_PAGE_IMAGE_URL,
    `Валюты и курсы

Базовая валюта магазина: RUB
Курс RUB/USD: ${String((summary.storefrontPricing as { rubPerUsd: number }).rubPerUsd ?? 0)}
Курс Telegram Stars: ${summary.currentRate ? `${(summary.currentRate as { rateRubPerStar: number }).rateRubPerStar}` : "не задан"}

Пользователи выбирают RUB или USD в своих настройках. Здесь настраивается только курс USD.`,
    buildAdminRateKeyboard(),
  );
}

async function renderAdminPromosUi(ctx: BotContext): Promise<void> {
  if (!ctx.appAdmin) {
    await renderAdminUi(ctx);
    return;
  }

  const promos = await ctx.services.adminService.listPromos();
  const lines = ["Промокоды", ""];
  if (promos.length === 0) {
    lines.push("Промокодов пока нет.");
  } else {
    for (const promo of promos.slice(0, 8)) {
      lines.push(
        `${promo.code} | ${promo.type} | ${promo.value}` +
          `${promo.usageLimitTotal !== null ? ` | лимит: ${promo.usageLimitTotal}` : ""}` +
          `${promo.validUntil ? ` | до: ${promo.validUntil.slice(0, 16).replace("T", " ")}` : ""}`,
      );
    }
  }
  lines.push("", "Нажмите «Новый промокод», чтобы создать его пошагово.");

  await renderUiScreen(ctx, lines.join("\n"), buildAdminPromosKeyboard());
}

async function renderAdminProductsUi(ctx: BotContext): Promise<void> {
  if (!ctx.appAdmin) {
    await renderAdminUi(ctx);
    return;
  }

  const products = await ctx.services.adminService.listProducts();
  const items = products.map(({ product, variantsCount }) => ({
    id: product.id,
    title: product.title,
    hasPhoto: Boolean(product.photoFileId),
    variantsCount,
  }));

  await renderPhotoUiScreen(
    ctx,
    ctx.services.deps.env.PROFILE_PAGE_IMAGE_URL,
    `Товары\n\nВсего товаров: ${items.length}\nВыберите товар или создайте новый.`,
    buildAdminProductsKeyboard(items),
  );
}

async function renderAdminProductUi(ctx: BotContext, productId: string): Promise<void> {
  if (!ctx.appAdmin) {
    await renderAdminUi(ctx);
    return;
  }

  const product = await ctx.services.repositories.products.findProductById(productId);
  if (!product) {
    await renderUiScreen(ctx, "Товар не найден.", buildAdminDashboardKeyboard());
    return;
  }

  const variants = await ctx.services.repositories.products.listVariantsByProductId(productId);
  const lines = [
    product.title,
    "",
    `ID: ${product.id}`,
    `Slug: ${product.slug}`,
    `Вариантов: ${variants.length}`,
    `Фото: ${product.photoFileId ? "загружено" : "не загружено"}`,
    "",
    product.description,
  ];

  await renderUiScreen(ctx, lines.join("\n"), buildAdminProductKeyboard(productId));
}

async function renderAdminVariantsUi(ctx: BotContext, productId: string): Promise<void> {
  if (!ctx.appAdmin) {
    await renderAdminUi(ctx);
    return;
  }

  const product = await ctx.services.repositories.products.findProductById(productId);
  if (!product) {
    await renderUiScreen(ctx, "Товар не найден.", buildAdminDashboardKeyboard());
    return;
  }

  const variants = await ctx.services.repositories.products.listVariantsByProductId(productId);
  const items = variants.map((variant) => ({
    id: variant.id,
    title: variant.title,
    rubPrice: variant.rubPrice,
    strategy: variant.fulfillmentStrategy,
  }));

  await renderPhotoUiScreen(
    ctx,
    ctx.services.deps.env.PROFILE_PAGE_IMAGE_URL,
    `Варианты товара\n\n${product.title}\nВсего вариантов: ${items.length}`,
    buildAdminVariantsKeyboard(productId, items),
  );
}

async function renderAdminVariantUi(ctx: BotContext, variantId: string): Promise<void> {
  if (!ctx.appAdmin) {
    await renderAdminUi(ctx);
    return;
  }

  const variant = await ctx.services.repositories.products.findVariantById(variantId);
  if (!variant) {
    await renderUiScreen(ctx, "Вариант не найден.", buildAdminDashboardKeyboard());
    return;
  }

  const lines = [
    variant.title,
    "",
    `SKU: ${variant.sku}`,
    `Цена: ${variant.rubPrice} RUB`,
    `Стратегия: ${variant.fulfillmentStrategy}`,
    `Пакет: ${variant.packageSize ?? "не задан"}`,
    `Тариф: ${variant.tariff ?? "не задан"}`,
  ];

  await renderUiScreen(ctx, lines.join("\n"), buildAdminVariantKeyboard(variant.productId, variant.id));
}

async function renderAdminRiskUi(ctx: BotContext): Promise<void> {
  if (!ctx.appAdmin) {
    await renderAdminUi(ctx);
    return;
  }

  await renderPhotoUiScreen(
    ctx,
    ctx.services.deps.env.PROFILE_PAGE_IMAGE_URL,
    "Риски и fraud\n\nДля быстрого обновления флага можно использовать команду:\n/fraud_flag 123456789 | high | 1",
    buildAdminRiskKeyboard(),
  );
}

async function renderAdminManualUi(ctx: BotContext): Promise<void> {
  if (!ctx.appAdmin) {
    await renderAdminUi(ctx);
    return;
  }

  const orders = await ctx.services.adminService.listManualReviewOrders();
  const lines = ["Ручная проверка", ""];
  if (orders.length === 0) {
    lines.push("Очередь ручной проверки пуста.");
  } else {
    for (const order of orders.slice(0, 10)) {
      lines.push(`${order.publicId} — ${order.status} / ${order.reviewStatus}`);
    }
  }

  await renderUiScreen(ctx, lines.join("\n"), buildAdminManualKeyboard());
}

async function renderHomeUi(ctx: BotContext): Promise<void> {
  const identity = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? "друг";
  await renderPhotoUiScreen(
    ctx,
    ctx.services.deps.env.MAIN_PAGE_IMAGE_URL,
    `🦊 Привет, ${identity}, добро пожаловать!\n\n⚡ Покупайте Stars, Premium и другие товары за мгновение.\n\n✈️ Выдача товаров происходит автоматически!`,
    buildMainMenuKeyboard(),
  );
}

async function renderCatalogUi(ctx: BotContext): Promise<void> {
  const catalog = await ctx.services.catalogService.getCatalog();
  await renderPhotoUiScreen(ctx, ctx.services.deps.env.CATALOG_IMAGE_URL, uiText.catalog, buildCatalogKeyboard(catalog));
}

async function renderProductUi(ctx: BotContext, productId: string): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const catalog = await ctx.services.catalogService.getCatalog();
  const item = catalog.find((entry) => entry.product.id === productId);
  if (!item) {
    await renderUiScreen(ctx, "Товар не найден.", buildMainMenuKeyboard());
    return;
  }

  const buttons: Array<{ id: string; label: string }> = [];
  const lines = [`${uiText.productCard}\n`, item.product.title, item.product.description, ""];

  for (const variant of item.variants) {
    const quote = await ctx.services.pricingService.quoteVariant({
      variantId: variant.id,
      user: ctx.appUser,
    });
    buttons.push({
      id: variant.id,
      label: `${variant.title} • ${formatSnapshotPrice(quote.snapshot)}`,
    });
    lines.push(formatVariantSummary(variant, quote.snapshot));
    lines.push("");
  }

  await renderUiScreen(ctx, lines.join("\n"), buildProductKeyboard(productId, buttons));
}

async function renderCheckoutMethodUi(ctx: BotContext, variantId: string): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const variant = await ctx.services.repositories.products.findVariantById(variantId);
  if (!variant) {
    await renderUiScreen(ctx, "Пакет не найден.", buildMainMenuKeyboard());
    return;
  }

  const quote = await ctx.services.pricingService.quoteVariant({
    variantId: variant.id,
    user: ctx.appUser,
  });

  const allowTelegramStars = quote.snapshot.xtrPrice > 0;
  const allowCryptoBot = ctx.services.deps.cryptoPay.isEnabled();
  const paymentLines = [
    `${uiText.checkout}`,
    "",
    `Пакет: ${variant.title}`,
    `Цена: ${formatSnapshotPrice(quote.snapshot)}`,
  ];
  if (quote.snapshot.displayCurrency !== "RUB") {
    paymentLines.push(`Базовая цена: ${quote.snapshot.rubPriceFinal} RUB`);
  }
  if (allowTelegramStars) {
    paymentLines.push("⭐ Telegram Stars");
  } else {
    paymentLines.push("⭐ Telegram Stars: временно недоступны");
  }
  if (allowCryptoBot) {
    paymentLines.push("💎 Crypto Bot: оплата по инвойсу");
  }
  paymentLines.push("", "Выберите удобный способ оплаты:");

  await renderPhotoUiScreen(
    ctx,
    ctx.services.deps.env.SUPPORT_PAGE_IMAGE_URL,
    paymentLines.join("\n"),
    buildPaymentMethodKeyboard(variantId, {
      allowTelegramStars,
      allowCryptoBot,
    }),
  );
}

async function startCheckoutWithMethodUi(ctx: BotContext, variantId: string, paymentMethod: "telegram_stars" | "crypto_bot"): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  if (paymentMethod === "crypto_bot" && !ctx.services.deps.cryptoPay.isEnabled()) {
    await renderUiScreen(ctx, "Оплата через Crypto Bot пока недоступна.", buildMainMenuKeyboard());
    return;
  }

  const variant = await ctx.services.repositories.products.findVariantById(variantId);
  if (!variant) {
    await renderUiScreen(ctx, "Пакет не найден.", buildMainMenuKeyboard());
    return;
  }

  const quote = await ctx.services.pricingService.quoteVariant({
    variantId,
    user: ctx.appUser,
  });
  if (paymentMethod === "telegram_stars" && quote.snapshot.xtrPrice <= 0) {
    await renderUiScreen(ctx, "Оплата через Telegram Stars временно недоступна.", buildMainMenuKeyboard());
    return;
  }

  const { order } = await ctx.services.orderService.createCheckoutOrder({
    user: ctx.appUser,
    variantId,
  });

  if (order.requiresManualReview) {
    await renderUiScreen(ctx, uiText.suspiciousBlocked, buildMainMenuKeyboard());
    return;
  }

  const uiMessageId = currentUiMessageId(ctx);
  if (uiMessageId !== null && ctx.chat) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, uiMessageId);
    } catch {
      // Ignore stale message deletion errors before checkout.
    }
  } else {
    await deleteTrackedUiMessage(ctx);
  }
  await clearActiveUiMessage(ctx);

  const issued = await ctx.services.orderService.issueInvoice({
    user: ctx.appUser,
    orderId: order.id,
    paymentMethod,
    variant,
  });

  if (paymentMethod === "telegram_stars") {
    await ctx.reply(
      `${uiText.checkout}\n\nЗаказ: ${issued.order.publicId}\n` +
        `Цена на витрине: ${formatSnapshotPrice(issued.order.pricingSnapshot)}\n` +
        `Сумма будет показана в окне оплаты Telegram.\n` +
        `Способ оплаты: ⭐ Telegram Stars`,
    );
    return;
  }

  if (!issued.paymentUrl) {
    await ctx.reply("Не удалось создать счёт Crypto Bot. Попробуйте ещё раз позже.");
    return;
  }

  await ctx.reply(
    `${uiText.checkout}\n\nЗаказ: ${issued.order.publicId}\n` +
      `Цена: ${formatSnapshotPrice(issued.order.pricingSnapshot)}\n` +
      `Способ оплаты: 💎 Crypto Bot\n\n` +
      `Нажмите кнопку ниже, чтобы открыть инвойс и оплатить заказ.`,
    {
      reply_markup: buildCryptoInvoiceKeyboard(issued.paymentUrl),
    },
  );
}

async function renderHistoryUi(ctx: BotContext): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const orders = await ctx.services.repositories.orders.listByUserId(ctx.appUser.id);
  if (orders.length === 0) {
    await renderPhotoUiScreen(ctx, ctx.services.deps.env.ORDERS_PAGE_IMAGE_URL, uiText.historyEmpty, buildMainMenuKeyboard());
    return;
  }

  const lines = ["📦 История заказов:\n"];
  for (const order of orders) {
    lines.push(`• ${order.publicId} — ${order.status}\n  ${formatSnapshotPrice(order.pricingSnapshot)}`);
  }

  await renderPhotoUiScreen(ctx, ctx.services.deps.env.ORDERS_PAGE_IMAGE_URL, lines.join("\n"), buildMainMenuKeyboard());
}

async function renderProfileUi(ctx: BotContext): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const appUser = ctx.appUser;
  const profileText =
    `${uiText.profile}\n\n` +
    `Telegram ID: ${appUser.telegramId}\n` +
    `Risk status: ${appUser.riskLevel}\n` +
    `Referral code: ${appUser.referralCode}`;

  await renderPhotoUiScreen(ctx, ctx.services.deps.env.PROFILE_PAGE_IMAGE_URL, profileText, buildMainMenuKeyboard());
  return;

  /* Legacy fallback kept only as a reference.
  await renderUiScreen(
    ctx,
    `${uiText.profile}\n\n` +
      `🆔 Telegram ID: ${ctx.appUser.telegramId}\n` +
      `🛡️ Статус риска: ${ctx.appUser.riskLevel}\n` +
      `🎟️ Реферальный код: ${ctx.appUser.referralCode}`,
    buildMainMenuKeyboard(),
  );
  */
}

async function renderSettingsUi(ctx: BotContext): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const currency = await ctx.services.settingsService.getUserCurrencyPreference(ctx.appUser.id);
  const rubPerUsd = await ctx.services.settingsService.getRubPerUsd();
  const lines = [
    "Настройки",
    "",
    `Текущая валюта: ${currency}`,
    `Курс RUB/USD: ${rubPerUsd > 0 ? rubPerUsd : "не настроен"}`,
    "",
    "Выберите валюту для отображения цен в каталоге и счёте Crypto Bot.",
    "Настройка влияет только на отображение цен и не меняет доступные способы оплаты.",
  ];

  await renderPhotoUiScreen(ctx, ctx.services.deps.env.SETTINGS_PAGE_IMAGE_URL, lines.join("\n"), buildUserSettingsKeyboard(currency));
}

async function renderSupportUi(ctx: BotContext): Promise<void> {
  await renderUiScreen(
    ctx,
    `${uiText.supportIntro}\n\n📝 Формат для открытия обращения:\n/support Тема | Описание`,
    buildMainMenuKeyboard(),
  );
}

async function renderAdminUi(ctx: BotContext): Promise<void> {
  if (!ctx.appAdmin) {
    await renderUiScreen(ctx, adminText.accessDenied, buildMainMenuKeyboard());
    return;
  }

  const summary = await ctx.services.adminService.getDashboardSummary();
  await renderPhotoUiScreen(
    ctx,
    ctx.services.deps.env.ADMIN_PAGE_IMAGE_URL,
    `${adminText.dashboard}\n\n` +
      `🛡️ Ручная проверка: ${summary.manualReviewCount}\n` +
      `💱 Базовая валюта магазина: RUB\n` +
      `⭐ Курс Telegram Stars: ${
        summary.currentRate ? `${(summary.currentRate as { rateRubPerStar: number }).rateRubPerStar}` : "не задан"
      }\n` +
      `Курс RUB/USD: ${String((summary.storefrontPricing as { rubPerUsd: number }).rubPerUsd ?? 0)}`,
    buildAdminDashboardKeyboard(),
  );
}

async function checkoutVariantUi(ctx: BotContext, variantId: string): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const variant = await ctx.services.repositories.products.findVariantById(variantId);
  if (!variant) {
    await renderUiScreen(ctx, "Пакет не найден.", buildMainMenuKeyboard());
    return;
  }

  const { order } = await ctx.services.orderService.createCheckoutOrder({
    user: ctx.appUser,
    variantId,
  });

  if (order.requiresManualReview) {
    await renderUiScreen(ctx, uiText.suspiciousBlocked, buildMainMenuKeyboard());
    return;
  }

  const uiMessageId = currentUiMessageId(ctx);
  if (uiMessageId !== null && ctx.chat) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, uiMessageId);
    } catch {
      // Ignore stale message deletion errors before checkout.
    }
  } else {
    await deleteTrackedUiMessage(ctx);
  }
  await clearActiveUiMessage(ctx);

  const updatedOrder = await ctx.services.orderService.issueInvoice({
    user: ctx.appUser,
    orderId: order.id,
    paymentMethod: "crypto_bot",
    variant,
  });

  await ctx.reply(
    `${uiText.checkout}\n\nЗаказ: ${updatedOrder.order.publicId}\n` +
      `Цена: ${formatSnapshotPrice(updatedOrder.order.pricingSnapshot)}\n` +
      `Способ оплаты: Crypto Bot`,
  );
}

export function createBot(env: Env): { bot: Bot<BotContext>; webhook: (request: Request) => Promise<Response> } {
  const services = createServiceContainer(env);
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    (ctx as BotContext).services = services;
    await hydrateActor(ctx as BotContext);
    await next();
  });

  bot.catch(async (error) => {
    services.deps.logger.error("bot_error", {
      error: String(error.error),
      updateId: error.ctx.update.update_id,
    });
    if (error.ctx.chat) {
      await error.ctx.reply("Внутренняя ошибка. Операция не завершена. Попробуйте повторить позже.");
    }
  });

  bot.command("start", async (ctx) => {
    await renderHomeUi(ctx as BotContext);
  });

  bot.command("catalog", renderCatalogUi);
  bot.command("orders", renderHistoryUi);
  bot.command("profile", renderProfileUi);
  bot.command("settings", renderSettingsUi);
  bot.command("admin", renderAdminUi);
  bot.command("currency", async (ctx) => {
    if (!ctx.appUser) {
      return;
    }
    await ctx.reply("Смена валюты теперь находится в меню: «⚙️ Настройки».");
  });

  bot.command("usd", async (ctx) => {
    if (!ctx.appAdmin) {
      await ctx.reply(adminText.accessDenied);
      return;
    }

    const rawValue = ctx.message?.text.replace(/^\/usd(@\w+)?/i, "").trim().replace(",", ".");
    const rubPerUsd = Number(rawValue);
    if (!Number.isFinite(rubPerUsd) || rubPerUsd <= 0) {
      await ctx.reply("Используйте формат: /usd 96.5");
      return;
    }

    await ctx.services.adminService.updateUsdRate({
      actorAdminId: ctx.appAdmin.id,
      rubPerUsd,
    });
    await ctx.reply(`Курс RUB/USD обновлён: ${rubPerUsd}`);
  });

  bot.command("support", async (ctx) => {
    if (!ctx.appUser) {
      return;
    }

    const payload = ctx.message?.text.replace(/^\/support(@\w+)?/i, "").trim() ?? "";
    const [subjectRaw, ...messageParts] = payload.split("|");
    const subject = subjectRaw?.trim();
    const message = messageParts.join("|").trim();

    if (!subject || !message) {
      await renderSupportUi(ctx);
      return;
    }

    await ctx.services.supportService.createTicket(ctx.appUser, subject, message);
    await ctx.reply("Обращение зарегистрировано. Мы ответим в этом чате.");
  });

  bot.on("message:text", async (ctx, next) => {
    if (!ctx.appAdmin) {
      await next();
      return;
    }

    const textValue = ctx.message.text.trim();
    if (textValue.startsWith("/")) {
      await next();
      return;
    }

    const state = await getAdminFlowState(ctx as BotContext);
    if (!state) {
      await next();
      return;
    }

    if (state.scope === "update_usd_rate") {
      const rubPerUsd = Number(textValue.replace(",", "."));
      if (!Number.isFinite(rubPerUsd) || rubPerUsd <= 0) {
        await ctx.reply("Введите положительное число, например: 96.5");
        return;
      }
      await ctx.services.adminService.updateUsdRate({ actorAdminId: ctx.appAdmin.id, rubPerUsd });
      await clearAdminFlowState(ctx as BotContext);
      await renderAdminCurrencyUi(ctx as BotContext);
      return;
    }

    if (state.scope === "create_product") {
      if (state.step === "slug") {
        if (!/^[a-z0-9-]{3,64}$/.test(textValue)) {
          await ctx.reply("Slug должен содержать 3-64 символа: латиница, цифры и дефис.");
          return;
        }
        await setAdminFlowState(ctx as BotContext, { ...state, step: "title", slug: textValue });
        await ctx.reply("Введите название товара.");
        return;
      }

      if (state.step === "title") {
        if (textValue.length < 2) {
          await ctx.reply("Название слишком короткое.");
          return;
        }
        await setAdminFlowState(ctx as BotContext, { ...state, step: "description", title: textValue });
        await ctx.reply("Введите описание товара.");
        return;
      }

      if (!state.slug || !state.title) {
        await clearAdminFlowState(ctx as BotContext);
        await renderAdminProductsUi(ctx as BotContext);
        return;
      }

      await ctx.services.adminService.createProduct({
        actorAdminId: ctx.appAdmin.id,
        slug: state.slug,
        title: state.title,
        description: textValue,
      });
      await clearAdminFlowState(ctx as BotContext);
      await ctx.reply("Товар создан.");
      await renderAdminProductsUi(ctx as BotContext);
      return;
    }

    if (state.scope === "edit_product") {
      await ctx.services.adminService.updateProductDetails({
        actorAdminId: ctx.appAdmin.id,
        productId: state.productId,
        [state.field]: textValue,
      });
      await clearAdminFlowState(ctx as BotContext);
      await ctx.reply(state.field === "title" ? "Название обновлено." : "Описание обновлено.");
      await renderAdminProductUi(ctx as BotContext, state.productId);
      return;
    }

    if (state.scope === "create_variant") {
      if (state.step === "sku") {
        if (!/^[A-Za-z0-9_-]{2,64}$/.test(textValue)) {
          await ctx.reply("SKU должен содержать 2-64 символа: буквы, цифры, _ или -.");
          return;
        }
        await setAdminFlowState(ctx as BotContext, { ...state, step: "title", sku: textValue });
        await ctx.reply("Введите название варианта.");
        return;
      }

      if (state.step === "title") {
        if (textValue.length < 2) {
          await ctx.reply("Название варианта слишком короткое.");
          return;
        }
        await setAdminFlowState(ctx as BotContext, { ...state, step: "price", title: textValue });
        await ctx.reply("Введите цену в RUB.");
        return;
      }

      const rubPrice = Number(textValue.replace(",", "."));
      if (!state.sku || !state.title || !Number.isFinite(rubPrice) || rubPrice <= 0) {
        await ctx.reply("Введите корректную цену в RUB, например: 199");
        return;
      }

      await ctx.services.adminService.createVariant({
        actorAdminId: ctx.appAdmin.id,
        productId: state.productId,
        sku: state.sku,
        title: state.title,
        rubPrice,
        fulfillmentStrategy: state.strategy,
      });
      await clearAdminFlowState(ctx as BotContext);
      await ctx.reply("Вариант создан.");
      await renderAdminVariantsUi(ctx as BotContext, state.productId);
      return;
    }

    if (state.scope === "edit_variant") {
      if (state.field === "title") {
        await ctx.services.adminService.updateVariantDetails({
          actorAdminId: ctx.appAdmin.id,
          variantId: state.variantId,
          title: textValue,
        });
      } else {
        const rubPrice = Number(textValue.replace(",", "."));
        if (!Number.isFinite(rubPrice) || rubPrice <= 0) {
          await ctx.reply("Введите корректную цену в RUB, например: 199");
          return;
        }
        await ctx.services.adminService.updateVariantDetails({
          actorAdminId: ctx.appAdmin.id,
          variantId: state.variantId,
          rubPrice,
        });
      }

      await clearAdminFlowState(ctx as BotContext);
      await ctx.reply(state.field === "title" ? "Название варианта обновлено." : "Цена варианта обновлена.");
      await renderAdminVariantUi(ctx as BotContext, state.variantId);
      return;
    }

    if (state.scope === "create_promo") {
      if (state.step === "code") {
        if (!/^[A-Za-z0-9_-]{3,64}$/.test(textValue)) {
          await ctx.reply("Промокод должен содержать 3-64 символа: буквы, цифры, _ или -.");
          return;
        }
        await setAdminFlowState(ctx as BotContext, { ...state, step: "value", code: textValue.toUpperCase() });
        await ctx.reply("Введите значение промокода.");
        return;
      }

      if (state.step === "value") {
        const value = Number(textValue.replace(",", "."));
        if (!Number.isFinite(value) || value <= 0 || (state.promoType === "percent" && value > 100)) {
          await ctx.reply(state.promoType === "percent" ? "Введите число от 1 до 100." : "Введите положительное число.");
          return;
        }
        await setAdminFlowState(ctx as BotContext, { ...state, step: "usage_limit", value });
        await ctx.reply("Введите общий лимит использований. Отправьте 0 для безлимита.");
        return;
      }

      if (state.step === "usage_limit") {
        const usageLimitTotal = Number(textValue);
        if (!Number.isInteger(usageLimitTotal) || usageLimitTotal < 0) {
          await ctx.reply("Введите целое число 0 или больше.");
          return;
        }
        await setAdminFlowState(ctx as BotContext, {
          ...state,
          step: "duration_hours",
          usageLimitTotal: usageLimitTotal === 0 ? null : usageLimitTotal,
        });
        await ctx.reply("Введите срок действия в часах. Отправьте 0, если срок не ограничен.");
        return;
      }

      if (state.step !== "duration_hours") {
        await next();
        return;
      }

      const durationHours = Number(textValue);
      if (!Number.isInteger(durationHours) || durationHours < 0 || !state.code || state.value === undefined) {
        await ctx.reply("Введите целое число 0 или больше.");
        return;
      }

      try {
        const now = ctx.services.deps.clock.now();
        const validFrom = now.toISOString();
        const validUntil = durationHours === 0 ? null : new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString();

        const promoId = await ctx.services.adminService.createPromoCode({
          actorAdminId: ctx.appAdmin.id,
          code: state.code,
          type: state.promoType,
          value: state.value,
          usageLimitTotal: state.usageLimitTotal ?? null,
          validFrom,
          validUntil,
        });

        await clearAdminFlowState(ctx as BotContext);
        await ctx.reply(`Промокод ${state.code} создан. ID: ${promoId}`);
        await renderAdminPromosUi(ctx as BotContext);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось создать промокод.";

        if (message.includes("UNIQUE constraint failed") || message.includes("promo_codes.code")) {
          await setAdminFlowState(ctx as BotContext, {
            scope: "create_promo",
            step: "code",
            promoType: state.promoType,
          });
          await ctx.reply("Промокод с таким кодом уже существует. Введите другой код.");
          return;
        }

        await ctx.reply(message);
        return;
      }
    }

    await next();
  });

  bot.on("message:photo", async (ctx, next) => {
    if (!ctx.appAdmin) {
      await next();
      return;
    }

    const state = await getAdminFlowState(ctx as BotContext);
    if (!state || state.scope !== "update_product_photo") {
      await next();
      return;
    }

    const photo = ctx.message.photo.at(-1);
    if (!photo) {
      await ctx.reply("Не удалось получить фото. Попробуйте отправить изображение ещё раз.");
      return;
    }

    await ctx.services.adminService.updateProductPhoto({
      actorAdminId: ctx.appAdmin.id,
      productId: state.productId,
      photoFileId: photo.file_id,
      photoUniqueId: photo.file_unique_id ?? null,
    });
    await clearAdminFlowState(ctx as BotContext);
    await ctx.reply("Фото товара обновлено.");
    await renderAdminProductUi(ctx as BotContext, state.productId);
  });

  bot.command("rate", async (ctx) => {
    if (!ctx.appAdmin) {
      await ctx.reply(adminText.accessDenied);
      return;
    }
    const value = Number((ctx.message?.text.replace(/^\/rate(@\w+)?/i, "").trim() ?? ""));
    if (!Number.isFinite(value) || value <= 0) {
      await ctx.reply("Используйте формат: /rate 1.25");
      return;
    }
    await ctx.services.adminService.updateExchangeRate({
      actorAdminId: ctx.appAdmin.id,
      rateRubPerStar: value,
    });
    await ctx.reply(adminText.exchangeRateUpdated);
  });

  bot.command("product_add", async (ctx) => {
    if (!ctx.appAdmin) {
      await ctx.reply(adminText.accessDenied);
      return;
    }
    const payload = ctx.message?.text.replace(/^\/product_add(@\w+)?/i, "").trim() ?? "";
    const [slug, title, ...descriptionParts] = payload.split("|").map((part) => part.trim());
    const description = descriptionParts.join("|").trim();
    if (!slug || !title || !description) {
      await ctx.reply("Используйте формат: /product_add slug | Название | Описание");
      return;
    }
    const productId = await ctx.services.adminService.createProduct({
      actorAdminId: ctx.appAdmin.id,
      slug,
      title,
      description,
    });
    await ctx.reply(`Товар создан: ${productId}`);
  });

  bot.command("variant_add", async (ctx) => {
    if (!ctx.appAdmin) {
      await ctx.reply(adminText.accessDenied);
      return;
    }
    const payload = ctx.message?.text.replace(/^\/variant_add(@\w+)?/i, "").trim() ?? "";
    const [productId, sku, title, rubPriceRaw, strategyRaw] = payload.split("|").map((part) => part.trim());
    const rubPrice = Number(rubPriceRaw);
    const strategy = strategyRaw as "mock" | "manual" | "external_api" | "custom";
    if (!productId || !sku || !title || !Number.isFinite(rubPrice) || !strategy) {
      await ctx.reply("Используйте формат: /variant_add productId | SKU | Название | 100 | mock");
      return;
    }
    const variantId = await ctx.services.adminService.createVariant({
      actorAdminId: ctx.appAdmin.id,
      productId,
      sku,
      title,
      rubPrice,
      fulfillmentStrategy: strategy,
    });
    await ctx.reply(`Вариант создан: ${variantId}`);
  });

  bot.command("promo_add", async (ctx) => {
    if (!ctx.appAdmin) {
      await ctx.reply(adminText.accessDenied);
      return;
    }
    const payload = ctx.message?.text.replace(/^\/promo_add(@\w+)?/i, "").trim() ?? "";
    const [code, type, valueRaw] = payload.split("|").map((part) => part.trim());
    const value = Number(valueRaw);
    if (!code || !type || !Number.isFinite(value)) {
      await ctx.reply("Используйте формат: /promo_add CODE | percent | 10");
      return;
    }
    const promoId = await ctx.services.adminService.createPromoCode({
      actorAdminId: ctx.appAdmin.id,
      code,
      type: type as "fixed_rub" | "percent" | "price_override",
      value,
    });
    await ctx.reply(`Промокод создан: ${promoId}`);
  });

  bot.command("manual_orders", async (ctx) => {
    if (!ctx.appAdmin) {
      await ctx.reply(adminText.accessDenied);
      return;
    }
    const orders = await ctx.services.adminService.listManualReviewOrders();
    if (orders.length === 0) {
      await ctx.reply("Очередь ручной проверки пуста.");
      return;
    }
    await ctx.reply(orders.map((order) => `${order.publicId} — ${order.status} / ${order.reviewStatus}`).join("\n"));
  });

  bot.command("fraud_flag", async (ctx) => {
    if (!ctx.appAdmin) {
      await ctx.reply(adminText.accessDenied);
      return;
    }
    const payload = ctx.message?.text.replace(/^\/fraud_flag(@\w+)?/i, "").trim() ?? "";
    const [telegramIdRaw, riskLevel, suspiciousRaw] = payload.split("|").map((part) => part.trim());
    const telegramId = Number(telegramIdRaw);
    const suspicious = suspiciousRaw === "1";
    if (!Number.isFinite(telegramId) || !riskLevel) {
      await ctx.reply("Используйте формат: /fraud_flag 123456789 | high | 1");
      return;
    }
    const targetUser = await ctx.services.repositories.users.findByTelegramId(telegramId);
    if (!targetUser) {
      await ctx.reply("Пользователь не найден.");
      return;
    }
    await ctx.services.adminService.flagUser({
      actorAdminId: ctx.appAdmin.id,
      userId: targetUser.id,
      riskLevel: riskLevel as "low" | "medium" | "high",
      suspicious,
    });
    await ctx.reply("Фрод-флаг обновлён.");
  });

  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.services.paymentService.validatePreCheckout({
      preCheckoutQueryId: ctx.preCheckoutQuery.id,
      invoicePayload: ctx.preCheckoutQuery.invoice_payload,
      userTelegramId: ctx.from.id,
      totalAmount: ctx.preCheckoutQuery.total_amount,
    });
  });

  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    await ctx.services.paymentService.handleSuccessfulPayment({
      paymentUpdateId: String(ctx.update.update_id),
      invoicePayload: payment.invoice_payload,
      telegramChargeId: payment.telegram_payment_charge_id,
      totalAmount: payment.total_amount,
    });
    await ctx.reply(uiText.paymentSuccess, { reply_markup: buildMainMenuKeyboard() });
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = decodeCallbackData(ctx.callbackQuery.data);
    try {
      await ctx.answerCallbackQuery();
    } catch (error) {
      if (!isExpiredCallbackQueryError(error)) {
        throw error;
      }
      services.deps.logger.warn("callback_query_expired", {
        updateId: ctx.update.update_id,
        callbackQueryId: ctx.callbackQuery.id,
        data: ctx.callbackQuery.data,
      });
    }

    if (data.action === "menu_home") {
      await renderHomeUi(ctx);
      return;
    }
    if (data.action === "menu_catalog") {
      await renderCatalogUi(ctx);
      return;
    }
    if (data.action === "menu_history") {
      await renderHistoryUi(ctx);
      return;
    }
    if (data.action === "menu_profile") {
      await renderProfileUi(ctx);
      return;
    }
    if (data.action === "menu_settings") {
      await renderSettingsUi(ctx);
      return;
    }
    if (data.action === "menu_support") {
      await renderSupportUi(ctx);
      return;
    }
    if (data.action === "product" && data.id) {
      await renderProductUi(ctx, data.id);
      return;
    }
    if (data.action === "checkout" && data.id) {
      await renderCheckoutMethodUi(ctx, data.id);
      return;
    }
    if (data.action === "checkout_back" && data.id) {
      const variant = await ctx.services.repositories.products.findVariantById(data.id);
      if (variant) {
        await renderProductUi(ctx, variant.productId);
      } else {
        await renderCatalogUi(ctx);
      }
      return;
    }
    if (data.action === "checkout_pay" && data.id && data.extra) {
      if (data.extra === "telegram_stars" || data.extra === "crypto_bot") {
        await startCheckoutWithMethodUi(ctx, data.id, data.extra);
        return;
      }
      return;
    }
    if (data.action === "admin_home") {
      await clearAdminFlowState(ctx);
      await renderAdminUi(ctx);
      return;
    }
    if (data.action === "admin_rate" || (ctx.appAdmin && data.action === "admin_rate_help")) {
      await clearAdminFlowState(ctx);
      await renderAdminCurrencyUi(ctx);
      return;
    }
    if (data.action === "admin_products") {
      await clearAdminFlowState(ctx);
      await renderAdminProductsUi(ctx);
      return;
    }
    if (data.action === "admin_product" && data.id) {
      await clearAdminFlowState(ctx);
      await renderAdminProductUi(ctx, data.id);
      return;
    }
    if (data.action === "admin_product_new") {
      await setAdminFlowState(ctx, { scope: "create_product", step: "slug" });
      await renderUiScreen(ctx, "Введите slug нового товара.", buildAdminCancelKeyboard("admin_products"));
      return;
    }
    if (data.action === "admin_product_edit" && data.id && data.extra) {
      if (data.extra === "title" || data.extra === "description") {
        await setAdminFlowState(ctx, { scope: "edit_product", productId: data.id, field: data.extra });
        await renderUiScreen(
          ctx,
          data.extra === "title" ? "Введите новое название товара." : "Введите новое описание товара.",
          buildAdminCancelKeyboard("admin_product", data.id),
        );
        return;
      }
    }
    if (data.action === "admin_photo" && data.id) {
      await setAdminFlowState(ctx, { scope: "update_product_photo", productId: data.id });
      await renderUiScreen(ctx, "Отправьте фото товара одним сообщением.", buildAdminCancelKeyboard("admin_product", data.id));
      return;
    }
    if (data.action === "admin_variants" && data.id) {
      await clearAdminFlowState(ctx);
      await renderAdminVariantsUi(ctx, data.id);
      return;
    }
    if (data.action === "admin_variant_item" && data.id) {
      await clearAdminFlowState(ctx);
      await renderAdminVariantUi(ctx, data.id);
      return;
    }
    if (data.action === "admin_variant" && data.id) {
      await clearAdminFlowState(ctx);
      await renderUiScreen(ctx, "Выберите стратегию для нового варианта.", buildAdminVariantStrategyKeyboard(data.id));
      return;
    }
    if (data.action === "admin_variant_strategy" && data.id && data.extra) {
      if (data.extra === "mock" || data.extra === "manual" || data.extra === "external_api" || data.extra === "custom") {
        await setAdminFlowState(ctx, {
          scope: "create_variant",
          productId: data.id,
          strategy: data.extra,
          step: "sku",
        });
        await renderUiScreen(ctx, "Введите SKU нового варианта.", buildAdminCancelKeyboard("admin_variants", data.id));
        return;
      }
    }
    if (data.action === "admin_variant_edit" && data.id && data.extra) {
      const variant = await ctx.services.repositories.products.findVariantById(data.id);
      if (!variant) {
        await renderUiScreen(ctx, "Вариант не найден.", buildAdminDashboardKeyboard());
        return;
      }
      if (data.extra === "title" || data.extra === "price") {
        await setAdminFlowState(ctx, {
          scope: "edit_variant",
          productId: variant.productId,
          variantId: data.id,
          field: data.extra,
        });
        await renderUiScreen(
          ctx,
          data.extra === "title" ? "Введите новое название варианта." : "Введите новую цену в RUB.",
          buildAdminCancelKeyboard("admin_variant_item", data.id),
        );
        return;
      }
    }
    if (data.action === "admin_risk") {
      await clearAdminFlowState(ctx);
      await renderAdminRiskUi(ctx);
      return;
    }
    if (data.action === "admin_manual") {
      await clearAdminFlowState(ctx);
      await renderAdminManualUi(ctx);
      return;
    }
    if (data.action === "settings_currency_set" && data.extra && ctx.appUser) {
      if (data.extra === "RUB" || data.extra === "USD") {
        try {
          await ctx.services.settingsService.updateUserCurrencyPreference(ctx.appUser.id, data.extra);
          await renderSettingsUi(ctx);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Не удалось обновить валюту.";
          await ctx.reply(message);
        }
        return;
      }
    }
    if (data.action === "admin_rate_edit") {
      await setAdminFlowState(ctx, { scope: "update_usd_rate" });
      await ctx.reply("Введите курс RUB за 1 USD, например: 96.5");
      return;
    }
    if (data.action === "admin_promos") {
      await clearAdminFlowState(ctx);
      await renderAdminPromosUi(ctx);
      return;
    }
    if (data.action === "admin_promo_new") {
      await clearAdminFlowState(ctx);
      await renderUiScreen(ctx, "Выберите тип промокода.", buildAdminPromoTypeKeyboard());
      return;
    }
    if (data.action === "admin_promo_type" && data.extra) {
      if (data.extra === "fixed_rub" || data.extra === "percent" || data.extra === "price_override") {
        const promoType = data.extra;
        await setAdminFlowState(ctx, { scope: "create_promo", step: "code", promoType });
        await ctx.reply("Введите код промокода.");
        return;
      }
    }
    if (data.action === "admin_cancel") {
      await clearAdminFlowState(ctx);
      await renderAdminUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_rate_help") {
      await clearAdminFlowState(ctx);
      await renderAdminCurrencyUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_flag") {
      await renderAdminRiskUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_manual") {
      await renderAdminManualUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_flag_level") {
      await renderAdminRiskUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_flag_suspicious") {
      await renderAdminRiskUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_rate") {
      await renderAdminCurrencyUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_promos") {
      await renderAdminPromosUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_products") {
      await renderAdminProductsUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_home") {
      await renderAdminUi(ctx);
      return;
    }
    if (ctx.appAdmin && data.action.startsWith("admin_")) {
      await renderAdminUi(ctx);
      return;
    }
  });

  const webhook = webhookCallback(bot, "cloudflare-mod");
  return { bot, webhook };
}






