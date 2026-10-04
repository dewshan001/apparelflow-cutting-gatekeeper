import { redirect } from "next/navigation";
import { homeFor } from "@/lib/roleConfig";
import { getSession } from "./auth";

/** Page-level convenience redirect. APIs remain the real security boundary. */
export async function guardPage(role) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(homeFor(session.role));
  return session;
}
