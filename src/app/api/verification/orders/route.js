import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { route } from "@/server/http";
import { listPendingOrders } from "@/server/verificationService";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireRole(ROLES.CUTTING_VERIFIER);
  return Response.json({ orders: await listPendingOrders() });
});
