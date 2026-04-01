import type { Logger } from "@infra/logger";

export interface KvStore {
  get<T = string>(key: string): Promise<T | null>;
  put(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export class CloudflareKvStore implements KvStore {
  constructor(
    private readonly kv: KVNamespace,
    private readonly logger: Logger,
  ) {}

  async get<T = string>(key: string): Promise<T | null> {
    const value = await this.kv.get(key, "json");
    return value as T | null;
  }

  async put(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.kv.put(
      key,
      value,
      ttlSeconds
        ? {
            expirationTtl: ttlSeconds,
          }
        : undefined,
    );
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}

export function catalogCacheKey(): string {
  return "catalog:v1";
}

export function paymentIdempotencyKey(paymentUpdateId: string): string {
  return `payment_update:${paymentUpdateId}`;
}

export function updateIdempotencyKey(updateId: number): string {
  return `tg_update:${updateId}`;
}

export function rateLimitKey(scope: string, actorId: string, bucket: string): string {
  return `rate_limit:${scope}:${actorId}:${bucket}`;
}

export function checkoutStateKey(userId: string): string {
  return `checkout_state:${userId}`;
}
