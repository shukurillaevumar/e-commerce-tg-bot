import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { adminText, uiText } from "@domain/messages";
import type { ProductVariant } from "@domain/models";
import { activeUiMessageKey } from "@infra/kv";
import { createServiceContainer, type ServiceContainer } from "@services/container";
import type { Env } from "@infra/bindings";
import type { BotContext } from "@bot/context";
import { buildCatalogKeyboard, buildMainMenuKeyboard, buildProductKeyboard } from "@bot/keyboards";
import { decodeCallbackData } from "@utils/callback-data";

const ACTIVE_UI_TTL_SECONDS = 60 * 60 * 24 * 14;

interface ActiveUiState {
  messageId: number;
}

function formatVariantSummary(variant: ProductVariant, rub: number, xtr: number): string {
  const parts = [variant.title, `Цена: ${rub} RUB`, `К оплате: ${xtr} XTR`];
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
      label: `${variant.title} • ${quote.snapshot.rubPriceFinal} RUB / ${quote.snapshot.xtrPrice} XTR`,
    });
    lines.push(formatVariantSummary(variant, quote.snapshot.rubPriceFinal, quote.snapshot.xtrPrice));
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
    variant,
  });

  await ctx.reply(
    `${uiText.checkout}\n\nЗаказ: ${updatedOrder.publicId}\n` +
      `Цена: ${updatedOrder.pricingSnapshot.rubPriceFinal} RUB\n` +
      `К оплате: ${updatedOrder.pricingSnapshot.xtrPrice} XTR\n\n` +
      `Оплата производится через Telegram Stars`,
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

  const lines = ["История заказов:\n"];
  for (const order of orders) {
    lines.push(
      `• ${order.publicId} — ${order.status}\n` +
        `  ${order.pricingSnapshot.rubPriceFinal} RUB / ${order.pricingSnapshot.xtrPrice} XTR`,
    );
  }

  await ctx.reply(lines.join("\n"), { reply_markup: buildMainMenuKeyboard() });
}

async function renderProfile(ctx: BotContext): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  await ctx.reply(
    `${uiText.profile}\n\n` +
      `Telegram ID: ${ctx.appUser.telegramId}\n` +
      `Статус риска: ${ctx.appUser.riskLevel}\n` +
      `Реферальный код: ${ctx.appUser.referralCode}`,
    { reply_markup: buildMainMenuKeyboard() },
  );
}

async function renderSupport(ctx: BotContext): Promise<void> {
  await ctx.reply(
    `${uiText.supportIntro}\n\nФормат для открытия обращения:\n/support Тема | Описание`,
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
      `Manual review: ${summary.manualReviewCount}\n` +
      `Текущий курс: ${summary.currentRate ? `${(summary.currentRate as { rateRubPerStar: number }).rateRubPerStar} RUB/XTR` : "не задан"}`,
    {
      reply_markup: new InlineKeyboard()
        .text("Главное меню", "menu_home")
        .row()
        .text("Обновить курс", "admin_rate_help"),
    },
  );
}

async function renderHomeUi(ctx: BotContext): Promise<void> {
  await renderUiScreen(ctx, uiText.welcome, buildMainMenuKeyboard());
}

async function renderCatalogUi(ctx: BotContext): Promise<void> {
  const catalog = await ctx.services.catalogService.getCatalog();
  await deleteTrackedUiMessage(ctx, currentUiMessageId(ctx));

  const catalogImageUrl = ctx.services.deps.env.CATALOG_IMAGE_URL?.trim();
  const sent = catalogImageUrl
    ? await ctx.replyWithPhoto(catalogImageUrl, {
        caption: uiText.catalog,
        reply_markup: buildCatalogKeyboard(catalog),
      })
    : await ctx.reply(uiText.catalog, {
        reply_markup: buildCatalogKeyboard(catalog),
      });
  await setActiveUiMessage(ctx, sent.message_id);
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
      label: `${variant.title} • ${quote.snapshot.rubPriceFinal} RUB / ${quote.snapshot.xtrPrice} XTR`,
    });
    lines.push(formatVariantSummary(variant, quote.snapshot.rubPriceFinal, quote.snapshot.xtrPrice));
    lines.push("");
  }

  await renderUiScreen(ctx, lines.join("\n"), buildProductKeyboard(productId, buttons));
}

async function renderHistoryUi(ctx: BotContext): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  const orders = await ctx.services.repositories.orders.listByUserId(ctx.appUser.id);
  if (orders.length === 0) {
    await renderUiScreen(ctx, uiText.historyEmpty, buildMainMenuKeyboard());
    return;
  }

  const lines = ["История заказов:\n"];
  for (const order of orders) {
    lines.push(`• ${order.publicId} — ${order.status}\n  ${order.pricingSnapshot.rubPriceFinal} RUB / ${order.pricingSnapshot.xtrPrice} XTR`);
  }

  await renderUiScreen(ctx, lines.join("\n"), buildMainMenuKeyboard());
}

async function renderProfileUi(ctx: BotContext): Promise<void> {
  if (!ctx.appUser) {
    return;
  }

  await renderUiScreen(
    ctx,
    `${uiText.profile}\n\n` +
      `Telegram ID: ${ctx.appUser.telegramId}\n` +
      `Статус риска: ${ctx.appUser.riskLevel}\n` +
      `Реферальный код: ${ctx.appUser.referralCode}`,
    buildMainMenuKeyboard(),
  );
}

async function renderSupportUi(ctx: BotContext): Promise<void> {
  await renderUiScreen(
    ctx,
    `${uiText.supportIntro}\n\nФормат для открытия обращения:\n/support Тема | Описание`,
    buildMainMenuKeyboard(),
  );
}

async function renderAdminUi(ctx: BotContext): Promise<void> {
  if (!ctx.appAdmin) {
    await renderUiScreen(ctx, adminText.accessDenied, buildMainMenuKeyboard());
    return;
  }

  const summary = await ctx.services.adminService.getDashboardSummary();
  await renderUiScreen(
    ctx,
    `${adminText.dashboard}\n\n` +
      `Manual review: ${summary.manualReviewCount}\n` +
      `Текущий курс: ${summary.currentRate ? `${(summary.currentRate as { rateRubPerStar: number }).rateRubPerStar} RUB/XTR` : "не задан"}`,
    new InlineKeyboard().text("Главное меню", "menu_home").row().text("Обновить курс", "admin_rate_help"),
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
    variant,
  });

  await ctx.reply(
    `${uiText.checkout}\n\nЗаказ: ${updatedOrder.publicId}\n` +
      `Цена: ${updatedOrder.pricingSnapshot.rubPriceFinal} RUB\n` +
      `К оплате: ${updatedOrder.pricingSnapshot.xtrPrice} XTR\n\n` +
      `Оплата производится через Telegram Stars`,
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
  bot.command("admin", renderAdminUi);
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
    if (data.action === "menu_support") {
      await renderSupportUi(ctx);
      return;
    }
    if (data.action === "product" && data.id) {
      await renderProductUi(ctx, data.id);
      return;
    }
    if (data.action === "checkout" && data.id) {
      await checkoutVariantUi(ctx, data.id);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_rate_help") {
      await ctx.reply("Для обновления курса используйте команду /rate 1.25");
    }
  });

  const webhook = webhookCallback(bot, "cloudflare-mod");
  return { bot, webhook };
}
