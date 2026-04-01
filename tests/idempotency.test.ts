import { describe, expect, it } from "vitest";
import { IdempotencyService } from "@services/idempotency.service";
import { createServiceDeps } from "./helpers";

describe("idempotency service", () => {
  it("marks and detects payment updates", async () => {
    const deps = createServiceDeps();
    const service = new IdempotencyService(deps);

    await expect(service.hasProcessedPaymentUpdate("42")).resolves.toBe(false);
    await service.markPaymentUpdateProcessed("42");
    await expect(service.hasProcessedPaymentUpdate("42")).resolves.toBe(true);
  });
});
