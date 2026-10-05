import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  cuttingOrders,
  recipeComponents,
  verificationItems,
  verificationLogs,
} from "@/db/schema";
import { MAX_COUNT, MAX_DB_INT, MAX_REJECTION_NOTE, MIN_REJECTION_NOTE } from "@/lib/limits";
import { wastagePct } from "./domain/orders";
import { nonNegativeInt, positiveInt } from "./domain/schemas";
import { approvalBlockers, evaluate } from "./domain/traffic";
import { HttpError } from "./http";
import { orderWith, toOrderDto } from "./orderService";
import { transitionStatus } from "./statusTransition";

const PENDING = "PENDING_VERIFICATION";

export const countsSchema = z
  .object({
    counts: z
      .array(
        z.object({
          componentId: positiveInt.max(MAX_DB_INT, { error: "Invalid component" }),
          actualQty: nonNegativeInt.max(MAX_COUNT, {
            error: `Must be ${MAX_COUNT.toLocaleString("en-US")} or fewer`,
          }),
        }),
        { error: "counts must be a list of { componentId, actualQty }" },
      )
      .min(1, { error: "Provide at least one count" })
      .max(100, { error: "Too many counts" }),
  })
  .refine((v) => new Set(v.counts.map((c) => c.componentId)).size === v.counts.length, {
    path: ["counts"],
    error: "Each component may appear only once",
  });

export const rejectSchema = z.object({
  note: z
    .string({ error: "A rejection reason is required" })
    .trim()
    .min(MIN_REJECTION_NOTE, {
      error: `Reason must be at least ${MIN_REJECTION_NOTE} characters`,
    })
    .max(MAX_REJECTION_NOTE, {
      error: `Reason must be ${MAX_REJECTION_NOTE} characters or fewer`,
    }),
});

/**
 * Locks the order row for the rest of the transaction so counts, approve and reject on the
 * same order are serialised: an approval can never validate counts that change underneath it.
 */
async function lockPendingOrder(tx, orderId) {
  const [order] = await tx
    .select()
    .from(cuttingOrders)
    .where(eq(cuttingOrders.id, orderId))
    .for("update");
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== PENDING) {
    throw new HttpError(409, `Order is ${order.status}; only ${PENDING} orders can be verified`);
  }
  return order;
}

async function loadItems(tx, orderId) {
  return tx
    .select({
      id: verificationItems.id,
      componentId: verificationItems.componentId,
      componentName: recipeComponents.componentName,
      expectedQty: verificationItems.expectedQty,
      actualQty: verificationItems.actualQty,
    })
    .from(verificationItems)
    .innerJoin(recipeComponents, eq(recipeComponents.id, verificationItems.componentId))
    .where(eq(verificationItems.orderId, orderId))
    .orderBy(asc(verificationItems.id));
}

async function requiredComponentIds(tx, recipeId) {
  const rows = await tx
    .select({ id: recipeComponents.id })
    .from(recipeComponents)
    .where(eq(recipeComponents.recipeId, recipeId));
  return rows.map((r) => r.id);
}

/** Immutable per-component snapshot stored in the audit log. Status is recomputed here. */
function varianceSnapshot(items) {
  return items.map((i) => {
    const counted = i.actualQty !== null && i.actualQty !== undefined;
    return {
      componentId: i.componentId,
      componentName: i.componentName,
      expectedQty: i.expectedQty,
      actualQty: counted ? i.actualQty : null,
      variance: counted ? i.actualQty - i.expectedQty : null,
      status: counted ? evaluate(i.expectedQty, i.actualQty) : null,
    };
  });
}

async function loadOrderDto(orderId) {
  const row = await db.query.cuttingOrders.findFirst({
    where: eq(cuttingOrders.id, orderId),
    with: orderWith,
  });
  return toOrderDto(row);
}

/** The verifier's queue: PENDING_VERIFICATION only (filtered in SQL), oldest first. */
export async function listPendingOrders() {
  const rows = await db.query.cuttingOrders.findMany({
    where: eq(cuttingOrders.status, PENDING),
    with: orderWith,
    orderBy: [asc(cuttingOrders.createdAt), asc(cuttingOrders.id)],
  });
  return rows.map(toOrderDto);
}

/** Saves counts; the traffic-light status is always computed here, never taken from the client. */
export async function saveCounts(orderId, counts) {
  await db.transaction(async (tx) => {
    await lockPendingOrder(tx, orderId);
    const items = await loadItems(tx, orderId);
    const byComponent = new Map(items.map((i) => [i.componentId, i]));

    const unknown = counts.filter((c) => !byComponent.has(c.componentId));
    if (unknown.length) {
      throw new HttpError(422, "Invalid request", {
        counts: unknown.map((c) => `Component ${c.componentId} is not part of this order`),
      });
    }

    for (const { componentId, actualQty } of counts) {
      const item = byComponent.get(componentId);
      await tx
        .update(verificationItems)
        .set({ actualQty, status: evaluate(item.expectedQty, actualQty) })
        .where(eq(verificationItems.id, item.id));
    }
  });
  return loadOrderDto(orderId);
}

/**
 * The gatekeeper. verifierId MUST be the authenticated session user. Everything - hard-stop
 * check, audit log and status change - happens in one transaction on a locked order row.
 */
export async function approveOrder(verifierId, orderId) {
  await db.transaction(async (tx) => {
    const order = await lockPendingOrder(tx, orderId);
    const items = await loadItems(tx, orderId);
    const required = await requiredComponentIds(tx, order.recipeId);

    const blockers = approvalBlockers(items, required);
    if (blockers.length) {
      const nameOf = new Map(items.map((i) => [i.componentId, i]));
      throw new HttpError(422, "Approval blocked: every component must be counted with no shortage", {
        blockers: blockers.map((b) => {
          const item = nameOf.get(b.componentId);
          return {
            componentId: b.componentId,
            componentName: item?.componentName ?? null,
            reason: b.reason,
            expectedQty: item?.expectedQty ?? null,
            actualQty: item?.actualQty ?? null,
          };
        }),
      });
    }

    await tx.insert(verificationLogs).values({
      orderId,
      verifierId,
      decision: "APPROVED",
      wastagePct: String(wastagePct(order.actualFabricYds, order.expectedFabricYds)),
      varianceJson: varianceSnapshot(items),
    });

    await transitionStatus(tx, { orderId, from: PENDING, to: "VERIFIED" });
  });
  return loadOrderDto(orderId);
}

/** Rejects with a mandatory note and returns the batch to the supervisor for re-cutting. */
export async function rejectOrder(verifierId, orderId, note) {
  await db.transaction(async (tx) => {
    const order = await lockPendingOrder(tx, orderId);
    const items = await loadItems(tx, orderId);

    await tx.insert(verificationLogs).values({
      orderId,
      verifierId,
      decision: "REJECTED",
      rejectionNote: note,
      wastagePct: String(wastagePct(order.actualFabricYds, order.expectedFabricYds)),
      varianceJson: varianceSnapshot(items),
    });

    await transitionStatus(tx, {
      orderId,
      from: PENDING,
      to: "REJECTED",
      set: { rejectionCount: sql`${cuttingOrders.rejectionCount} + 1` },
    });
  });
  return loadOrderDto(orderId);
}
