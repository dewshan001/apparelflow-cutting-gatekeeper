import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cuttingOrders, users, verificationLogs } from "@/db/schema";
import { QUEUE_STATUSES } from "./domain/sewingQueue";
import { HttpError } from "./http";
import { transitionStatus } from "./statusTransition";

// The one and only status filter in this file. No function below accepts a status argument,
// so nothing from a request can widen it.
const inQueue = inArray(cuttingOrders.status, [...QUEUE_STATUSES]);

const orderWith = { recipe: true, items: { with: { component: true } } };

/** Audit logs (with the verifier's display name only - never email or id) for these orders. */
async function loadLogs(orderIds) {
  if (orderIds.length === 0) return [];
  return db
    .select({
      id: verificationLogs.id,
      orderId: verificationLogs.orderId,
      decision: verificationLogs.decision,
      rejectionNote: verificationLogs.rejectionNote,
      wastagePct: verificationLogs.wastagePct,
      varianceJson: verificationLogs.varianceJson,
      createdAt: verificationLogs.createdAt,
      verifierName: users.fullName,
    })
    .from(verificationLogs)
    .innerJoin(users, eq(users.id, verificationLogs.verifierId))
    .where(inArray(verificationLogs.orderId, orderIds))
    .orderBy(asc(verificationLogs.id));
}

function toQueueDto(order, logs) {
  const mine = logs.filter((l) => l.orderId === order.id);
  const approval = [...mine].reverse().find((l) => l.decision === "APPROVED") ?? null;
  const wastageCap = Number(order.recipe.wastageCap);
  const wastagePct = approval?.wastagePct === null || approval?.wastagePct === undefined ? null : Number(approval.wastagePct);

  // Prefer the immutable snapshot written at approval; fall back to the stored items.
  const components = Array.isArray(approval?.varianceJson)
    ? approval.varianceJson
    : [...order.items]
        .sort((a, b) => a.id - b.id)
        .map((i) => ({
          componentId: i.componentId,
          componentName: i.component.componentName,
          expectedQty: i.expectedQty,
          actualQty: i.actualQty,
          variance: i.actualQty === null ? null : i.actualQty - i.expectedQty,
          status: i.status,
        }));

  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    targetQty: order.targetQty,
    fabricRollId: order.fabricRollId,
    actualFabricYds: Number(order.actualFabricYds),
    expectedFabricYds: Number(order.expectedFabricYds),
    updatedAt: order.updatedAt,
    recipe: { id: order.recipe.id, recipeCode: order.recipe.recipeCode, name: order.recipe.name },
    components,
    verification: approval
      ? {
          verifierName: approval.verifierName,
          verifiedAt: approval.createdAt,
          wastagePct,
          wastageCap,
          overCap: wastagePct !== null && wastagePct > wastageCap,
        }
      : null,
    // Earlier rejections of this same batch (what was wrong before the re-cut).
    auditNotes: mine
      .filter((l) => l.decision === "REJECTED")
      .map((l) => ({ note: l.rejectionNote, verifierName: l.verifierName, at: l.createdAt })),
  };
}

/** Verified batches only (filtered in SQL). Ready-to-start first, then in progress; oldest first. */
export async function listQueue() {
  const rows = await db.query.cuttingOrders.findMany({
    where: inQueue,
    with: orderWith,
    orderBy: [asc(cuttingOrders.status), asc(cuttingOrders.updatedAt), asc(cuttingOrders.id)],
  });
  const logs = await loadLogs(rows.map((r) => r.id));
  return rows.map((r) => toQueueDto(r, logs));
}

/** One queued batch, or null. An order outside the queue is indistinguishable from a missing one. */
export async function getQueueItem(orderId) {
  const row = await db.query.cuttingOrders.findFirst({
    where: and(eq(cuttingOrders.id, orderId), inQueue),
    with: orderWith,
  });
  if (!row) return null;
  return toQueueDto(row, await loadLogs([row.id]));
}

/** VERIFIED -> SEWING_STARTED on a locked row. Not in the queue = 404; already started = 409. */
export async function startSewing(orderId) {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: cuttingOrders.id, status: cuttingOrders.status })
      .from(cuttingOrders)
      .where(and(eq(cuttingOrders.id, orderId), inQueue))
      .for("update");
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status === "SEWING_STARTED") {
      throw new HttpError(409, "Sewing has already started for this batch");
    }
    await transitionStatus(tx, { orderId, from: "VERIFIED", to: "SEWING_STARTED" });
  });
  return getQueueItem(orderId);
}
