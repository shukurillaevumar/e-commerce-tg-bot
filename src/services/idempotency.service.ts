import { paymentIdempotencyKey, updateIdempotencyKey } from "@infra/kv";
import type { ServiceDeps } from "@services/types";

export class IdempotencyService {
  constructor(private readonly deps: ServiceDeps) {}

  async hasProcessedPaymentUpdate(updateId: string): Promise<boolean> {
    const key = paymentIdempotencyKey(updateId);
    const value = await this.deps.kv.get<string>(key);
    return Boolean(value);
  }

  async markPaymentUpdateProcessed(updateId: string): Promise<void> {
    const key = paymentIdempotencyKey(updateId);
    await this.deps.kv.put(key, JSON.stringify({ processed: true }), 60 * 60 * 24 * 14);
  }

  async hasProcessedTelegramUpdate(updateId: number): Promise<boolean> {
    const key = updateIdempotencyKey(updateId);
    const value = await this.deps.kv.get<string>(key);
    return Boolean(value);
  }

  async markTelegramUpdateProcessed(updateId: number): Promise<void> {
    const key = updateIdempotencyKey(updateId);
    await this.deps.kv.put(key, JSON.stringify({ processed: true }), 60 * 60);
  }
}
