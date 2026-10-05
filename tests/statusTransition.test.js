import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@/server/http";
import { transitionStatus } from "@/server/statusTransition";

// Minimal chainable stand-in for drizzle's update().set().where().returning().
function fakeTx(rows) {
  const calls = {};
  const chain = {
    update: vi.fn(() => chain),
    set: vi.fn((v) => {
      calls.set = v;
      return chain;
    }),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => rows),
  };
  return { tx: chain, calls };
}

describe("transitionStatus", () => {
  it("returns the updated row and sets status plus extra columns when the guard matches", async () => {
    const { tx, calls } = fakeTx([{ id: 7 }]);
    const result = await transitionStatus(tx, {
      orderId: 7,
      from: "PENDING_VERIFICATION",
      to: "VERIFIED",
      set: { rejectionCount: 0 },
    });
    expect(result).toEqual({ id: 7 });
    expect(calls.set.status).toBe("VERIFIED");
    expect(calls.set.rejectionCount).toBe(0);
    expect(calls.set.updatedAt).toBeInstanceOf(Date);
  });

  it("cannot be overridden by a status inside `set`", async () => {
    const { tx, calls } = fakeTx([{ id: 1 }]);
    await transitionStatus(tx, {
      orderId: 1,
      from: "PENDING_VERIFICATION",
      to: "REJECTED",
      set: { status: "VERIFIED" },
    });
    expect(calls.set.status).toBe("REJECTED");
  });

  it("throws HttpError 409 when no row matches (already processed or wrong state)", async () => {
    const { tx } = fakeTx([]);
    const promise = transitionStatus(tx, { orderId: 7, from: "PENDING_VERIFICATION", to: "VERIFIED" });
    await expect(promise).rejects.toBeInstanceOf(HttpError);
    await expect(promise).rejects.toMatchObject({ status: 409 });
  });

  it("refuses an illegal transition before touching the database", async () => {
    const { tx } = fakeTx([{ id: 7 }]);
    await expect(
      transitionStatus(tx, { orderId: 7, from: "PENDING_VERIFICATION", to: "SEWING_STARTED" }),
    ).rejects.toThrow(/Illegal order transition/);
    await expect(
      transitionStatus(tx, { orderId: 7, from: "REJECTED", to: "VERIFIED" }),
    ).rejects.toThrow(/Illegal order transition/);
    expect(tx.update).not.toHaveBeenCalled();
  });
});
