import { describe, expect, it } from "vitest";
import { approvalBlockers, canApprove, evaluate } from "@/server/domain/traffic";

const item = (componentId, expectedQty, actualQty, extra = {}) => ({
  componentId,
  expectedQty,
  actualQty,
  ...extra,
});

describe("evaluate", () => {
  it("is GREEN when actual equals expected", () => {
    expect(evaluate(100, 100)).toBe("GREEN");
    expect(evaluate(0, 0)).toBe("GREEN");
  });

  it("is YELLOW when actual exceeds expected", () => {
    expect(evaluate(100, 101)).toBe("YELLOW");
    expect(evaluate(0, 1)).toBe("YELLOW");
  });

  it("is RED when actual is below expected", () => {
    expect(evaluate(100, 99)).toBe("RED");
    expect(evaluate(100, 0)).toBe("RED");
  });

  it.each([
    ["negative expected", -1, 5],
    ["negative actual", 5, -1],
    ["decimal actual", 5, 4.5],
    ["decimal expected", 5.5, 5],
    ["string actual", 5, "5"],
    ["null actual", 5, null],
    ["undefined actual", 5, undefined],
    ["NaN actual", 5, NaN],
    ["Infinity actual", 5, Infinity],
  ])("throws on invalid input: %s", (_label, expected, actual) => {
    expect(() => evaluate(expected, actual)).toThrow(RangeError);
  });
});

describe("canApprove", () => {
  it("allows an order where every component is GREEN", () => {
    expect(canApprove([item(1, 50, 50), item(2, 100, 100)])).toBe(true);
  });

  it("allows YELLOW (excess) components", () => {
    expect(canApprove([item(1, 50, 50), item(2, 100, 104)])).toBe(true);
  });

  it("blocks when any single component is RED", () => {
    expect(canApprove([item(1, 50, 50), item(2, 100, 99), item(3, 50, 50)])).toBe(false);
  });

  it("blocks when any component is uncounted (null or undefined)", () => {
    expect(canApprove([item(1, 50, 50), item(2, 100, null)])).toBe(false);
    expect(canApprove([item(1, 50, 50), item(2, 100, undefined)])).toBe(false);
  });

  it("blocks an empty or non-array item list", () => {
    expect(canApprove([])).toBe(false);
    expect(canApprove(null)).toBe(false);
    expect(canApprove(undefined)).toBe(false);
  });

  it("blocks when a required component has no item (missing)", () => {
    const items = [item(1, 50, 50), item(2, 100, 100)];
    expect(canApprove(items, [1, 2])).toBe(true);
    expect(canApprove(items, [1, 2, 3])).toBe(false);
  });

  it("is not fooled by duplicate items hiding a missing component", () => {
    expect(canApprove([item(1, 50, 50), item(1, 50, 50)], [1, 2])).toBe(false);
  });

  it("recomputes status from quantities and ignores a stored status", () => {
    expect(canApprove([item(1, 50, 40, { status: "GREEN" })])).toBe(false);
    expect(canApprove([item(1, 50, 60, { status: "RED" })])).toBe(true);
  });

  it("blocks malformed quantities instead of throwing", () => {
    expect(canApprove([item(1, 50, -3)])).toBe(false);
    expect(canApprove([item(1, 50, 2.5)])).toBe(false);
    expect(canApprove([item(1, 50, "50")])).toBe(false);
  });
});

describe("approvalBlockers", () => {
  it("is empty when everything is counted and none is short", () => {
    expect(approvalBlockers([item(1, 50, 50), item(2, 100, 120)], [1, 2])).toEqual([]);
  });

  it("reports each problem with a reason", () => {
    const blockers = approvalBlockers(
      [item(1, 50, 50), item(2, 100, 99), item(3, 10, null), item(4, 10, 2.5)],
      [1, 2, 3, 4, 5],
    );
    expect(blockers).toEqual([
      { componentId: 2, reason: "SHORTAGE" },
      { componentId: 3, reason: "UNCOUNTED" },
      { componentId: 4, reason: "INVALID" },
      { componentId: 5, reason: "MISSING" },
    ]);
  });

  it("treats a count of 0 as a shortage, not as uncounted", () => {
    expect(approvalBlockers([item(1, 10, 0)])).toEqual([{ componentId: 1, reason: "SHORTAGE" }]);
  });

  it("reports every required component as missing when there are no items", () => {
    expect(approvalBlockers([], [1, 2])).toEqual([
      { componentId: 1, reason: "MISSING" },
      { componentId: 2, reason: "MISSING" },
    ]);
    expect(approvalBlockers(null, [1])).toEqual([{ componentId: 1, reason: "MISSING" }]);
  });

  it("agrees with canApprove", () => {
    const cases = [
      [item(1, 5, 5)],
      [item(1, 5, 4)],
      [item(1, 5, null)],
      [],
    ];
    for (const items of cases) {
      expect(canApprove(items, [1])).toBe(approvalBlockers(items, [1]).length === 0 && items.length > 0);
    }
  });
});
