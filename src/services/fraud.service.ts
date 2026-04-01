import { rateLimitKey } from "@infra/kv";
import type { User } from "@domain/models";
import type { FraudRiskLevel } from "@domain/enums";
import type { ServiceDeps } from "@services/types";
import { SettingsService } from "@services/settings.service";

export interface FraudCheckoutDecision {
  allowed: boolean;
  riskLevel: FraudRiskLevel;
  requiresManualReview: boolean;
  reasons: string[];
}

export class FraudService {
  private readonly settingsService: SettingsService;

  constructor(private readonly deps: ServiceDeps) {
    this.settingsService = new SettingsService(deps);
  }

  private async incrementWindowCounter(scope: string, actorId: string, bucket: string, ttlSeconds: number): Promise<number> {
    const key = rateLimitKey(scope, actorId, bucket);
    const current = (await this.deps.kv.get<{ count: number }>(key)) ?? { count: 0 };
    const next = current.count + 1;
    await this.deps.kv.put(key, JSON.stringify({ count: next }), ttlSeconds);
    return next;
  }

  async evaluateCheckout(user: User): Promise<FraudCheckoutDecision> {
    if (user.allowlisted) {
      return { allowed: true, riskLevel: "low", requiresManualReview: false, reasons: [] };
    }

    if (user.denylisted) {
      return {
        allowed: false,
        riskLevel: "high",
        requiresManualReview: true,
        reasons: ["Пользователь находится в denylist"],
      };
    }

    if (user.riskLevel === "high" || user.suspicious) {
      return {
        allowed: false,
        riskLevel: "high",
        requiresManualReview: true,
        reasons: ["Аккаунт требует ручной проверки"],
      };
    }

    return {
      allowed: true,
      riskLevel: user.riskLevel,
      requiresManualReview: false,
      reasons: [],
    };
  }

  async recordOrderAttempt(user: User): Promise<void> {
    const thresholds = await this.settingsService.getFraudThresholds();
    const count = await this.incrementWindowCounter("orders", user.id, "10m", 10 * 60);

    if (count > thresholds.ordersPer10m) {
      const now = this.deps.clock.now().toISOString();
      await this.deps.repositories.users.updateRiskState(user.id, "medium", true, now);
      await this.deps.repositories.abuseEvents.create({
        userId: user.id,
        eventType: "orders_rate_limit",
        riskLevel: "medium",
        signal: "orders_per_10m",
        payload: { count, threshold: thresholds.ordersPer10m },
        now,
      });
    }
  }

  async recordFailedPayment(user: User, details: Record<string, unknown>): Promise<void> {
    const thresholds = await this.settingsService.getFraudThresholds();
    const count = await this.incrementWindowCounter("failed_payments", user.id, "30m", 30 * 60);
    const now = this.deps.clock.now().toISOString();

    if (count > thresholds.failedPaymentsPer30m) {
      await this.deps.repositories.users.updateRiskState(user.id, "medium", true, now);
      await this.deps.repositories.abuseEvents.create({
        userId: user.id,
        eventType: "failed_payments",
        riskLevel: "medium",
        signal: "failed_payments_per_30m",
        payload: { count, threshold: thresholds.failedPaymentsPer30m, ...details },
        now,
      });
    }
  }

  async recordPromoRejected(user: User, details: Record<string, unknown>): Promise<void> {
    const thresholds = await this.settingsService.getFraudThresholds();
    const count = await this.incrementWindowCounter("promo_rejected", user.id, "24h", 24 * 60 * 60);
    const now = this.deps.clock.now().toISOString();

    if (count > thresholds.promoRejectedPer24h) {
      await this.deps.repositories.users.updateRiskState(user.id, "medium", true, now);
      await this.deps.repositories.abuseEvents.create({
        userId: user.id,
        eventType: "promo_abuse",
        riskLevel: "medium",
        signal: "promo_rejected_per_24h",
        payload: { count, threshold: thresholds.promoRejectedPer24h, ...details },
        now,
      });
    }
  }

  async escalateHighRisk(userId: string, signal: string, payload: Record<string, unknown>): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    await this.deps.repositories.users.updateRiskState(userId, "high", true, now);
    await this.deps.repositories.abuseEvents.create({
      userId,
      eventType: "multiple_accounts_pattern",
      riskLevel: "high",
      signal,
      payload,
      now,
    });
  }
}
