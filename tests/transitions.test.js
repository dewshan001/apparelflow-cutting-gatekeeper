import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS, canTransition } from "@/server/domain/transitions";

const STATUSES = ["PENDING_VERIFICATION", "REJECTED", "VERIFIED", "SEWING_STARTED"];

const ALLOWED = new Set([
  "PENDING_VERIFICATION>VERIFIED",
  "PENDING_VERIFICATION>REJECTED",
  "REJECTED>PENDING_VERIFICATION",
  "VERIFIED>SEWING_STARTED",
]);

describe("ALLOWED_TRANSITIONS", () => {
  it("allows exactly the four legal edges and rejects every other pair", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(ALLOWED.has(`${from}>${to}`));
      }
    }
  });

  it("never lets an order skip verification", () => {
    expect(canTransition("PENDING_VERIFICATION", "SEWING_STARTED")).toBe(false);
    expect(canTransition("REJECTED", "VERIFIED")).toBe(false);
    expect(canTransition("REJECTED", "SEWING_STARTED")).toBe(false);
  });

  it("treats VERIFIED and SEWING_STARTED as one-way (no way back)", () => {
    for (const to of STATUSES) {
      expect(canTransition("SEWING_STARTED", to)).toBe(false);
    }
    expect(canTransition("VERIFIED", "PENDING_VERIFICATION")).toBe(false);
    expect(canTransition("VERIFIED", "REJECTED")).toBe(false);
  });

  it("rejects unknown statuses and inherited object keys", () => {
    expect(canTransition("DONE", "VERIFIED")).toBe(false);
    expect(canTransition("PENDING_VERIFICATION", "DONE")).toBe(false);
    expect(canTransition("constructor", "VERIFIED")).toBe(false);
    expect(canTransition(undefined, undefined)).toBe(false);
  });

  it("is frozen so it cannot be altered at runtime", () => {
    expect(Object.isFrozen(ALLOWED_TRANSITIONS)).toBe(true);
    for (const list of Object.values(ALLOWED_TRANSITIONS)) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });
});
