import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/server/auth";
import { ROLES } from "@/lib/roles";
import { HttpError, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const session = await requireRole(...Object.values(ROLES));
  const [user] = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) throw new HttpError(401, "Authentication required");
  return Response.json({ user });
});
