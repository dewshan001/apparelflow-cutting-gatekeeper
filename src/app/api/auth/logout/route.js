import { logout } from "@/server/auth";
import { route } from "@/server/http";

export const POST = route(async () => {
  await logout();
  return Response.json({ ok: true });
});
