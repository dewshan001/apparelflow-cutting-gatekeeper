import { describe, expect, it } from "vitest";
import {
  approveBlockedReason,
  changedCounts,
  describeServerError,
  summarizeCounts,
  validateCount,
} from "@/lib/verifierCounts";

describe("validateCount", () => {
  it("treats blank and whitespace as not counted (not an error, not 0)", () => {
    expect(validateCount("")).toEqual({ blank: true, value: null, error: null });
    expect(validateCount("   ")).toEqual({ blank: true, value: null, error: null });
    expect(validateCount(undefined).blank).toBe(true);
    expect(validateCount(null).blank).toBe(true);
  });

  it("accepts whole numbers including 0", () => {
    expect(validateCount("0").value).toBe(0);
    expect(validateCount("100").value).toBe(100);
    expect(validateCount(" 42 ").value).toBe(42);
    expect(validateCount("007").value).toBe(7);
    expect(validateCount("10000000").value).toBe(10000000);
  });

  it.each([
    ["-1", "Cannot be negative"],
    ["-0", "Cannot be negative"],
    ["2.5", "Whole numbers only (no decimals)"],
    ["10.", "Whole numbers only (no decimals)"],
    ["abc", "Digits only"],
    ["5e2", "Digits only"],
    ["1,000", "Digits only"],
    ["12abc", "Digits only"],
    ["10000001", "Must be 10,000,000 or fewer"],
    ["99999999999", "Must be 10,000,000 or fewer"],
  ])("rejects %j", (raw, message) => {
    const r = validateCount(raw);
    expect(r.value).toBeNull();
    expect(r.error).toBe(message);
  });
});

const items = [
  { componentId: 1, componentName: "Front", expectedQty: 10 },
  { componentId: 2, componentName: "Sleeves", expectedQty: 20 },
  { componentId: 3, componentName: "Cuffs", expectedQty: 20 },
];

describe("summarizeCounts", () => {
  it("enables approve when every component matches", () => {
    const s = summarizeCounts(items, { 1: "10", 2: "20", 3: "20" });
    expect(s.canApprove).toBe(true);
    expect(s.rows.map((r) => r.status)).toEqual(["GREEN", "GREEN", "GREEN"]);
    expect(approveBlockedReason(s)).toBe("");
  });

  it("allows YELLOW (excess) and reports the variance", () => {
    const s = summarizeCounts(items, { 1: "10", 2: "23", 3: "20" });
    expect(s.canApprove).toBe(true);
    expect(s.rows[1]).toMatchObject({ status: "YELLOW", variance: 3 });
  });

  it("blocks on any RED and reports the shortage", () => {
    const s = summarizeCounts(items, { 1: "10", 2: "19", 3: "20" });
    expect(s.canApprove).toBe(false);
    expect(s.rows[1]).toMatchObject({ status: "RED", variance: -1 });
    expect(s.shortages).toBe(1);
    expect(approveBlockedReason(s)).toBe("1 shortage");
  });

  it("blocks when any component is not counted", () => {
    const s = summarizeCounts(items, { 1: "10", 2: "", 3: "20" });
    expect(s.canApprove).toBe(false);
    expect(s.rows[1]).toMatchObject({ status: null, variance: null });
    expect(approveBlockedReason(s)).toBe("1 not counted");
  });

  it("treats a missing input key as not counted", () => {
    expect(summarizeCounts(items, { 1: "10" }).canApprove).toBe(false);
    expect(summarizeCounts(items, {}).uncounted).toBe(3);
  });

  it("treats 0 as a counted shortage, not as uncounted", () => {
    const s = summarizeCounts(items, { 1: "0", 2: "20", 3: "20" });
    expect(s.rows[0]).toMatchObject({ status: "RED", value: 0 });
    expect(s.shortages).toBe(1);
    expect(s.uncounted).toBe(0);
  });

  it("blocks on invalid input and counts it as an error, never as a number", () => {
    const s = summarizeCounts(items, { 1: "10", 2: "2.5", 3: "-3" });
    expect(s.canApprove).toBe(false);
    expect(s.errorCount).toBe(2);
    expect(s.rows[1]).toMatchObject({ value: null, status: null, error: "Whole numbers only (no decimals)" });
    expect(approveBlockedReason(s)).toBe("2 invalid entries");
  });

  it("combines reasons", () => {
    const s = summarizeCounts(items, { 1: "5", 2: "", 3: "x" });
    expect(approveBlockedReason(s)).toBe("1 shortage, 1 invalid entry, 1 not counted");
  });

  it("never enables approve for an empty batch", () => {
    expect(summarizeCounts([], {}).canApprove).toBe(false);
  });
});

describe("changedCounts", () => {
  it("returns only valid values that differ from the saved ones", () => {
    const saved = { 1: 10, 2: null, 3: 18 };
    expect(changedCounts(items, saved, { 1: "10", 2: "20", 3: "20" })).toEqual([
      { componentId: 2, actualQty: 20 },
      { componentId: 3, actualQty: 20 },
    ]);
  });

  it("ignores blank and invalid entries", () => {
    expect(changedCounts(items, {}, { 1: "", 2: "abc", 3: "5" })).toEqual([{ componentId: 3, actualQty: 5 }]);
  });

  it("is empty when nothing changed", () => {
    expect(changedCounts(items, { 1: 10, 2: 20, 3: 20 }, { 1: "10", 2: "20", 3: "20" })).toEqual([]);
  });

  it("saves a changed count of 0", () => {
    expect(changedCounts(items, { 1: 10 }, { 1: "0" })).toEqual([{ componentId: 1, actualQty: 0 }]);
  });
});

describe("describeServerError", () => {
  it("lists each approval blocker with names and counts", () => {
    const out = describeServerError(422, {
      error: "Approval blocked",
      details: {
        blockers: [
          { componentId: 3, componentName: "Cuffs", reason: "SHORTAGE", expectedQty: 100, actualQty: 90 },
          { componentId: 4, componentName: "Collar", reason: "UNCOUNTED", expectedQty: 50, actualQty: null },
        ],
      },
    });
    expect(out.title).toBe("Approval blocked");
    expect(out.lines).toEqual([
      "Cuffs: shortage (expected 100, counted 90)",
      "Collar: not counted (expected 50, counted none)",
    ]);
  });

  it("shows field errors for other 422 responses", () => {
    expect(describeServerError(422, { error: "Invalid request", details: { note: ["Reason is too short"] } }).lines).toEqual([
      "note: Reason is too short",
    ]);
  });

  it("explains 401, 403 and 409 and keeps the server message otherwise", () => {
    expect(describeServerError(401, {}).title).toMatch(/sign in/i);
    expect(describeServerError(403, {}).title).toMatch(/forbidden/i);
    expect(describeServerError(409, { error: "Order is VERIFIED; only PENDING_VERIFICATION orders can be verified" }).title).toMatch(
      /VERIFIED/,
    );
    expect(describeServerError(500, null).title).toMatch(/try again/i);
  });
});
