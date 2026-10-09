import { describe, expect, it } from "vitest";
import { expectedComponentQuantities, isValidTargetQty } from "@/domain/quantities";
import { SEED_RECIPES } from "@/lib/database/seed";

const withIds = (recipeIndex: number) =>
  SEED_RECIPES[recipeIndex].components.map((c, i) => ({ id: String(i), ...c }));

describe("component multiplier", () => {
  it("50 Casual Blouses → 50/50/100/50/100", () => {
    const result = expectedComponentQuantities(50, withIds(0));
    expect(result.map((r) => [r.componentName, r.expectedQty])).toEqual([
      ["Front Body Panel", 50],
      ["Back Body Panel", 50],
      ["Sleeves (left and right)", 100],
      ["Collar & Stand", 50],
      ["Sleeve Cuffs", 100],
    ]);
  });

  it("50 Crop Tops → 50/50/50/50/100", () => {
    const result = expectedComponentQuantities(50, withIds(1));
    expect(result.map((r) => [r.componentName, r.expectedQty])).toEqual([
      ["Front Chest Panel", 50],
      ["Back Support Panel", 50],
      ["Neck Binding Strip", 50],
      ["Hem Elastic Casing", 50],
      ["Side Strap Accents", 100],
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, 100_001])("rejects invalid target quantity %s", (qty) => {
    expect(isValidTargetQty(qty)).toBe(false);
    expect(() => expectedComponentQuantities(qty, withIds(0))).toThrow(RangeError);
  });

  it("rejects non-numeric targets", () => {
    expect(isValidTargetQty("50")).toBe(false);
    expect(isValidTargetQty(null)).toBe(false);
  });
});
