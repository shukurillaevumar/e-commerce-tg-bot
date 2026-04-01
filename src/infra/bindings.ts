export interface Env {
  APP_ENV: "development" | "staging" | "production";
  BOT_TOKEN: string;
  BOT_WEBHOOK_SECRET: string;
  BOT_WEBHOOK_PATH: string;
  BOT_USERNAME: string;
  CATALOG_IMAGE_URL?: string;
  CRYPTO_PAY_API_TOKEN?: string;
  CRYPTO_PAY_WEBHOOK_PATH?: string;
  CRYPTO_PAY_API_BASE_URL?: string;
  CRYPTO_PAY_ACCEPTED_ASSETS?: string;
  CRYPTO_PAY_SWAP_TO?: string;
  BOT_OWNER_TELEGRAM_ID: string;
  BOT_ADMIN_GROUP_ID?: string;
  APP_TIMEZONE?: string;
  DEFAULT_LANGUAGE?: string;
  PAYMENT_CURRENCY?: "XTR";
  DEFAULT_EXCHANGE_RATE_RUB_PER_XTR?: string;
  BOT_DB: D1Database;
  APP_KV: KVNamespace;
}
