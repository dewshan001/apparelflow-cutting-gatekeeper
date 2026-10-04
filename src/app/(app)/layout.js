import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user] = await db
    .select({ id: users.id, fullName: users.fullName, role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}
