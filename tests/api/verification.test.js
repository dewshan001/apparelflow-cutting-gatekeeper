import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cuttingOrders, verificationItems, verificationLogs } from "@/db/schema";
import { as, call, userRow } from "../helpers/api.js";
import {
  approveAs,
  createOrder,
  createVerifiedOrder,
  exact,
  idParam,
  rejectAs,
  routes,
  saveCounts,
} from "../helpers/flows.js";
import { getTestDb, resetData } from "../helpers/testDb.js";

let db;
let verifier;
let supervisor;

const statusOf = async (id) =>
  (await db.select({ s: cuttingOrders.status }).from(cuttingOrders).where(eq(cuttingOrders.id, id)))[0].s;
const logsOf = (id) => db.select().from(verificationLogs).where(eq(verificationLogs.orderId, id));
const itemsOf = (id) => db.select().from(verificationItems).where(eq(verificationItems.orderId, id));
const messageOf = (e) => [e?.message, e?.cause?.message].filter(Boolean).join(" | ");

beforeAll(async () => {
  db = await getTestDb();
  verifier = await userRow("verifier");
  supervisor = await userRow("supervisor");
});

beforeEach(async () => {
  await resetData();
  await as(null);
});

describe("Test 1: an order with all GREEN components can be approved by an authenticated Verifier", () => {
  it("approves, moves the order to VERIFIED and writes one audit log row", async () => {
    const order = await createOrder({ targetQty: 10, actualFabricYds: 18.9 });
    expect((await saveCounts(order, exact)).status).toBe(200);

    const res = await approveAs("verifier", order);

    expect(res.status).toBe(200);
    expect(res.json.order.status).toBe("VERIFIED");
    expect(await statusOf(order.id)).toBe("VERIFIED");

    const logs = await logsOf(order.id);
    expect(logs).toHaveLength(1);
    const [log] = logs;
    expect(log.decision).toBe("APPROVED");
    expect(log.verifierId).toBe(verifier.id);
    expect(Number(log.wastagePct)).toBe(5); // (18.9 - 18) / 18 * 100
    expect(log.rejectionNote).toBeNull();
    expect(log.varianceJson).toHaveLength(5);
    expect(log.varianceJson.every((v) => v.status === "GREEN" && v.variance === 0)).toBe(true);
    expect(Math.abs(new Date(log.createdAt).getTime() - Date.now())).toBeLessThan(60000);
  });
});

describe("Test 2: an order with at least one RED (shortage) component blocks approval", () => {
  it("returns 422 naming the short component, leaves the order PENDING and writes no log", async () => {
    const order = await createOrder({ targetQty: 10 });
    await saveCounts(order, (item, i) => (i === 2 ? item.expectedQty - 1 : item.expectedQty));

    const res = await approveAs("verifier", order);

    expect(res.status).toBe(422);
    expect(res.json.details.blockers).toEqual([
      {
        componentId: order.items[2].componentId,
        componentName: "Sleeves (Left & Right)",
        reason: "SHORTAGE",
        expectedQty: 20,
        actualQty: 19,
      },
    ]);
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
    expect(await logsOf(order.id)).toHaveLength(0);
  });

  it("treats a count of 0 as a shortage", async () => {
    const order = await createOrder();
    await saveCounts(order, (item, i) => (i === 0 ? 0 : item.expectedQty));
    const res = await approveAs("verifier", order);
    expect(res.status).toBe(422);
    expect(res.json.details.blockers[0]).toMatchObject({ reason: "SHORTAGE", actualQty: 0 });
  });

  it("blocks an order where nothing has been counted", async () => {
    const order = await createOrder();
    const res = await approveAs("verifier", order);
    expect(res.status).toBe(422);
    expect(res.json.details.blockers).toHaveLength(5);
    expect(res.json.details.blockers.every((b) => b.reason === "UNCOUNTED")).toBe(true);
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
  });

  it("blocks a partially counted order even when the counted parts are fine", async () => {
    const order = await createOrder();
    await as("verifier");
    await call(routes.counts.PUT, {
      method: "PUT",
      params: idParam(order.id),
      body: { counts: order.items.slice(0, 3).map((i) => ({ componentId: i.componentId, actualQty: i.expectedQty })) },
    });
    const res = await approveAs("verifier", order);
    expect(res.status).toBe(422);
    expect(res.json.details.blockers.map((b) => b.reason)).toEqual(["UNCOUNTED", "UNCOUNTED"]);
  });

  it("blocks an order with a missing component row", async () => {
    const order = await createOrder();
    await as("verifier");
    await call(routes.counts.PUT, {
      method: "PUT",
      params: idParam(order.id),
      body: { counts: order.items.slice(0, 4).map((i) => ({ componentId: i.componentId, actualQty: i.expectedQty })) },
    });
    // Simulate a corrupted order: one component's verification row is gone.
    await db.delete(verificationItems).where(eq(verificationItems.id, order.items[4].id));

    const res = await approveAs("verifier", order);
    expect(res.status).toBe(422);
    expect(res.json.details.blockers).toEqual([
      { componentId: order.items[4].componentId, componentName: null, reason: "MISSING", expectedQty: null, actualQty: null },
    ]);
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
  });

  it("cannot be overridden by anything the client sends in the body", async () => {
    const order = await createOrder();
    await saveCounts(order, (item, i) => (i === 0 ? 1 : item.expectedQty));
    const res = await approveAs("verifier", order, { status: "GREEN", force: true, override: true, ignoreShortage: true });
    expect(res.status).toBe(422);
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
    expect(await logsOf(order.id)).toHaveLength(0);
  });

  it("recomputes component status on the server and ignores a client-sent status", async () => {
    const order = await createOrder();
    await as("verifier");
    const res = await call(routes.counts.PUT, {
      method: "PUT",
      params: idParam(order.id),
      body: { counts: [{ componentId: order.items[0].componentId, actualQty: 3, status: "GREEN", verifierId: 1 }] },
    });
    expect(res.status).toBe(200);
    const [item] = (await itemsOf(order.id)).filter((i) => i.componentId === order.items[0].componentId);
    expect(item.actualQty).toBe(3);
    expect(item.status).toBe("RED");
  });
});

describe("Test 3: rejecting without a reason note is rejected by backend validation", () => {
  it.each([
    ["no body", undefined],
    ["empty object", {}],
    ["empty string", { note: "" }],
    ["only whitespace", { note: "      " }],
    ["too short", { note: "abc" }],
    ["too short once trimmed", { note: "  ab  " }],
    ["number instead of text", { note: 12345 }],
    ["null", { note: null }],
    ["over the maximum length", { note: "x".repeat(501) }],
  ])("returns 422 and changes nothing: %s", async (_label, body) => {
    const order = await createOrder();
    const res = await rejectAs("verifier", order, body);
    expect(res.status).toBe(422);
    expect(res.json.details.note ?? res.json.details._).toBeTruthy();
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
    expect(await logsOf(order.id)).toHaveLength(0);
  });

  it("accepts a valid note: trims it, records the session verifier and counts the rejection", async () => {
    const order = await createOrder();
    const res = await rejectAs("verifier", order, { note: "  Collar pieces short by 6  " });

    expect(res.status).toBe(200);
    expect(res.json.order.status).toBe("REJECTED");
    expect(res.json.order.rejectionNote).toBe("Collar pieces short by 6");
    expect(res.json.order.rejectionCount).toBe(1);

    const [log] = await logsOf(order.id);
    expect(log).toMatchObject({ decision: "REJECTED", rejectionNote: "Collar pieces short by 6", verifierId: verifier.id });
  });

  it("can reject without any counts having been entered", async () => {
    const order = await createOrder();
    expect((await rejectAs("verifier", order, { note: "Visible fabric defect" })).status).toBe(200);
  });

  it("increments the rejection count on every rejection", async () => {
    const order = await createOrder();
    await rejectAs("verifier", order, { note: "First defect found" });
    await as("supervisor");
    await call(routes.resubmit.POST, { method: "POST", params: idParam(order.id) });
    await rejectAs("verifier", order, { note: "Second defect found" });
    const [row] = await db.select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
    expect(row.rejectionCount).toBe(2);
    expect(await logsOf(order.id)).toHaveLength(2);
  });
});

describe("Test 4: non-verifier roles receive 403 Forbidden when attempting verification approval", () => {
  it.each(["supervisor", "sewing"])("%s gets 403 on approve, even for a perfectly counted order", async (who) => {
    const order = await createOrder();
    await saveCounts(order, exact);

    const res = await approveAs(who, order);

    expect(res.status).toBe(403);
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
    expect(await logsOf(order.id)).toHaveLength(0);
  });

  it.each(["supervisor", "sewing"])("%s is also blocked from counts, reject and the verifier queue", async (who) => {
    const order = await createOrder();
    await as(who);
    const counts = await call(routes.counts.PUT, {
      method: "PUT",
      params: idParam(order.id),
      body: { counts: [{ componentId: order.items[0].componentId, actualQty: 5 }] },
    });
    const reject = await rejectAs(who, order, { note: "I am not a verifier" });
    await as(who);
    const queue = await call(routes.verificationQueue.GET);

    expect([counts.status, reject.status, queue.status]).toEqual([403, 403, 403]);
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
    expect((await itemsOf(order.id)).every((i) => i.actualQty === null)).toBe(true);
  });

  it("a valid verifier session is not enough when the role claim is not verifier", async () => {
    // Same user id as the real verifier, but a token claiming a different role.
    const { tokenFor } = await import("../helpers/api.js");
    const { cookieState } = await import("../helpers/cookieState.js");
    const order = await createOrder();
    await saveCounts(order, exact);
    cookieState.token = await tokenFor(verifier.id, "cutting_supervisor");
    const res = await call(routes.approve.POST, { method: "POST", params: idParam(order.id) });
    expect(res.status).toBe(403);
  });
});

describe("authentication", () => {
  it("returns 401 on every verifier endpoint when not logged in", async () => {
    const order = await createOrder();
    await as(null);
    const results = await Promise.all([
      call(routes.verificationQueue.GET),
      call(routes.counts.PUT, { method: "PUT", params: idParam(order.id), body: { counts: [] } }),
      call(routes.approve.POST, { method: "POST", params: idParam(order.id) }),
      call(routes.reject.POST, { method: "POST", params: idParam(order.id), body: { note: "no session" } }),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(await statusOf(order.id)).toBe("PENDING_VERIFICATION");
  });
});

describe("approval edge cases", () => {
  it("still approves a YELLOW (excess) component", async () => {
    const order = await createOrder();
    await saveCounts(order, (item, i) => (i === 3 ? item.expectedQty + 4 : item.expectedQty));
    const res = await approveAs("verifier", order);
    expect(res.status).toBe(200);
    const [log] = await logsOf(order.id);
    expect(log.varianceJson.find((v) => v.status === "YELLOW")).toMatchObject({ variance: 4 });
  });

  it("a second approval returns 409 and does not write a second log", async () => {
    const order = await createVerifiedOrder();
    const again = await approveAs("verifier", order);
    expect(again.status).toBe(409);
    expect(await logsOf(order.id)).toHaveLength(1);
  });

  it("concurrent approvals produce exactly one success and one audit row", async () => {
    const order = await createOrder();
    await saveCounts(order, exact);
    const results = await Promise.all(Array.from({ length: 5 }, () => approveAs("verifier", order)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await logsOf(order.id)).toHaveLength(1);
  });

  it("ignores client-supplied verifier id, decision, status, timestamps and wastage on approve", async () => {
    const order = await createOrder({ actualFabricYds: 18.9 });
    await saveCounts(order, exact);
    const res = await approveAs("verifier", order, {
      verifierId: supervisor.id,
      verifier_id: supervisor.id,
      decision: "REJECTED",
      status: "PENDING_VERIFICATION",
      timestamp: "2000-01-01T00:00:00Z",
      createdAt: "2000-01-01T00:00:00Z",
      wastagePct: -99,
      id: 9999,
    });
    expect(res.status).toBe(200);
    const [log] = await logsOf(order.id);
    expect(log.verifierId).toBe(verifier.id);
    expect(log.verifierId).not.toBe(supervisor.id);
    expect(log.decision).toBe("APPROVED");
    expect(Number(log.wastagePct)).toBe(5);
    expect(new Date(log.createdAt).getUTCFullYear()).toBeGreaterThanOrEqual(2025);
  });

  it("ignores client-supplied verifier id and rejection count on reject", async () => {
    const order = await createOrder();
    const res = await rejectAs("verifier", order, {
      note: "Real reason given",
      verifierId: supervisor.id,
      status: "VERIFIED",
      rejectionCount: 99,
    });
    expect(res.status).toBe(200);
    const [log] = await logsOf(order.id);
    const [row] = await db.select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
    expect(log.verifierId).toBe(verifier.id);
    expect(row.status).toBe("REJECTED");
    expect(row.rejectionCount).toBe(1);
  });

  it("stores the verifier's own session id even when two different verifiers act", async () => {
    const { users } = await import("@/db/schema");
    const [second] = await db
      .insert(users)
      .values({ email: "verifier2@demo.com", passwordHash: "x", role: "cutting_verifier", fullName: "Second Verifier" })
      .returning();
    const { tokenFor } = await import("../helpers/api.js");
    const { cookieState } = await import("../helpers/cookieState.js");
    const order = await createOrder();
    await saveCounts(order, exact);
    cookieState.token = await tokenFor(second.id, "cutting_verifier");
    const res = await call(routes.approve.POST, { method: "POST", params: idParam(order.id), body: { verifierId: verifier.id } });
    expect(res.status).toBe(200);
    expect((await logsOf(order.id))[0].verifierId).toBe(second.id);
  });

  it("returns 404 for unknown or malformed order ids", async () => {
    await as("verifier");
    for (const id of ["99999", "abc", "0", "-1", "1.5", "99999999999", "1 OR 1=1"]) {
      expect((await call(routes.approve.POST, { method: "POST", params: { id } })).status).toBe(404);
      expect((await call(routes.reject.POST, { method: "POST", params: { id }, body: { note: "does not exist" } })).status).toBe(404);
    }
  });
});

describe("counts validation", () => {
  const bad = [
    ["negative", -1],
    ["decimal", 2.5],
    ["numeric string", "5"],
    ["empty string", ""],
    ["null", null],
    ["boolean", true],
    ["array", [5]],
    ["above the maximum", 10000001],
    ["far above the maximum", 99999999999],
  ];

  it.each(bad)("rejects a %s quantity with 422 and writes nothing", async (_label, value) => {
    const order = await createOrder();
    await as("verifier");
    const res = await call(routes.counts.PUT, {
      method: "PUT",
      params: idParam(order.id),
      body: { counts: [{ componentId: order.items[0].componentId, actualQty: value }] },
    });
    expect(res.status).toBe(422);
    expect(Object.keys(res.json.details)).toContain("counts.0.actualQty");
    expect((await itemsOf(order.id)).every((i) => i.actualQty === null)).toBe(true);
  });

  it.each([
    ["missing counts", {}],
    ["empty list", { counts: [] }],
    ["counts not a list", { counts: "5" }],
    ["duplicate component", (o) => ({ counts: [{ componentId: o.items[0].componentId, actualQty: 1 }, { componentId: o.items[0].componentId, actualQty: 2 }] })],
    ["component from another recipe", { counts: [{ componentId: 6, actualQty: 1 }] }],
    ["unknown component", { counts: [{ componentId: 9999, actualQty: 1 }] }],
  ])("rejects bad payload with 422: %s", async (_label, body) => {
    const order = await createOrder();
    await as("verifier");
    const payload = typeof body === "function" ? body(order) : body;
    const res = await call(routes.counts.PUT, { method: "PUT", params: idParam(order.id), body: payload });
    expect(res.status).toBe(422);
    expect((await itemsOf(order.id)).every((i) => i.actualQty === null)).toBe(true);
  });

  it("is atomic: one bad entry means none of the counts are saved", async () => {
    const order = await createOrder();
    await as("verifier");
    const res = await call(routes.counts.PUT, {
      method: "PUT",
      params: idParam(order.id),
      body: {
        counts: [
          { componentId: order.items[0].componentId, actualQty: 10 },
          { componentId: 9999, actualQty: 10 },
        ],
      },
    });
    expect(res.status).toBe(422);
    expect((await itemsOf(order.id)).every((i) => i.actualQty === null)).toBe(true);
  });

  it("rejects invalid JSON with 422", async () => {
    const order = await createOrder();
    await as("verifier");
    const res = await call(routes.counts.PUT, { method: "PUT", params: idParam(order.id), rawBody: "{not json" });
    expect(res.status).toBe(422);
  });
});

describe("state machine", () => {
  it("blocks counts and reject once an order is VERIFIED", async () => {
    const order = await createVerifiedOrder();
    expect((await saveCounts(order, () => 0)).status).toBe(409);
    expect((await rejectAs("verifier", order, { note: "Too late to reject" })).status).toBe(409);
    expect(await statusOf(order.id)).toBe("VERIFIED");
    expect(await logsOf(order.id)).toHaveLength(1);
  });

  it("blocks approve and counts on a REJECTED order", async () => {
    const order = await createOrder();
    await rejectAs("verifier", order, { note: "Defective fabric" });
    expect((await approveAs("verifier", order)).status).toBe(409);
    expect((await saveCounts(order, exact)).status).toBe(409);
    expect(await statusOf(order.id)).toBe("REJECTED");
  });

  it("a resubmitted order must be recounted: stale counts can never carry an approval", async () => {
    const order = await createOrder();
    await saveCounts(order, exact);
    await rejectAs("verifier", order, { note: "Re-cut required" });
    await as("supervisor");
    expect((await call(routes.resubmit.POST, { method: "POST", params: idParam(order.id) })).status).toBe(200);

    const res = await approveAs("verifier", order);
    expect(res.status).toBe(422);
    expect(res.json.details.blockers.every((b) => b.reason === "UNCOUNTED")).toBe(true);
  });

  it("the verifier queue lists only PENDING_VERIFICATION orders", async () => {
    const pending = await createOrder({ fabricRollId: "FAB-PENDING" });
    const rejected = await createOrder({ fabricRollId: "FAB-REJECTED" });
    await rejectAs("verifier", rejected, { note: "Defective fabric" });
    const verified = await createVerifiedOrder({ fabricRollId: "FAB-VERIFIED" });

    await as("verifier");
    const res = await call(routes.verificationQueue.GET);
    const ids = res.json.orders.map((o) => o.id);
    expect(ids).toEqual([pending.id]);
    expect(ids).not.toContain(rejected.id);
    expect(ids).not.toContain(verified.id);
  });
});

describe("audit trail is immutable at the database level", () => {
  it("rejects UPDATE and DELETE on verification_logs (append-only trigger)", async () => {
    const order = await createVerifiedOrder();
    await expect(
      db.update(verificationLogs).set({ decision: "REJECTED", rejectionNote: "tamper" }).where(eq(verificationLogs.orderId, order.id)),
    ).rejects.toSatisfy((e) => /append-only/.test(messageOf(e)));
    await expect(db.delete(verificationLogs).where(eq(verificationLogs.orderId, order.id))).rejects.toSatisfy((e) =>
      /append-only/.test(messageOf(e)),
    );
    const [log] = await logsOf(order.id);
    expect(log.decision).toBe("APPROVED");
  });

  it("refuses a REJECTED log without a note even if the application were bypassed", async () => {
    const order = await createOrder();
    await expect(
      db.insert(verificationLogs).values({ orderId: order.id, verifierId: verifier.id, decision: "REJECTED", rejectionNote: "   " }),
    ).rejects.toSatisfy((e) => /reject_needs_note/.test(messageOf(e)));
  });
});
