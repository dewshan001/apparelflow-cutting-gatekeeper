import { z } from "zod";
import { login } from "@/server/auth";
import { HttpError, route } from "@/server/http";

const bodySchema = z.object({
  email: z.string().trim().min(1, "Email is required").max(254),
  password: z.string().min(1, "Password is required").max(200),
});

export const POST = route(async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, "Invalid request", z.flattenError(parsed.error).fieldErrors);
  }
  const user = await login(parsed.data.email, parsed.data.password);
  return Response.json({ user });
});
