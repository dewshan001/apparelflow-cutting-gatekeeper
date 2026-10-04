import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const globalForDb = globalThis;

// prepare:false keeps this compatible with Supabase's transaction pooler (Vercel).
const client =
  globalForDb.__pgClient ??
  postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false });

if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });
