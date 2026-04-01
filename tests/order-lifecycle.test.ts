import { describe, expect, it } from "vitest";
import { assertValidOrderTransition, canTransitionOrder } from "@domain/state-machine";

describe("order lifecycle", () => {
  it("allows mandatory valid transitions", () => {
    expect(canTransitionOrder("created", "invoice_sent")).toBe(true);
    expect(canTransitionOrder("invoice_sent", "paid")).toBe(true);
    expect(canTransitionOrder("paid", "processing")).toBe(true);
    expect(canTransitionOrder("processing", "completed")).toBe(true);
    expect(canTransitionOrder("processing", "failed")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(() => assertValidOrderTransition("created", "completed")).toThrowError();
    expect(() => assertValidOrderTransition("completed", "processing")).toThrowError();
    expect(() => assertValidOrderTransition("failed", "completed")).toThrowError();
  });
});
