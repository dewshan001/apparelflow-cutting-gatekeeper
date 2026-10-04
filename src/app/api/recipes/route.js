import { ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";
import { route } from "@/server/http";
import { listRecipes } from "@/server/orderService";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireRole(ROLES.CUTTING_SUPERVISOR);
  return Response.json({ recipes: await listRecipes() });
});
