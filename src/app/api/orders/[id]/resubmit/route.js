import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { HttpError, route } from "@/server/http";
import { resubmitOrder } from "@/server/orderService";

export const dynamic = "force-dynamic";

export const POST = route(async (_request, { params }) => {
  const session = await requireRole(ROLES.CUTTING_SUPERVISOR);
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) throw new HttpError(404, "Order not found");
  const order = await resubmitOrder(session.userId, Number(id));
  return Response.json({ order });
});
