import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { parseId, route } from "@/server/http";
import { startSewing } from "@/server/sewingService";

export const dynamic = "force-dynamic";

export const POST = route(async (_request, { params }) => {
  // No body is read; the order id comes only from the URL and the role from the session.
  await requireRole(ROLES.SEWING_SUPERVISOR);
  const orderId = parseId((await params).id);
  return Response.json({ order: await startSewing(orderId) });
});
