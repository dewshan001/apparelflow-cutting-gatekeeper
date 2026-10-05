import { SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getSession, requireRole } from "@/server/auth";
import { HttpError } from "@/server/http";
import { ROLES } from "@/lib/roles";
import { as, tokenFor, userRow } from "./helpers/api.js";
import { cookieState } from "./helpers/cookieState.js";

let verifier;

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const sign = (claims, { secret = process.env.JWT_SECRET, exp = "1h", sub = "2" } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));

beforeAll(async () => {
  verifier = await userRow("verifier");
});

afterEach(() => {
  cookieState.token = null;
});

describe("getSession", () => {
  it("returns the user id and role for a valid token", async () => {
    await as("verifier");
    expect(await getSession()).toEqual({ userId: verifier.id, role: "cutting_verifier" });
  });

  it("returns null when there is no cookie", async () => {
    expect(await getSession()).toBeNull();
  });

  it.each([
    ["garbage", async () => "not-a-jwt"],
    ["empty", async () => ""],
    ["tampered signature", async () => {
      const t = await tokenFor(verifier.id, "cutting_verifier");
      return t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA");
    }],
    ["tampered payload (role escalation)", async () => {
      const [h, , s] = (await tokenFor(verifier.id, "cutting_supervisor")).split(".");
      return `${h}.${b64({ sub: String(verifier.id), role: "cutting_verifier", exp: 9999999999 })}.${s}`;
    }],
    ["unsigned (alg none)", async () => `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "2", role: "cutting_verifier", exp: 9999999999 })}.`],
    ["signed with a different secret", async () => sign({ role: "cutting_verifier" }, { secret: "another-secret-another-secret-0123456789" })],
    ["expired", async () => sign({ role: "cutting_verifier" }, { exp: "-1h" })],
    ["missing role claim", async () => sign({})],
    ["non-numeric subject", async () => sign({ role: "cutting_verifier" }, { sub: "abc" })],
    ["numeric subject with a decimal", async () => sign({ role: "cutting_verifier" }, { sub: "1.5" })],
  ])("returns null for a %s token", async (_label, makeToken) => {
    cookieState.token = await makeToken();
    expect(await getSession()).toBeNull();
  });
});

describe("requireRole", () => {
  it("throws 401 when not logged in", async () => {
    await expect(requireRole(ROLES.CUTTING_VERIFIER)).rejects.toMatchObject({ status: 401 });
    await expect(requireRole(ROLES.CUTTING_VERIFIER)).rejects.toBeInstanceOf(HttpError);
  });

  it("throws 403 when logged in with a role that is not allowed", async () => {
    await as("supervisor");
    await expect(requireRole(ROLES.CUTTING_VERIFIER)).rejects.toMatchObject({ status: 403 });
    await as("sewing");
    await expect(requireRole(ROLES.CUTTING_VERIFIER)).rejects.toMatchObject({ status: 403 });
  });

  it("returns the session when the role is allowed, including when several roles are allowed", async () => {
    await as("verifier");
    expect(await requireRole(ROLES.CUTTING_VERIFIER)).toEqual({ userId: verifier.id, role: "cutting_verifier" });
    expect((await requireRole(ROLES.CUTTING_SUPERVISOR, ROLES.CUTTING_VERIFIER)).role).toBe("cutting_verifier");
  });

  it("returns 401 (not 403) for an invalid token so nothing is revealed", async () => {
    cookieState.token = "forged.token.value";
    await expect(requireRole(ROLES.CUTTING_VERIFIER)).rejects.toMatchObject({ status: 401 });
  });
});
