import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { HttpError, parseId, route } from "@/server/http";
import { getQueueItem } from "@/server/sewingService";

export const dynamic = "force-dynamic";

export const GET = route(async (_request, { params }) => {
  await requireRole(ROLES.SEWING_SUPERVISOR);
  const orderId = parseId((await params).id);
  const order = await getQueueItem(orderId);
  if (!order) throw new HttpError(404, "Order not found");
  return Response.json({ order });
});
