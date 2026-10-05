import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cuttingOrders, verificationLogs } from "@/db/schema";
import { getQueueItem, listQueue } from "@/server/sewingService";
import { as, call } from "../helpers/api.js";
import {
  createOrder,
  createVerifiedOrder,
  idParam,
  rejectAs,
  routes,
  saveCounts,
  exact,
  startSewing,
} from "../helpers/flows.js";
import { getTestDb, resetData } from "../helpers/testDb.js";

let db;
const statusOf = async (id) =>
  (await db.select({ s: cuttingOrders.status }).from(cuttingOrders).where(eq(cuttingOrders.id, id)))[0].s;
const logCount = async () => (await db.select().from(verificationLogs)).length;

/** One order in every lifecycle state, plus a re-cut order that finally passed. */
async function buildAllStates() {
  const pending = await createOrder({ fabricRollId: "FAB-PENDING" });

  const counted = await createOrder({ fabricRollId: "FAB-COUNTED-NOT-APPROVED" });
  await saveCounts(counted, exact); // perfect counts, but nobody approved it

  const rejected = await createOrder({ fabricRollId: "FAB-REJECTED" });
  await rejectAs("verifier", rejected, { note: "Defective fabric on roll" });

  const verified = await createVerifiedOrder({ fabricRollId: "FAB-VERIFIED" });

  const started = await createVerifiedOrder({ fabricRollId: "FAB-STARTED" });
  await startSewing(started);

  return { pending, counted, rejected, verified, started };
}

beforeAll(async () => {
  db = await getTestDb();
});

beforeEach(async () => {
  await resetData();
  await as(null);
});

describe("Test 5: unapproved orders never appear in the Sewing Queue database query", () => {
  it("listQueue() returns only VERIFIED and SEWING_STARTED orders", async () => {
    const o = await buildAllStates();
    const ids = (await listQueue()).map((x) => x.id);

    expect(ids).toEqual([o.verified.id, o.started.id]);
    for (const hidden of [o.pending, o.counted, o.rejected]) expect(ids).not.toContain(hidden.id);
  });

  it("the endpoint returns the same safe list and ignores every query-string attempt to widen it", async () => {
    const o = await buildAllStates();
    await as("sewing");
    const expected = [o.verified.id, o.started.id];

    const attempts = [
      "",
      "?status=PENDING_VERIFICATION",
      "?status=REJECTED",
      "?status=all",
      "?status=*",
      `?id=${o.pending.id}`,
      `?orderId=${o.rejected.id}`,
      "?where=1",
      "?status=VERIFIED'%20OR%20'1'='1",
      "?status[]=PENDING_VERIFICATION&status[]=REJECTED",
      "?status=PENDING_VERIFICATION,REJECTED,VERIFIED",
      "?limit=1000&offset=-1",
    ];
    for (const query of attempts) {
      const res = await call(routes.sewingQueue.GET, { query });
      expect(res.status, query).toBe(200);
      expect(res.json.orders.map((x) => x.id), query).toEqual(expected);
      expect(res.json.orders.every((x) => ["VERIFIED", "SEWING_STARTED"].includes(x.status))).toBe(true);
    }
  });

  it("an order that was rejected and then re-cut appears only after it is actually verified", async () => {
    const order = await createOrder();
    await rejectAs("verifier", order, { note: "Collar short before re-cut" });
    await as("supervisor");
    await call(routes.resubmit.POST, { method: "POST", params: idParam(order.id) });
    expect((await listQueue()).map((x) => x.id)).not.toContain(order.id); // pending again

    await saveCounts(order, exact);
    await as("verifier");
    await call(routes.approve.POST, { method: "POST", params: idParam(order.id) });
    expect((await listQueue()).map((x) => x.id)).toContain(order.id);
  });

  it("an empty system gives an empty queue", async () => {
    expect(await listQueue()).toEqual([]);
  });

  it("detail lookups for unapproved orders look exactly like missing orders", async () => {
    const o = await buildAllStates();
    expect(await getQueueItem(o.pending.id)).toBeNull();
    expect(await getQueueItem(o.rejected.id)).toBeNull();

    await as("sewing");
    const missing = await call(routes.sewingDetail.GET, { params: idParam(99999) });
    for (const hidden of [o.pending, o.counted, o.rejected]) {
      const res = await call(routes.sewingDetail.GET, { params: idParam(hidden.id) });
      expect(res.status).toBe(404);
      expect(res.text).toBe(missing.text);
    }
    for (const id of ["abc", "0", "-1", "1.5", "99999999999", "1 OR 1=1"]) {
      expect((await call(routes.sewingDetail.GET, { params: { id } })).status).toBe(404);
    }
  });

  it("starting sewing on an unapproved order is a 404 and changes nothing", async () => {
    const o = await buildAllStates();
    await as("sewing");
    for (const hidden of [o.pending, o.counted, o.rejected]) {
      const before = await statusOf(hidden.id);
      const res = await call(routes.sewingStart.POST, { method: "POST", params: idParam(hidden.id) });
      expect(res.status).toBe(404);
      expect(await statusOf(hidden.id)).toBe(before);
    }
  });
});

describe("sewing access control", () => {
  it("returns 401 when not logged in", async () => {
    const order = await createVerifiedOrder();
    await as(null);
    const results = await Promise.all([
      call(routes.sewingQueue.GET),
      call(routes.sewingDetail.GET, { params: idParam(order.id) }),
      call(routes.sewingStart.POST, { method: "POST", params: idParam(order.id) }),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(await statusOf(order.id)).toBe("VERIFIED");
  });

  it.each(["supervisor", "verifier"])("%s gets 403 on every sewing endpoint", async (who) => {
    const order = await createVerifiedOrder();
    await as(who);
    const results = await Promise.all([
      call(routes.sewingQueue.GET),
      call(routes.sewingDetail.GET, { params: idParam(order.id) }),
      call(routes.sewingStart.POST, { method: "POST", params: idParam(order.id) }),
    ]);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(await statusOf(order.id)).toBe("VERIFIED");
  });
});

describe("what the sewing floor sees", () => {
  it("shows piece counts, verifier name, timestamp and wastage, but no private data", async () => {
    const order = await createOrder({ targetQty: 10, actualFabricYds: 18.9 });
    await saveCounts(order, (item, i) => (i === 2 ? item.expectedQty + 1 : item.expectedQty));
    await as("verifier");
    await call(routes.approve.POST, { method: "POST", params: idParam(order.id) });

    await as("sewing");
    const res = await call(routes.sewingDetail.GET, { params: idParam(order.id) });
    expect(res.status).toBe(200);
    const detail = res.json.order;

    expect(detail.status).toBe("VERIFIED");
    expect(detail.verification.verifierName).toBe("Vera Verifier");
    expect(detail.verification.wastagePct).toBe(5);
    expect(detail.verification.wastageCap).toBe(5);
    expect(detail.verification.overCap).toBe(false);
    expect(Math.abs(new Date(detail.verification.verifiedAt).getTime() - Date.now())).toBeLessThan(60000);
    expect(detail.components).toHaveLength(5);
    expect(detail.components.find((c) => c.status === "YELLOW")).toMatchObject({ expectedQty: 20, actualQty: 21, variance: 1 });
    expect(detail.auditNotes).toEqual([]);
    expect(res.text).not.toMatch(/@demo\.com|password|verifierId|verifier_id|createdBy|created_by/i);
  });

  it("flags wastage above the recipe cap", async () => {
    const order = await createVerifiedOrder({ targetQty: 10, actualFabricYds: 20 }); // 11.11% > 5%
    await as("sewing");
    const { verification } = (await call(routes.sewingDetail.GET, { params: idParam(order.id) })).json.order;
    expect(verification.wastagePct).toBe(11.11);
    expect(verification.overCap).toBe(true);
  });

  it("carries earlier rejection notes along as audit notes", async () => {
    const order = await createOrder();
    await rejectAs("verifier", order, { note: "Collar short by 6 before re-cut" });
    await as("supervisor");
    await call(routes.resubmit.POST, { method: "POST", params: idParam(order.id) });
    await saveCounts(order, exact);
    await as("verifier");
    await call(routes.approve.POST, { method: "POST", params: idParam(order.id) });

    await as("sewing");
    const { auditNotes } = (await call(routes.sewingDetail.GET, { params: idParam(order.id) })).json.order;
    expect(auditNotes).toHaveLength(1);
    expect(auditNotes[0]).toMatchObject({ note: "Collar short by 6 before re-cut", verifierName: "Vera Verifier" });
  });

  it("lists ready-to-start batches before ones already in progress", async () => {
    const started = await createVerifiedOrder({ fabricRollId: "FAB-A" });
    const ready = await createVerifiedOrder({ fabricRollId: "FAB-B" });
    await startSewing(started);
    expect((await listQueue()).map((o) => o.id)).toEqual([ready.id, started.id]);
  });
});

describe("starting sewing assembly", () => {
  it("moves VERIFIED to SEWING_STARTED and does not touch the audit log", async () => {
    const order = await createVerifiedOrder();
    const logsBefore = await logCount();
    const res = await startSewing(order);
    expect(res.status).toBe(200);
    expect(res.json.order.status).toBe("SEWING_STARTED");
    expect(await statusOf(order.id)).toBe("SEWING_STARTED");
    expect(await logCount()).toBe(logsBefore);
  });

  it("a second start returns 409", async () => {
    const order = await createVerifiedOrder();
    await startSewing(order);
    expect((await startSewing(order)).status).toBe(409);
    expect(await statusOf(order.id)).toBe("SEWING_STARTED");
  });

  it("concurrent starts produce exactly one success", async () => {
    const order = await createVerifiedOrder();
    const results = await Promise.all(Array.from({ length: 5 }, () => startSewing(order)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });

  it("ignores any body: it cannot start a different order or set a status", async () => {
    const target = await createVerifiedOrder({ fabricRollId: "FAB-TARGET" });
    const other = await createVerifiedOrder({ fabricRollId: "FAB-OTHER" });
    await as("sewing");
    const res = await call(routes.sewingStart.POST, {
      method: "POST",
      params: idParam(target.id),
      body: { orderId: other.id, status: "PENDING_VERIFICATION" },
    });
    expect(res.status).toBe(200);
    expect(await statusOf(target.id)).toBe("SEWING_STARTED");
    expect(await statusOf(other.id)).toBe("VERIFIED");
  });

  it("a started batch can no longer be changed by the verifier", async () => {
    const order = await createVerifiedOrder();
    await startSewing(order);
    expect((await rejectAs("verifier", order, { note: "Too late to reject" })).status).toBe(409);
    expect((await saveCounts(order, () => 0)).status).toBe(409);
    expect(await statusOf(order.id)).toBe("SEWING_STARTED");
  });
});
