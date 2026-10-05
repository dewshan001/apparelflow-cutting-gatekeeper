import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { route } from "@/server/http";
import { listQueue } from "@/server/sewingService";

export const dynamic = "force-dynamic";

// The query string is deliberately never read: the status filter is fixed in the SQL.
export const GET = route(async () => {
  await requireRole(ROLES.SEWING_SUPERVISOR);
  return Response.json({ orders: await listQueue() });
});
