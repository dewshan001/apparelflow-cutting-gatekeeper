import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cuttingOrders } from "@/db/schema";
import { HttpError } from "@/server/http";
import { transitionStatus } from "@/server/statusTransition";
import { as } from "../helpers/api.js";
import { createOrder, rejectAs } from "../helpers/flows.js";
import { getTestDb, resetData } from "../helpers/testDb.js";

let db;
const statusOf = async (id) =>
  (await db.select({ s: cuttingOrders.status }).from(cuttingOrders).where(eq(cuttingOrders.id, id)))[0].s;

beforeAll(async () => {
  db = await getTestDb();
});

beforeEach(async () => {
  await resetData();
  await as(null);
});

// transitionStatus is the last line of defence: even called directly, it must refuse to move an
// order that is not in the expected state, independent of any caller-side checks.
describe("transitionStatus against a real database", () => {
  it("moves the order when it is in the expected state", async () => {
    const order = await createOrder();
    const row = await transitionStatus(db, { orderId: order.id, from: "PENDING_VERIFICATION", to: "VERIFIED" });
    expect(row).toEqual({ id: order.id });
    expect(await statusOf(order.id)).toBe("VERIFIED");
  });

  it("returns 409 and changes nothing when the order is in a different state", async () => {
    const order = await createOrder();
    await rejectAs("verifier", order, { note: "Defective fabric" });

    const attempt = transitionStatus(db, { orderId: order.id, from: "PENDING_VERIFICATION", to: "VERIFIED" });

    await expect(attempt).rejects.toBeInstanceOf(HttpError);
    await expect(attempt).rejects.toMatchObject({ status: 409 });
    expect(await statusOf(order.id)).toBe("REJECTED");
  });

  it("returns 409 for an order that does not exist", async () => {
    await expect(
      transitionStatus(db, { orderId: 4242, from: "PENDING_VERIFICATION", to: "VERIFIED" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("lets exactly one of several simultaneous transitions win", async () => {
    const order = await createOrder();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => transitionStatus(db, { orderId: order.id, from: "PENDING_VERIFICATION", to: "VERIFIED" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && r.reason.status === 409)).toHaveLength(5);
  });

  it("refuses an illegal transition outright and never touches the row", async () => {
    const order = await createOrder();
    await expect(
      transitionStatus(db, { orderId: order.id, from: "PENDING_VERIFICATION", to: "SEWING_STARTED" }),
    ).rejects.toThrow(/Illegal order transition/);
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
  });
});
