import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "cutting_supervisor",
  "cutting_verifier",
  "sewing_supervisor",
]);

export const orderStatus = pgEnum("order_status", [
  "PENDING_VERIFICATION",
  "REJECTED",
  "VERIFIED",
  "SEWING_STARTED",
]);

export const itemStatus = pgEnum("item_status", ["GREEN", "YELLOW", "RED"]);

export const decision = pgEnum("decision", ["APPROVED", "REJECTED"]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  fullName: text("full_name").notNull(),
  createdAt: createdAt(),
});

export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  recipeCode: text("recipe_code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  stdFabricYards: numeric("std_fabric_yards", { precision: 6, scale: 2 }).notNull(),
  wastageCap: numeric("wastage_cap", { precision: 5, scale: 2 }).notNull(),
});

export const recipeComponents = pgTable(
  "recipe_components",
  {
    id: serial("id").primaryKey(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    componentName: text("component_name").notNull(),
    piecesPerGarment: integer("pieces_per_garment").notNull(),
    imageUrl: text("image_url"),
  },
  (t) => [
    check("recipe_components_pieces_positive", sql`${t.piecesPerGarment} > 0`),
    index("recipe_components_recipe_idx").on(t.recipeId),
  ],
);

export const cuttingOrders = pgTable(
  "cutting_orders",
  {
    id: serial("id").primaryKey(),
    orderNo: text("order_no").notNull().unique(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id),
    targetQty: integer("target_qty").notNull(),
    fabricRollId: text("fabric_roll_id").notNull(),
    actualFabricYds: numeric("actual_fabric_yds", { precision: 10, scale: 2 }).notNull(),
    expectedFabricYds: numeric("expected_fabric_yds", { precision: 10, scale: 2 }).notNull(),
    status: orderStatus("status").notNull().default("PENDING_VERIFICATION"),
    rejectionCount: integer("rejection_count").notNull().default(0),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("cutting_orders_target_qty_positive", sql`${t.targetQty} > 0`),
    check("cutting_orders_fabric_positive", sql`${t.actualFabricYds} > 0`),
    index("cutting_orders_status_idx").on(t.status),
    index("cutting_orders_created_by_idx").on(t.createdBy),
  ],
);

export const verificationItems = pgTable(
  "verification_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => cuttingOrders.id, { onDelete: "cascade" }),
    componentId: integer("component_id")
      .notNull()
      .references(() => recipeComponents.id),
    expectedQty: integer("expected_qty").notNull(),
    // null = not yet counted; blocks approval server-side
    actualQty: integer("actual_qty"),
    status: itemStatus("status"),
  },
  (t) => [
    unique("verification_items_order_component_uq").on(t.orderId, t.componentId),
    check("verification_items_expected_nonneg", sql`${t.expectedQty} >= 0`),
    check(
      "verification_items_actual_nonneg",
      sql`${t.actualQty} IS NULL OR ${t.actualQty} >= 0`,
    ),
  ],
);

// Append-only: UPDATE/DELETE are rejected by a DB trigger (see drizzle migrations).
export const verificationLogs = pgTable(
  "verification_logs",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => cuttingOrders.id),
    verifierId: integer("verifier_id")
      .notNull()
      .references(() => users.id),
    decision: decision("decision").notNull(),
    rejectionNote: text("rejection_note"),
    wastagePct: numeric("wastage_pct", { precision: 8, scale: 2 }),
    varianceJson: jsonb("variance_json"),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "verification_logs_reject_needs_note",
      sql`${t.decision} <> 'REJECTED' OR length(btrim(coalesce(${t.rejectionNote}, ''))) > 0`,
    ),
    index("verification_logs_order_idx").on(t.orderId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(cuttingOrders),
  verifications: many(verificationLogs),
}));

export const recipesRelations = relations(recipes, ({ many }) => ({
  components: many(recipeComponents),
  orders: many(cuttingOrders),
}));

export const recipeComponentsRelations = relations(recipeComponents, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeComponents.recipeId], references: [recipes.id] }),
}));

export const cuttingOrdersRelations = relations(cuttingOrders, ({ one, many }) => ({
  recipe: one(recipes, { fields: [cuttingOrders.recipeId], references: [recipes.id] }),
  creator: one(users, { fields: [cuttingOrders.createdBy], references: [users.id] }),
  items: many(verificationItems),
  logs: many(verificationLogs),
}));

export const verificationItemsRelations = relations(verificationItems, ({ one }) => ({
  order: one(cuttingOrders, { fields: [verificationItems.orderId], references: [cuttingOrders.id] }),
  component: one(recipeComponents, {
    fields: [verificationItems.componentId],
    references: [recipeComponents.id],
  }),
}));

export const verificationLogsRelations = relations(verificationLogs, ({ one }) => ({
  order: one(cuttingOrders, { fields: [verificationLogs.orderId], references: [cuttingOrders.id] }),
  verifier: one(users, { fields: [verificationLogs.verifierId], references: [users.id] }),
}));
