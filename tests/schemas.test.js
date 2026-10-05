import { describe, expect, it } from "vitest";
import { fieldErrors, nonNegativeInt, positiveInt, positiveYards } from "@/server/domain/schemas";
import { z } from "zod";

const accepts = (schema, value) => schema.safeParse(value).success;

describe("positiveInt (piece quantities)", () => {
  it.each([1, 2, 50, 100000, 2147483647])("accepts %j", (v) => {
    expect(accepts(positiveInt, v)).toBe(true);
  });

  it.each([
    ["negative", -5],
    ["zero", 0],
    ["decimal", 2.5],
    ["tiny decimal", 0.1],
    ["numeric string", "50"],
    ["empty string", ""],
    ["text", "abc"],
    ["null", null],
    ["undefined", undefined],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["boolean", true],
    ["array", [1]],
    ["object", {}],
  ])("rejects %s", (_label, v) => {
    expect(accepts(positiveInt, v)).toBe(false);
  });
});

describe("nonNegativeInt (counted pieces)", () => {
  it.each([0, 1, 99, 10000000])("accepts %j (0 is a valid count)", (v) => {
    expect(accepts(nonNegativeInt, v)).toBe(true);
  });

  it.each([-1, 2.5, "5", "", null, undefined, NaN, Infinity, false])("rejects %j", (v) => {
    expect(accepts(nonNegativeInt, v)).toBe(false);
  });
});

describe("positiveYards (fabric)", () => {
  it.each([0.01, 1, 90, 92.5, 94.55, 1000000])("accepts %j", (v) => {
    expect(accepts(positiveYards, v)).toBe(true);
  });

  it.each([
    ["negative", -1],
    ["zero", 0],
    ["three decimals", 92.555],
    ["numeric string", "9"],
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["NaN", NaN],
    ["Infinity", Infinity],
  ])("rejects %s", (_label, v) => {
    expect(accepts(positiveYards, v)).toBe(false);
  });
});

describe("fieldErrors", () => {
  it("keys messages by field name", () => {
    const result = z.object({ qty: positiveInt }).safeParse({ qty: -3 });
    expect(fieldErrors(result.error)).toEqual({ qty: ["Must be greater than 0"] });
  });

  it("keys nested errors by their full path", () => {
    const schema = z.object({ counts: z.array(z.object({ actualQty: nonNegativeInt })) });
    const result = schema.safeParse({ counts: [{ actualQty: 1 }, { actualQty: -1 }] });
    expect(Object.keys(fieldErrors(result.error))).toEqual(["counts.1.actualQty"]);
  });

  it("keys body-level errors (e.g. not an object) under an underscore", () => {
    const result = z.object({ qty: positiveInt }).safeParse("junk");
    expect(Object.keys(fieldErrors(result.error))).toEqual(["_"]);
  });

  it("collects every invalid field", () => {
    const result = z.object({ a: positiveInt, b: positiveInt }).safeParse({});
    expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(["a", "b"]);
  });
});
