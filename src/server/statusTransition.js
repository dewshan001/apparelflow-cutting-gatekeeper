import { and, eq } from "drizzle-orm";
import { cuttingOrders } from "@/db/schema";
import { canTransition } from "./domain/transitions";
import { HttpError } from "./http";

/**
 * Guarded status change: the current status is part of the WHERE clause, so check and write
 * are a single atomic statement. If another request already moved the order (or it is in the
 * wrong state), zero rows match and we throw 409 - two concurrent approvals can never both win.
 * `tx` is a drizzle db or transaction. `set` adds extra columns to update in the same statement.
 */
export async function transitionStatus(tx, { orderId, from, to, set = {} }) {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order transition ${from} -> ${to}`);
  }

  const rows = await tx
    .update(cuttingOrders)
    .set({ ...set, status: to, updatedAt: new Date() })
    .where(and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.status, from)))
    .returning({ id: cuttingOrders.id });

  if (rows.length === 0) {
    throw new HttpError(409, `Order is no longer ${from} (it may already have been processed)`);
  }
  return rows[0];
}
