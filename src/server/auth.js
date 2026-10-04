import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { HttpError } from "./http";

export const SESSION_COOKIE = "af_session";
const SESSION_SECONDS = 60 * 60 * 8;
const ALG = "HS256";

// Used so a login for an unknown email costs the same as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/** Verifies credentials, sets the session cookie, returns the public user. */
export async function login(email, password) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "Invalid email or password");

  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey());

  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_SECONDS));

  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}

export async function logout() {
  (await cookies()).set(SESSION_COOKIE, "", cookieOptions(0));
}

/** Returns { userId, role } from a valid session cookie, or null. */
export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ALG] });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || typeof payload.role !== "string") return null;
    return { userId, role: payload.role };
  } catch {
    return null;
  }
}

/** 401 if not logged in, 403 if the role is not allowed. Returns the session. */
export async function requireRole(...allowedRoles) {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Authentication required");
  if (!allowedRoles.includes(session.role)) {
    throw new HttpError(403, "Forbidden: your role cannot perform this action");
  }
  return session;
}
