import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { DEMO_USERS, RECIPES } from "@/db/seedData";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

let dbPromise;

/** One in-process Postgres per test file: real migrations (incl. the audit trigger) + seed data. */
export function getTestDb() {
  dbPromise ??= create();
  return dbPromise;
}

async function create() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });

  const passwordHash = bcrypt.hashSync("not-used-by-tests", 4);
  await db.insert(schema.users).values(DEMO_USERS.map((u) => ({ ...u, passwordHash })));

  for (const { components, ...recipe } of RECIPES) {
    const [row] = await db.insert(schema.recipes).values(recipe).returning({ id: schema.recipes.id });
    await db.insert(schema.recipeComponents).values(
      components.map(([componentName, piecesPerGarment]) => ({ recipeId: row.id, componentName, piecesPerGarment })),
    );
  }
  return db;
}

/** Clears orders, counts and logs between tests (TRUNCATE does not fire the row-delete trigger). */
export async function resetData() {
  const db = await getTestDb();
  await db.execute(sql`truncate table verification_logs, verification_items, cutting_orders restart identity cascade`);
}
