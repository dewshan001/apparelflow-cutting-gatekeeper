import { redirect } from "next/navigation";
import { homeFor } from "@/lib/roleConfig";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  redirect(session ? homeFor(session.role) : "/login");
}
