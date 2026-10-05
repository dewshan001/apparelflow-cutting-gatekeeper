import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { parseId, route } from "@/server/http";
import { approveOrder } from "@/server/verificationService";

export const dynamic = "force-dynamic";

export const POST = route(async (_request, { params }) => {
  // The request body is never read: verifier identity comes only from the session.
  const session = await requireRole(ROLES.CUTTING_VERIFIER);
  const orderId = parseId((await params).id);
  return Response.json({ order: await approveOrder(session.userId, orderId) });
});
