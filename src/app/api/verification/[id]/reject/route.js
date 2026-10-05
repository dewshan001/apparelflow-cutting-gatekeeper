import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { parseId, route } from "@/server/http";
import { parseBody } from "@/server/orderService";
import { rejectOrder, rejectSchema } from "@/server/verificationService";

export const dynamic = "force-dynamic";

export const POST = route(async (request, { params }) => {
  const session = await requireRole(ROLES.CUTTING_VERIFIER);
  const orderId = parseId((await params).id);
  const { note } = await parseBody(request, rejectSchema);
  return Response.json({ order: await rejectOrder(session.userId, orderId, note) });
});
