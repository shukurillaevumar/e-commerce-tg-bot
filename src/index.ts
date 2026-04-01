import { createBot } from "@bot/build-bot";
import type { Env } from "@infra/bindings";
import { text, toErrorResponse } from "@infra/http";
import { createServiceContainer } from "@services/container";

async function handleFetch(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET" && new URL(request.url).pathname === "/healthz") {
    return text("ok");
  }

  const services = createServiceContainer(env);
  await services.bootstrapService.bootstrap();

  const webhookPath = env.BOT_WEBHOOK_PATH || "/webhook/telegram";
  const { webhook } = createBot(env);
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === webhookPath) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== env.BOT_WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    return webhook(request);
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
    try {
      return await handleFetch(request, env);
    } catch (error) {
      return toErrorResponse(error);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env);
  },
};
