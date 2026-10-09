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

  it("rounds exact halves away from zero (regression: double rounding gave -4.97 for -4.975%)", () => {
    // 400 × 1.1 = 440 yd expected; 418.11 yd used → exactly -4.975 %
    expect(calculateWastage({ targetQty: 400, stdFabricYards: 1.1, actualFabricYds: 418.11, wastageCapPct: 8 }).wastagePct).toBe(-4.98);
    // 2.225 % → 2.23
    expect(calculateWastage({ targetQty: 400, stdFabricYards: 1, actualFabricYds: 408.9, wastageCapPct: 8 }).wastagePct).toBe(2.23);
  });

  it("matches exact BigInt arithmetic on a sample of inputs", () => {
    const exact = (a: bigint, e: bigint) => {
      const num = (a - e) * 10_000n; // hundredths of a percent, times e
      const sign = num < 0n ? -1 : 1;
      const abs = num < 0n ? -num : num;
      const rounded = (abs * 2n + e) / (2n * e); // floor(abs/e + 1/2)
      return (sign * Number(rounded)) / 100 || 0;
    };
    for (const std of [110, 180, 125, 333]) {
      for (let qty = 1; qty <= 500; qty += 7) {
        const e = qty * std;
        for (let a = Math.max(0, e - 2500); a <= e + 2500; a += 3) {
          const got = calculateWastage({ targetQty: qty, stdFabricYards: std / 100, actualFabricYds: a / 100, wastageCapPct: 5 }).wastagePct;
          if (got !== exact(BigInt(a), BigInt(e))) throw new Error(`qty=${qty} std=${std} actual=${a}: got ${got}`);
        }
      }
    }
  });

  it("rejects invalid inputs instead of dividing by zero", () => {
    expect(() => calculateWastage({ targetQty: 0, stdFabricYards: 1.8, actualFabricYds: 1, wastageCapPct: 5 })).toThrow();
    expect(() => calculateWastage({ targetQty: 1, stdFabricYards: 0, actualFabricYds: 1, wastageCapPct: 5 })).toThrow();
    expect(() => calculateWastage({ targetQty: 1, stdFabricYards: 1, actualFabricYds: -1, wastageCapPct: 5 })).toThrow();
  });
});
