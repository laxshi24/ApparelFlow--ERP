/**
 * Fabric wastage.
 *   Expected Fabric  = Target Quantity × Standard Fabric Yards Per Garment
 *   Wastage %        = ((Actual − Expected) / Expected) × 100, rounded half away from zero to 2 dp.
 *
 * Arithmetic is done in integer hundredths of a yard so that e.g. 50 × 1.8 is exactly 90.00.
 * A negative percentage means less fabric was used than the standard (a saving).
 * The recipe wastage cap is informational: exceeding it is flagged, never an approval block.
 */
export type WastageResult = {
  expectedFabricYds: number;
  actualFabricYds: number;
  wastagePct: number;
  exceedsCap: boolean;
};

const toHundredths = (yards: number) => Math.round(yards * 100);

export function calculateWastage(input: {
  targetQty: number;
  stdFabricYards: number;
  actualFabricYds: number;
  wastageCapPct: number;
}): WastageResult {
  const { targetQty, stdFabricYards, actualFabricYds, wastageCapPct } = input;
  if (!Number.isSafeInteger(targetQty) || targetQty < 1) throw new RangeError("Target quantity must be a positive integer");
  if (!Number.isFinite(stdFabricYards) || stdFabricYards <= 0) throw new RangeError("Standard fabric must be positive");
  if (!Number.isFinite(actualFabricYds) || actualFabricYds < 0) throw new RangeError("Actual fabric must be non-negative");

  const expected = targetQty * toHundredths(stdFabricYards);
  // Guarded above, but kept explicit: the denominator can never be zero.
  if (expected === 0) throw new RangeError("Expected fabric cannot be zero");
  const actual = toHundredths(actualFabricYds);

  // Percentage in hundredths of a percent, from ONE division of exact integers. IEEE division is
  // correctly rounded, so an exact half (e.g. -497.5) stays exact and rounds half away from zero.
  // (Dividing first and then multiplying by 100 double-rounds and mis-rounds values like -4.975%.)
  const scaled = ((actual - expected) * 10_000) / expected;
  const wastagePct = (Math.sign(scaled) * Math.round(Math.abs(scaled))) / 100 || 0;

  return {
    expectedFabricYds: expected / 100,
    actualFabricYds: actual / 100,
    wastagePct,
    exceedsCap: wastagePct > wastageCapPct,
  };
}
