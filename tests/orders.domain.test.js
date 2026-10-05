import { describe, expect, it } from "vitest";
import { expectedComponents, expectedFabric, wastagePct } from "@/server/domain/orders";

const blouse = [
  { id: 1, componentName: "Front Body Panel", piecesPerGarment: 1 },
  { id: 2, componentName: "Back Body Panel", piecesPerGarment: 1 },
  { id: 3, componentName: "Sleeves (Left & Right)", piecesPerGarment: 2 },
  { id: 4, componentName: "Collar & Stand", piecesPerGarment: 1 },
  { id: 5, componentName: "Sleeve Cuffs", piecesPerGarment: 2 },
];

describe("expectedComponents (multiplier engine)", () => {
  it("multiplies pieces per garment by the batch size: 50 garments x 2 cuffs = 100", () => {
    const result = expectedComponents(blouse, 50);
    expect(result.map((r) => r.expectedQty)).toEqual([50, 50, 100, 50, 100]);
    expect(result[4]).toEqual({ componentId: 5, componentName: "Sleeve Cuffs", expectedQty: 100 });
  });

  it("works for a batch of one", () => {
    expect(expectedComponents(blouse, 1).map((r) => r.expectedQty)).toEqual([1, 1, 2, 1, 2]);
  });

  it.each([0, -1, 2.5, "50", null, undefined, NaN, Infinity])("rejects target quantity %j", (qty) => {
    expect(() => expectedComponents(blouse, qty)).toThrow(RangeError);
  });

  it("rejects a recipe component with an invalid pieces-per-garment value", () => {
    expect(() => expectedComponents([{ id: 1, componentName: "Bad", piecesPerGarment: 0 }], 5)).toThrow(RangeError);
  });

  it("returns an empty list for a recipe with no components", () => {
    expect(expectedComponents([], 5)).toEqual([]);
  });
});

describe("expectedFabric", () => {
  it("multiplies quantity by standard yards per piece", () => {
    expect(expectedFabric(50, 1.8)).toBe(90);
    expect(expectedFabric(30, 1.1)).toBe(33);
  });

  it("accepts the numeric strings the database returns", () => {
    expect(expectedFabric(50, "1.80")).toBe(90);
  });

  it("rounds to 2 decimals without floating-point noise", () => {
    expect(expectedFabric(3, 1.1)).toBe(3.3); // 3 * 1.1 = 3.3000000000000003
  });

  it.each([0, -1, 2.5, "50", null])("rejects target quantity %j", (qty) => {
    expect(() => expectedFabric(qty, 1.8)).toThrow(RangeError);
  });

  it.each([0, -1, "abc", null, NaN])("rejects standard yards %j", (yards) => {
    expect(() => expectedFabric(10, yards)).toThrow(RangeError);
  });
});

describe("wastagePct", () => {
  it("is ((actual - expected) / expected) x 100", () => {
    expect(wastagePct(94.5, 90)).toBe(5);
    expect(wastagePct(20, 18)).toBe(11.11);
  });

  it("is 0 when actual equals expected", () => {
    expect(wastagePct(90, 90)).toBe(0);
  });

  it("is negative when fabric was saved", () => {
    expect(wastagePct(85, 90)).toBe(-5.56);
  });

  it("accepts numeric strings from the database", () => {
    expect(wastagePct("94.50", "90.00")).toBe(5);
  });

  it("refuses to divide by zero or a negative expected value", () => {
    expect(() => wastagePct(85, 0)).toThrow(RangeError);
    expect(() => wastagePct(85, -90)).toThrow(RangeError);
    expect(() => wastagePct(85, "abc")).toThrow(RangeError);
  });

  it("rejects a negative or non-numeric actual value", () => {
    expect(() => wastagePct(-1, 90)).toThrow(RangeError);
    expect(() => wastagePct("abc", 90)).toThrow(RangeError);
    expect(() => wastagePct(NaN, 90)).toThrow(RangeError);
  });
});
