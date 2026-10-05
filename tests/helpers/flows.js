import * as ordersRoute from "@/app/api/orders/route.js";
import * as resubmitRoute from "@/app/api/orders/[id]/resubmit/route.js";
import * as approveRoute from "@/app/api/verification/[id]/approve/route.js";
import * as countsRoute from "@/app/api/verification/[id]/counts/route.js";
import * as rejectRoute from "@/app/api/verification/[id]/reject/route.js";
import * as verificationQueueRoute from "@/app/api/verification/orders/route.js";
import * as sewingQueueRoute from "@/app/api/sewing/queue/route.js";
import * as sewingDetailRoute from "@/app/api/sewing/queue/[id]/route.js";
import * as sewingStartRoute from "@/app/api/sewing/[id]/start/route.js";
import { as, call } from "./api.js";

export const routes = {
  orders: ordersRoute,
  resubmit: resubmitRoute,
  approve: approveRoute,
  counts: countsRoute,
  reject: rejectRoute,
  verificationQueue: verificationQueueRoute,
  sewingQueue: sewingQueueRoute,
  sewingDetail: sewingDetailRoute,
  sewingStart: sewingStartRoute,
};

const idParam = (id) => ({ id: String(id) });

/** Supervisor creates a Casual Blouse order (recipe 1) and gets the order DTO back. */
export async function createOrder(overrides = {}) {
  await as("supervisor");
  const res = await call(routes.orders.POST, {
    method: "POST",
    body: { recipeId: 1, targetQty: 10, fabricRollId: "FAB-ROLL-1", actualFabricYds: 18, ...overrides },
  });
  if (res.status !== 201) throw new Error(`createOrder failed: ${res.status} ${res.text}`);
  return res.json.order;
}

/** Verifier saves counts. valueFor(item, index) -> number for each component. */
export async function saveCounts(order, valueFor) {
  await as("verifier");
  return call(routes.counts.PUT, {
    method: "PUT",
    params: idParam(order.id),
    body: { counts: order.items.map((item, i) => ({ componentId: item.componentId, actualQty: valueFor(item, i) })) },
  });
}

export const exact = (item) => item.expectedQty;

export async function approveAs(who, order, body) {
  await as(who);
  return call(routes.approve.POST, { method: "POST", params: idParam(order.id), body });
}

export async function rejectAs(who, order, body) {
  await as(who);
  return call(routes.reject.POST, { method: "POST", params: idParam(order.id), body });
}

/** Creates an order, counts every component exactly and approves it as the verifier. */
export async function createVerifiedOrder(overrides = {}) {
  const order = await createOrder(overrides);
  await saveCounts(order, exact);
  const res = await approveAs("verifier", order);
  if (res.status !== 200) throw new Error(`approve failed: ${res.status} ${res.text}`);
  return order;
}

export async function startSewing(order) {
  await as("sewing");
  return call(routes.sewingStart.POST, { method: "POST", params: idParam(order.id) });
}

export { idParam };
