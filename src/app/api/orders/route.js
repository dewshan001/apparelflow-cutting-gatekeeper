import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { route } from "@/server/http";
import { createOrder, createOrderSchema, listOrdersFor, parseBody } from "@/server/orderService";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const session = await requireRole(ROLES.CUTTING_SUPERVISOR);
  return Response.json({ orders: await listOrdersFor(session.userId) });
});

export const POST = route(async (request) => {
  // Creator and status come from the session / server, never from the request body.
  const session = await requireRole(ROLES.CUTTING_SUPERVISOR);
  const input = await parseBody(request, createOrderSchema);
  const order = await createOrder(session.userId, input);
  return Response.json({ order }, { status: 201 });
});
