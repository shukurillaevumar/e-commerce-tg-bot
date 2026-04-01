import { createBot } from "@bot/build-bot";
import type { Env } from "@infra/bindings";
import type { CryptoPayInvoicePaidUpdate } from "@infra/crypto-pay";
import { text, toErrorResponse } from "@infra/http";
import { createLogger } from "@infra/logger";
import { createServiceContainer } from "@services/container";

async function handleFetch(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET" && new URL(request.url).pathname === "/healthz") {
    return text("ok");
  }

  const services = createServiceContainer(env);
  await services.bootstrapService.bootstrap();

  const webhookPath = env.BOT_WEBHOOK_PATH || "/webhook/telegram";
  const cryptoWebhookPath = env.CRYPTO_PAY_WEBHOOK_PATH;
  const { webhook } = createBot(env);
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === webhookPath) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== env.BOT_WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    return webhook(request);
  }

  if (request.method === "POST" && cryptoWebhookPath && url.pathname === cryptoWebhookPath) {
    if (!services.deps.cryptoPay.isEnabled()) {
      return new Response("not configured", { status: 503 });
    }

    const body = await request.text();
    const signature = request.headers.get("crypto-pay-api-signature");
    const isValid = await services.deps.cryptoPay.verifyWebhookSignature(body, signature);
    if (!isValid) {
      return new Response("forbidden", { status: 403 });
    }

    const update = JSON.parse(body) as CryptoPayInvoicePaidUpdate;
    if (update.update_type === "invoice_paid") {
      await services.paymentService.handleCryptoPayInvoicePaid(update);
    }
    return text("ok");
  }

  return new Response("not found", { status: 404 });
}

async function handleScheduled(env: Env): Promise<void> {
  const services = createServiceContainer(env);
  await services.bootstrapService.bootstrap();
  await services.orderService.expireInvoices();
  await services.fulfillmentService.processRunnableJobs();
  await services.adminService.sendManualQueueReminders();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const logger = createLogger({ env: env.APP_ENV });
    try {
      return await handleFetch(request, env);
    } catch (error) {
      logger.error("fetch_unhandled_error", {
        error: error instanceof Error ? error.message : String(error),
        path: new URL(request.url).pathname,
        method: request.method,
      });
      return toErrorResponse(error);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const logger = createLogger({ env: env.APP_ENV });
    try {
      await handleScheduled(env);
    } catch (error) {
      logger.error("scheduled_unhandled_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
};
