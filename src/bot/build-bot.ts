import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { adminText, uiText } from "@domain/messages";
import type { ProductVariant } from "@domain/models";
import { createServiceContainer, type ServiceContainer } from "@services/container";
import type { Env } from "@infra/bindings";
import type { BotContext } from "@bot/context";
import { buildCatalogKeyboard, buildMainMenuKeyboard, buildProductKeyboard } from "@bot/keyboards";
import { decodeCallbackData } from "@utils/callback-data";

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
  await ctx.reply(uiText.catalog, {
    reply_markup: buildCatalogKeyboard(catalog),
  });
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
    await ctx.reply(uiText.welcome, {
      reply_markup: buildMainMenuKeyboard(),
    });
  });

  bot.command("catalog", renderCatalog);
  bot.command("orders", renderHistory);
  bot.command("profile", renderProfile);
  bot.command("admin", renderAdmin);
  bot.command("support", async (ctx) => {
    if (!ctx.appUser) {
      return;
    }

    const payload = ctx.message?.text.replace(/^\/support(@\w+)?/i, "").trim() ?? "";
    const [subjectRaw, ...messageParts] = payload.split("|");
    const subject = subjectRaw?.trim();
    const message = messageParts.join("|").trim();

    if (!subject || !message) {
      await renderSupport(ctx);
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
    await ctx.answerCallbackQuery();

    if (data.action === "menu_home") {
      await ctx.reply(uiText.welcome, { reply_markup: buildMainMenuKeyboard() });
      return;
    }
    if (data.action === "menu_catalog") {
      await renderCatalog(ctx);
      return;
    }
    if (data.action === "menu_history") {
      await renderHistory(ctx);
      return;
    }
    if (data.action === "menu_profile") {
      await renderProfile(ctx);
      return;
    }
    if (data.action === "menu_support") {
      await renderSupport(ctx);
      return;
    }
    if (data.action === "product" && data.id) {
      await renderProduct(ctx, data.id);
      return;
    }
    if (data.action === "checkout" && data.id) {
      await checkoutVariant(ctx, data.id);
      return;
    }
    if (ctx.appAdmin && data.action === "admin_rate_help") {
      await ctx.reply("Для обновления курса используйте команду /rate 1.25");
    }
  });

  const webhook = webhookCallback(bot, "cloudflare-mod");
  return { bot, webhook };
}
