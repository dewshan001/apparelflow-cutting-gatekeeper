import { vi } from "vitest";

// Deterministic secret so the tests can sign real session tokens. Never a real secret.
process.env.JWT_SECRET = "test-only-secret-test-only-secret-0123456789";

// Cookie store the auth code reads from; tests set cookieState.token to "log in".
vi.mock("next/headers", async () => {
  const { cookieState } = await import("./helpers/cookieState.js");
  return {
    cookies: async () => ({
      get: (name) =>
        name === "af_session" && cookieState.token ? { name, value: cookieState.token } : undefined,
      set: vi.fn(),
    }),
  };
});

// The app's database is replaced by an in-process Postgres (PGlite) running the real migrations.
// Created lazily, so pure unit tests that never import "@/db" pay nothing.
vi.mock("@/db", async () => {
  const { getTestDb } = await import("./helpers/testDb.js");
  return { db: await getTestDb() };
});
