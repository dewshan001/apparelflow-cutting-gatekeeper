import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cuttingOrders, recipes, verificationItems } from "@/db/schema";
import { expectedComponents, expectedFabric } from "./domain/orders";
import { MAX_DB_INT, MAX_QTY, MAX_ROLL_ID_LENGTH, MAX_YARDS } from "@/lib/limits";
import { fieldErrors, positiveInt, positiveYards } from "./domain/schemas";
import { HttpError } from "./http";

export const createOrderSchema = z.object({
  recipeId: positiveInt.max(MAX_DB_INT, { error: "Invalid recipe" }),
  targetQty: positiveInt.max(MAX_QTY, { error: `Must be ${MAX_QTY.toLocaleString("en-US")} or fewer` }),
  fabricRollId: z
    .string({ error: "Fabric roll ID is required" })
    .trim()
    .min(1, { error: "Fabric roll ID is required" })
    .max(MAX_ROLL_ID_LENGTH, { error: `Must be ${MAX_ROLL_ID_LENGTH} characters or fewer` }),
  actualFabricYds: positiveYards.max(MAX_YARDS, { error: `Must be ${MAX_YARDS.toLocaleString("en-US")} or fewer` }),
});

/** Parses a JSON body with a zod schema; throws 422 with field errors. Unknown keys are dropped. */
export async function parseBody(request, schema) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, "Invalid request", fieldErrors(parsed.error));
  }
  return parsed.data;
}

export async function listRecipes() {
  const rows = await db.query.recipes.findMany({
    with: { components: { orderBy: (c, { asc }) => [asc(c.id)] } },
    orderBy: (r, { asc }) => [asc(r.id)],
  });
  return rows.map((r) => ({
    id: r.id,
    recipeCode: r.recipeCode,
    name: r.name,
    category: r.category,
    stdFabricYards: Number(r.stdFabricYards),
    wastageCap: Number(r.wastageCap),
    components: r.components.map((c) => ({
      id: c.id,
      componentName: c.componentName,
      piecesPerGarment: c.piecesPerGarment,
      imageUrl: c.imageUrl,
    })),
  }));
}

export function toOrderDto(o) {
  return {
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    targetQty: o.targetQty,
    fabricRollId: o.fabricRollId,
    actualFabricYds: Number(o.actualFabricYds),
    expectedFabricYds: Number(o.expectedFabricYds),
    rejectionCount: o.rejectionCount,
    rejectionNote: o.logs?.[0]?.rejectionNote ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    recipe: { id: o.recipe.id, recipeCode: o.recipe.recipeCode, name: o.recipe.name },
    items: [...o.items]
      .sort((a, b) => a.id - b.id)
      .map((i) => ({
        id: i.id,
        componentId: i.componentId,
        componentName: i.component.componentName,
        expectedQty: i.expectedQty,
        actualQty: i.actualQty,
        status: i.status,
      })),
  };
}

export const orderWith = {
  recipe: true,
  items: { with: { component: true } },
  logs: {
    where: (l, { eq }) => eq(l.decision, "REJECTED"),
    orderBy: (l, { desc }) => [desc(l.id)],
    limit: 1,
  },
};

async function loadOrder(id) {
  const row = await db.query.cuttingOrders.findFirst({
    where: eq(cuttingOrders.id, id),
    with: orderWith,
  });
  return toOrderDto(row);
}

/** Creates the order and one verification item per recipe component, atomically. */
export async function createOrder(userId, input) {
  const orderId = await db.transaction(async (tx) => {
    const recipe = await tx.query.recipes.findFirst({
      where: eq(recipes.id, input.recipeId),
      with: { components: true },
    });
    if (!recipe) throw new HttpError(404, "Recipe not found");

    const expected = expectedComponents(recipe.components, input.targetQty);
    const expectedYds = expectedFabric(input.targetQty, recipe.stdFabricYards);

    // Reserve the id first so the human-readable order number is unique without retries.
    const [{ id }] = await tx.execute(
      sql`select nextval(pg_get_serial_sequence('cutting_orders', 'id')) as id`,
    );
    const newId = Number(id);

    await tx.insert(cuttingOrders).values({
      id: newId,
      orderNo: `CO-${String(newId).padStart(5, "0")}`,
      recipeId: recipe.id,
      targetQty: input.targetQty,
      fabricRollId: input.fabricRollId,
      actualFabricYds: String(input.actualFabricYds),
      expectedFabricYds: String(expectedYds),
      status: "PENDING_VERIFICATION",
      createdBy: userId,
    });

    await tx.insert(verificationItems).values(
      expected.map((e) => ({
        orderId: newId,
        componentId: e.componentId,
        expectedQty: e.expectedQty,
        actualQty: null,
        status: null,
      })),
    );

    return newId;
  });

  return loadOrder(orderId);
}

/** The supervisor's own orders, newest first, with the latest rejection note. */
export async function listOrdersFor(userId) {
  const rows = await db.query.cuttingOrders.findMany({
    where: eq(cuttingOrders.createdBy, userId),
    with: orderWith,
    orderBy: [desc(cuttingOrders.createdAt), desc(cuttingOrders.id)],
  });
  return rows.map(toOrderDto);
}

/**
 * REJECTED -> PENDING_VERIFICATION after a re-cut. Counts are cleared so the verifier
 * must recount; stale counts can never carry an approval.
 */
export async function resubmitOrder(userId, orderId) {
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(cuttingOrders)
      .set({ status: "PENDING_VERIFICATION", updatedAt: new Date() })
      .where(
        and(
          eq(cuttingOrders.id, orderId),
          eq(cuttingOrders.createdBy, userId),
          eq(cuttingOrders.status, "REJECTED"),
        ),
      )
      .returning({ id: cuttingOrders.id });
    if (rows.length === 0) return false;

    await tx
      .update(verificationItems)
      .set({ actualQty: null, status: null })
      .where(eq(verificationItems.orderId, orderId));
    return true;
  });

  if (!updated) {
    // Same 404 for "missing" and "not yours" so ids of other users' orders are not revealed.
    const [existing] = await db
      .select({ status: cuttingOrders.status })
      .from(cuttingOrders)
      .where(and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.createdBy, userId)))
      .limit(1);
    if (!existing) throw new HttpError(404, "Order not found");
    throw new HttpError(409, `Only REJECTED orders can be resubmitted (current status: ${existing.status})`);
  }

  return loadOrder(orderId);
}
