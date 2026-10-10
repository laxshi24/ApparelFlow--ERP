import { describe, expect, it } from "vitest";
import { assessApproval, classifyCount, isValidCount } from "@shared/domain/traffic-light";

describe("traffic light", () => {
  it("classifies GREEN / YELLOW / RED", () => {
    expect(classifyCount(100, 100)).toBe("GREEN");
    expect(classifyCount(100, 101)).toBe("YELLOW");
    expect(classifyCount(100, 99)).toBe("RED");
    expect(classifyCount(100, 0)).toBe("RED");
  });

  it("never treats an uncounted component as zero or verified", () => {
    expect(classifyCount(100, null)).toBeNull();
  });

  it.each([-1, 1.5, Number.NaN, Infinity])("rejects invalid count %s", (v) => {
    expect(isValidCount(v)).toBe(false);
  });

  it("accepts zero as a valid (RED) count", () => {
    expect(isValidCount(0)).toBe(true);
  });
});

describe("approval assessment", () => {
  const base = [
    { componentName: "A", expectedQty: 50, actualQty: 50 },
    { componentName: "B", expectedQty: 100, actualQty: 102 },
  ];

  it("is eligible when everything is counted with no shortage (surplus allowed)", () => {
    const a = assessApproval(base);
    expect(a.eligible).toBe(true);
    expect(a.surpluses).toEqual([{ componentName: "B", expectedQty: 100, actualQty: 102, overBy: 2 }]);
  });

  it("blocks on any RED component", () => {
    const a = assessApproval([...base, { componentName: "C", expectedQty: 50, actualQty: 49 }]);
    expect(a.eligible).toBe(false);
    expect(a.shortages).toEqual([{ componentName: "C", expectedQty: 50, actualQty: 49, shortBy: 1 }]);
  });

  it("blocks on any missing count", () => {
    const a = assessApproval([...base, { componentName: "C", expectedQty: 50, actualQty: null }]);
    expect(a.eligible).toBe(false);
    expect(a.missing).toEqual(["C"]);
  });

  it("blocks when there are no items at all", () => {
    expect(assessApproval([]).eligible).toBe(false);
  });
});
