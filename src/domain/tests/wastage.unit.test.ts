import { describe, expect, it } from "vitest";
import { calculateWastage } from "@/domain/wastage";

describe("fabric wastage", () => {
  it("50 blouses × 1.8 = 90 yd; 95 yd used → 5.56% (exceeds 5% cap)", () => {
    expect(calculateWastage({ targetQty: 50, stdFabricYards: 1.8, actualFabricYds: 95, wastageCapPct: 5 })).toEqual({
      expectedFabricYds: 90,
      actualFabricYds: 95,
      wastagePct: 5.56,
      exceedsCap: true,
    });
  });

  it("50 crop tops × 1.1 = exactly 55 yd (no floating-point drift)", () => {
    const r = calculateWastage({ targetQty: 50, stdFabricYards: 1.1, actualFabricYds: 55, wastageCapPct: 8 });
    expect(r.expectedFabricYds).toBe(55);
    expect(r.wastagePct).toBe(0);
    expect(r.exceedsCap).toBe(false);
  });

  it("represents fabric savings as a negative percentage", () => {
    const r = calculateWastage({ targetQty: 50, stdFabricYards: 1.8, actualFabricYds: 85, wastageCapPct: 5 });
    expect(r.wastagePct).toBe(-5.56);
    expect(r.exceedsCap).toBe(false);
  });

  it("rejects invalid inputs instead of dividing by zero", () => {
    expect(() => calculateWastage({ targetQty: 0, stdFabricYards: 1.8, actualFabricYds: 1, wastageCapPct: 5 })).toThrow();
    expect(() => calculateWastage({ targetQty: 1, stdFabricYards: 0, actualFabricYds: 1, wastageCapPct: 5 })).toThrow();
    expect(() => calculateWastage({ targetQty: 1, stdFabricYards: 1, actualFabricYds: -1, wastageCapPct: 5 })).toThrow();
  });
});
