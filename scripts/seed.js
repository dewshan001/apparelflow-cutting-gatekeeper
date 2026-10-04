import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema.js";

const { users, recipes, recipeComponents } = schema;

const DEMO_PASSWORD = "Demo@12345";

const DEMO_USERS = [
  { email: "supervisor@demo.com", role: "cutting_supervisor", fullName: "Sam Supervisor" },
  { email: "verifier@demo.com", role: "cutting_verifier", fullName: "Vera Verifier" },
  { email: "sewing@demo.com", role: "sewing_supervisor", fullName: "Sewa Sewing" },
];

const RECIPES = [
  {
    recipeCode: "REC-BL01",
    name: "Casual Blouse",
    category: "Blouse",
    stdFabricYards: "1.80",
    wastageCap: "5.00",
    components: [
      ["Front Body Panel", 1],
      ["Back Body Panel", 1],
      ["Sleeves (Left & Right)", 2],
      ["Collar & Stand", 1],
      ["Sleeve Cuffs", 2],
    ],
  },
  {
    recipeCode: "REC-CT02",
    name: "Crop Top",
    category: "Crop Top",
    stdFabricYards: "1.10",
    wastageCap: "8.00",
    components: [
      ["Front Chest Panel", 1],
      ["Back Support Panel", 1],
      ["Neck Binding Strip", 1],
      ["Hem Elastic Casing", 1],
      ["Side Strap Accents", 2],
    ],
  },
];

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
