import { describe, expect, it, vi } from "vitest";
import { FraudService } from "@services/fraud.service";
import { createServiceDeps, createTestUser } from "./helpers";

describe("fraud service", () => {
  it("marks user suspicious when order rate threshold is exceeded", async () => {
    const deps = createServiceDeps({
      repositories: {
        ...createServiceDeps().repositories,
        settings: {
          get: vi.fn(async (key: string) => {
            if (key === "fraud.orders_per_10m") return "1";
            if (key === "fraud.failed_payments_per_30m") return "3";
            if (key === "fraud.promo_rejected_per_24h") return "3";
            return null;
          }),
          upsert: vi.fn(),
        },
      } as never,
    });

    const service = new FraudService(deps);
    const user = createTestUser();

    await service.recordOrderAttempt(user);
    await service.recordOrderAttempt(user);

    expect(deps.repositories.users.updateRiskState).toHaveBeenCalledWith(user.id, "medium", true, expect.any(String));
    expect(deps.repositories.abuseEvents.create).toHaveBeenCalled();
  });
});
