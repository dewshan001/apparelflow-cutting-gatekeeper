import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cuttingOrders, users, verificationItems } from "@/db/schema";
import * as recipesRoute from "@/app/api/recipes/route.js";
import { as, call, tokenFor } from "../helpers/api.js";
import { cookieState } from "../helpers/cookieState.js";
import { createOrder, idParam, rejectAs, routes, saveCounts, exact } from "../helpers/flows.js";
import { getTestDb, resetData } from "../helpers/testDb.js";

let db;
const orderCount = async () => (await db.select().from(cuttingOrders)).length;
const post = (body, rawBody) => call(routes.orders.POST, { method: "POST", body, rawBody });
const validBody = { recipeId: 1, targetQty: 10, fabricRollId: "FAB-ROLL-882", actualFabricYds: 18 };

beforeAll(async () => {
  db = await getTestDb();
});

beforeEach(async () => {
  await resetData();
  await as(null);
});

describe("recipes", () => {
  it("serves both seeded recipes with their bill of materials to the supervisor", async () => {
    await as("supervisor");
    const res = await call(recipesRoute.GET);
    expect(res.status).toBe(200);
    const [blouse, crop] = res.json.recipes;
    expect(blouse).toMatchObject({ recipeCode: "REC-BL01", name: "Casual Blouse", stdFabricYards: 1.8, wastageCap: 5 });
    expect(blouse.components.map((c) => [c.componentName, c.piecesPerGarment])).toEqual([
      ["Front Body Panel", 1],
      ["Back Body Panel", 1],
      ["Sleeves (Left & Right)", 2],
      ["Collar & Stand", 1],
      ["Sleeve Cuffs", 2],
    ]);
    expect(crop).toMatchObject({ recipeCode: "REC-CT02", name: "Crop Top", stdFabricYards: 1.1, wastageCap: 8 });
    expect(crop.components.map((c) => c.piecesPerGarment)).toEqual([1, 1, 1, 1, 2]);
  });
});

describe("role-based access", () => {
  it.each(["verifier", "sewing"])("%s gets 403 on every supervisor endpoint", async (who) => {
    const order = await createOrder();
    await as(who);
    const results = await Promise.all([
      call(recipesRoute.GET),
      call(routes.orders.GET),
      call(routes.orders.POST, { method: "POST", body: validBody }),
      call(routes.resubmit.POST, { method: "POST", params: idParam(order.id) }),
    ]);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    expect(await orderCount()).toBe(1);
  });

  it("returns 401 when not logged in", async () => {
    const results = await Promise.all([
      call(recipesRoute.GET),
      call(routes.orders.GET),
      call(routes.orders.POST, { method: "POST", body: validBody }),
      call(routes.resubmit.POST, { method: "POST", params: idParam(1) }),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(await orderCount()).toBe(0);
  });
});

describe("creating an order (multiplier engine)", () => {
  it("derives expected component counts: 50 blouses need 100 cuffs", async () => {
    const order = await createOrder({ targetQty: 50, actualFabricYds: 94.5 });
    expect(order.status).toBe("PENDING_VERIFICATION");
    expect(order.items.map((i) => [i.componentName, i.expectedQty])).toEqual([
      ["Front Body Panel", 50],
      ["Back Body Panel", 50],
      ["Sleeves (Left & Right)", 100],
      ["Collar & Stand", 50],
      ["Sleeve Cuffs", 100],
    ]);
    expect(order.expectedFabricYds).toBe(90); // 50 x 1.80
    expect(order.actualFabricYds).toBe(94.5);
  });

  it("works for the second recipe: 30 crop tops", async () => {
    const order = await createOrder({ recipeId: 2, targetQty: 30, actualFabricYds: 33 });
    expect(order.recipe.recipeCode).toBe("REC-CT02");
    expect(order.items.map((i) => i.expectedQty)).toEqual([30, 30, 30, 30, 60]);
    expect(order.expectedFabricYds).toBe(33);
  });

  it("creates the order and one uncounted verification item per component together", async () => {
    const order = await createOrder();
    const items = await db.select().from(verificationItems).where(eq(verificationItems.orderId, order.id));
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.actualQty === null && i.status === null)).toBe(true);
  });

  it("generates unique, sequential order numbers", async () => {
    const a = await createOrder();
    const b = await createOrder();
    expect([a.orderNo, b.orderNo]).toEqual(["CO-00001", "CO-00002"]);
  });

  it("takes the creator from the session and ignores client-supplied status, owner and number", async () => {
    const supervisor = await as("supervisor");
    const res = await post({ ...validBody, status: "VERIFIED", createdBy: 2, orderNo: "HACKED", id: 9999, rejectionCount: 5 });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(cuttingOrders);
    expect(row.status).toBe("PENDING_VERIFICATION");
    expect(row.createdBy).toBe(supervisor.id);
    expect(row.orderNo).toBe("CO-00001");
    expect(row.id).toBe(1);
    expect(row.rejectionCount).toBe(0);
  });

  it("trims the fabric roll id and accepts fractional yards", async () => {
    const order = await createOrder({ fabricRollId: "  FAB-ROLL-882  ", actualFabricYds: 94.55 });
    expect(order.fabricRollId).toBe("FAB-ROLL-882");
    expect(order.actualFabricYds).toBe(94.55);
  });
});

describe("input validation: quantities and fields are strictly checked", () => {
  const badQuantities = [
    ["negative", -5],
    ["zero", 0],
    ["decimal", 2.5],
    ["text", "abc"],
    ["numeric text", "50"],
    ["empty string", ""],
    ["null", null],
    ["boolean", true],
    ["array", [50]],
    ["object", { n: 50 }],
    ["above the maximum", 100001],
    ["far above the maximum", 99999999999],
  ];

  it.each(badQuantities)("rejects a %s target quantity with 422 and creates nothing", async (_label, value) => {
    await as("supervisor");
    const res = await post({ ...validBody, targetQty: value });
    expect(res.status).toBe(422);
    expect(res.json.details.targetQty).toBeTruthy();
    expect(await orderCount()).toBe(0);
  });

  it("rejects a missing target quantity", async () => {
    await as("supervisor");
    const { targetQty: _omit, ...without } = validBody;
    expect((await post(without)).status).toBe(422);
    expect(await orderCount()).toBe(0);
  });

  it.each([
    ["negative", -1],
    ["zero", 0],
    ["text", "9"],
    ["empty string", ""],
    ["null", null],
    ["three decimals", 9.999],
    ["above the maximum", 1000001],
  ])("rejects %s fabric yards with 422", async (_label, value) => {
    await as("supervisor");
    const res = await post({ ...validBody, actualFabricYds: value });
    expect(res.status).toBe(422);
    expect(res.json.details.actualFabricYds).toBeTruthy();
    expect(await orderCount()).toBe(0);
  });

  it.each([
    ["blank", "   "],
    ["empty", ""],
    ["number", 123],
    ["null", null],
    ["too long", "x".repeat(51)],
  ])("rejects a %s fabric roll id with 422", async (_label, value) => {
    await as("supervisor");
    const res = await post({ ...validBody, fabricRollId: value });
    expect(res.status).toBe(422);
    expect(res.json.details.fabricRollId).toBeTruthy();
    expect(await orderCount()).toBe(0);
  });

  it.each([
    ["text", "1"],
    ["zero", 0],
    ["negative", -1],
    ["decimal", 1.5],
    ["huge", 99999999999],
  ])("rejects a %s recipe id with 422", async (_label, value) => {
    await as("supervisor");
    expect((await post({ ...validBody, recipeId: value })).status).toBe(422);
    expect(await orderCount()).toBe(0);
  });

  it("returns 404 for a well-formed recipe id that does not exist", async () => {
    await as("supervisor");
    expect((await post({ ...validBody, recipeId: 999 })).status).toBe(404);
    expect(await orderCount()).toBe(0);
  });

  it("rejects an empty payload, an empty object and invalid JSON", async () => {
    await as("supervisor");
    expect((await post(undefined, "")).status).toBe(422);
    expect((await post({})).status).toBe(422);
    expect((await post(undefined, "{broken")).status).toBe(422);
    expect(await orderCount()).toBe(0);
  });

  it("reports every invalid field at once", async () => {
    await as("supervisor");
    const res = await post({});
    expect(Object.keys(res.json.details).sort()).toEqual(["actualFabricYds", "fabricRollId", "recipeId", "targetQty"]);
  });
});

describe("listing and resubmitting", () => {
  it("lists only the logged-in supervisor's own orders", async () => {
    const mine = await createOrder({ fabricRollId: "MINE" });
    const [other] = await db
      .insert(users)
      .values({ email: "other@demo.com", passwordHash: "x", role: "cutting_supervisor", fullName: "Other Supervisor" })
      .returning();
    cookieState.token = await tokenFor(other.id, "cutting_supervisor");
    const theirs = (await call(routes.orders.POST, { method: "POST", body: { ...validBody, fabricRollId: "THEIRS" } })).json.order;

    const theirList = (await call(routes.orders.GET)).json.orders;
    expect(theirList.map((o) => o.id)).toEqual([theirs.id]);

    await as("supervisor");
    const myList = (await call(routes.orders.GET)).json.orders;
    expect(myList.map((o) => o.id)).toEqual([mine.id]);
  });

  it("shows the verifier's rejection reason to the supervisor", async () => {
    const order = await createOrder();
    await rejectAs("verifier", order, { note: "Collar pieces short by 6" });
    await as("supervisor");
    const [listed] = (await call(routes.orders.GET)).json.orders;
    expect(listed).toMatchObject({ status: "REJECTED", rejectionNote: "Collar pieces short by 6", rejectionCount: 1 });
  });

  it("resubmit returns a REJECTED order to PENDING_VERIFICATION and clears its counts", async () => {
    const order = await createOrder();
    await saveCounts(order, exact);
    await rejectAs("verifier", order, { note: "Defective fabric" });
    await as("supervisor");
    const res = await call(routes.resubmit.POST, { method: "POST", params: idParam(order.id) });
    expect(res.status).toBe(200);
    expect(res.json.order.status).toBe("PENDING_VERIFICATION");
    expect(res.json.order.items.every((i) => i.actualQty === null && i.status === null)).toBe(true);
  });

  it("resubmit returns 409 unless the order is REJECTED", async () => {
    const order = await createOrder();
    await as("supervisor");
    const res = await call(routes.resubmit.POST, { method: "POST", params: idParam(order.id) });
    expect(res.status).toBe(409);
  });

  it("resubmit returns the same 404 for another supervisor's order as for a missing one", async () => {
    const order = await createOrder();
    await rejectAs("verifier", order, { note: "Defective fabric" });
    const [other] = await db
      .insert(users)
      .values({ email: "other2@demo.com", passwordHash: "x", role: "cutting_supervisor", fullName: "Other Supervisor" })
      .returning();
    cookieState.token = await tokenFor(other.id, "cutting_supervisor");
    const theirs = await call(routes.resubmit.POST, { method: "POST", params: idParam(order.id) });
    const missing = await call(routes.resubmit.POST, { method: "POST", params: idParam(99999) });
    expect(theirs.status).toBe(404);
    expect(theirs.text).toBe(missing.text);
    const [row] = await db.select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
    expect(row.status).toBe("REJECTED");
  });

  it("resubmit returns 404 for malformed ids", async () => {
    await as("supervisor");
    for (const id of ["abc", "0", "-1", "1.5", "99999999999"]) {
      expect((await call(routes.resubmit.POST, { method: "POST", params: { id } })).status).toBe(404);
    }
  });
});
