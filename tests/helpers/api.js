import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { users } from "@/db/schema";
import { cookieState } from "./cookieState.js";
import { getTestDb } from "./testDb.js";

const EMAIL = {
  supervisor: "supervisor@demo.com",
  verifier: "verifier@demo.com",
  sewing: "sewing@demo.com",
};

export const secretKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function userRow(who) {
  const db = await getTestDb();
  const [row] = await db.select().from(users).where(eq(users.email, EMAIL[who]));
  return row;
}

/** Signs a real session token exactly like the app does. */
export async function tokenFor(userId, role, { expiresIn = "1h" } = {}) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

/** Log in as a demo persona ("supervisor" | "verifier" | "sewing") or log out with null. */
export async function as(who) {
  if (!who) {
    cookieState.token = null;
    return null;
  }
  const row = await userRow(who);
  cookieState.token = await tokenFor(row.id, row.role);
  return row;
}

/** Invokes a real route handler with a real Request and returns { status, json, text }. */
export async function call(handler, { method = "GET", body, rawBody, params = {}, query = "" } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  if (rawBody !== undefined) init.body = rawBody;
  const res = await handler(new Request(`http://localhost/api/test${query}`, init), {
    params: Promise.resolve(params),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  return { status: res.status, json, text };
}
