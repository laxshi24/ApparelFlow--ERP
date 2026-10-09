/**
 * Component multiplier: Expected Component Quantity = Target Batch Quantity × Pieces Per Garment.
 * Shared kernel used by the recipe calculator, order creation and re-cuts. Always evaluated
 * on the server from database recipe data — never from client-supplied expected counts.
 */
export const MAX_TARGET_QTY = 100_000;

export type ComponentDefinition = {
  id: string;
  componentName: string;
  piecesPerGarment: number;
};

export type ExpectedComponent = ComponentDefinition & { expectedQty: number };

export function isValidTargetQty(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_TARGET_QTY;
}

export function expectedComponentQuantities(
  targetQty: number,
  components: readonly ComponentDefinition[],
): ExpectedComponent[] {
  if (!isValidTargetQty(targetQty)) {
    throw new RangeError(`Target quantity must be a whole number between 1 and ${MAX_TARGET_QTY}`);
  }
  return components.map((c) => {
    if (!Number.isSafeInteger(c.piecesPerGarment) || c.piecesPerGarment < 1) {
      throw new RangeError(`Component ${c.componentName} has an invalid pieces-per-garment value`);
    }
    return { ...c, expectedQty: targetQty * c.piecesPerGarment };
  });
}
