export interface Env {
  APP_ENV: "development" | "staging" | "production";
  BOT_TOKEN: string;
  BOT_WEBHOOK_SECRET: string;
  BOT_WEBHOOK_PATH: string;
  BOT_USERNAME: string;
  CATALOG_IMAGE_URL?: string;
  BOT_OWNER_TELEGRAM_ID: string;
  BOT_ADMIN_GROUP_ID?: string;
  APP_TIMEZONE?: string;
  DEFAULT_LANGUAGE?: string;
  PAYMENT_CURRENCY?: "XTR";
  DEFAULT_EXCHANGE_RATE_RUB_PER_XTR?: string;
  BOT_DB: D1Database;
  APP_KV: KVNamespace;
}
