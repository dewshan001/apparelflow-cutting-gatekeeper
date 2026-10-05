import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { parseId, route } from "@/server/http";
import { parseBody } from "@/server/orderService";
import { countsSchema, saveCounts } from "@/server/verificationService";

export const dynamic = "force-dynamic";

export const PUT = route(async (request, { params }) => {
  await requireRole(ROLES.CUTTING_VERIFIER);
  const orderId = parseId((await params).id);
  const { counts } = await parseBody(request, countsSchema);
  return Response.json({ order: await saveCounts(orderId, counts) });
});
