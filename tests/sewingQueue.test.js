import { describe, expect, it } from "vitest";
import { QUEUE_STATUSES } from "@/server/domain/sewingQueue";
import { canTransition } from "@/server/domain/transitions";

describe("QUEUE_STATUSES (sewing query isolation)", () => {
  it("is exactly VERIFIED and SEWING_STARTED", () => {
    expect([...QUEUE_STATUSES].sort()).toEqual(["SEWING_STARTED", "VERIFIED"]);
  });

  it("never includes an unverified, pending or rejected status", () => {
    expect(QUEUE_STATUSES).not.toContain("PENDING_VERIFICATION");
    expect(QUEUE_STATUSES).not.toContain("REJECTED");
  });

  it("is frozen so it cannot be widened at runtime", () => {
    expect(Object.isFrozen(QUEUE_STATUSES)).toBe(true);
    expect(() => QUEUE_STATUSES.push("PENDING_VERIFICATION")).toThrow(TypeError);
    expect(QUEUE_STATUSES).toHaveLength(2);
  });
});

describe("sewing handoff transition", () => {
  it("allows VERIFIED -> SEWING_STARTED", () => {
    expect(canTransition("VERIFIED", "SEWING_STARTED")).toBe(true);
  });

  it("does not let an order reach sewing from any unverified state", () => {
    expect(canTransition("PENDING_VERIFICATION", "SEWING_STARTED")).toBe(false);
    expect(canTransition("REJECTED", "SEWING_STARTED")).toBe(false);
  });

  it("does not let a queued order leave the queue backwards", () => {
    for (const to of ["PENDING_VERIFICATION", "REJECTED", "VERIFIED"]) {
      expect(canTransition("SEWING_STARTED", to)).toBe(false);
    }
    expect(canTransition("VERIFIED", "PENDING_VERIFICATION")).toBe(false);
    expect(canTransition("VERIFIED", "REJECTED")).toBe(false);
  });
});
