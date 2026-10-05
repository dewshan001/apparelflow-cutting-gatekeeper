import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema.js";
import { DEMO_PASSWORD, DEMO_USERS, RECIPES } from "../src/db/seedData.js";

const { users, recipes, recipeComponents } = schema;

const client = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, max: 1 });
const db = drizzle(client, { schema });

try {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    await db.insert(users).values({ ...u, passwordHash }).onConflictDoNothing({ target: users.email });
  }

  for (const { components, ...recipe } of RECIPES) {
    const [row] = await db
      .insert(recipes)
      .values(recipe)
      .onConflictDoUpdate({ target: recipes.recipeCode, set: recipe })
      .returning({ id: recipes.id });

    for (const [componentName, piecesPerGarment] of components) {
      const [existing] = await db
        .select({ id: recipeComponents.id })
        .from(recipeComponents)
        .where(and(eq(recipeComponents.recipeId, row.id), eq(recipeComponents.componentName, componentName)));
      if (existing) {
        await db.update(recipeComponents).set({ piecesPerGarment }).where(eq(recipeComponents.id, existing.id));
      } else {
        await db.insert(recipeComponents).values({ recipeId: row.id, componentName, piecesPerGarment });
      }
    }
  }
  console.log("Seed complete.");
} finally {
  await client.end();
}
