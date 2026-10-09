/**
 * Traffic-light engine for physical component counts.
 *   GREEN  actual = expected
 *   YELLOW actual > expected (surplus, approvable)
 *   RED    actual < expected (shortage, blocks approval)
 *   null   not yet counted — incomplete, never treated as zero or as verified.
 */
export type TrafficLight = "GREEN" | "YELLOW" | "RED";

export function classifyCount(expectedQty: number, actualQty: number | null): TrafficLight | null {
  if (actualQty === null) return null;
  if (actualQty === expectedQty) return "GREEN";
  return actualQty > expectedQty ? "YELLOW" : "RED";
}

export function isValidCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000;
}

export type CountedItem = {
  componentName: string;
  expectedQty: number;
  actualQty: number | null;
};

export type ApprovalAssessment = {
  eligible: boolean;
  missing: string[];
  shortages: { componentName: string; expectedQty: number; actualQty: number; shortBy: number }[];
  surpluses: { componentName: string; expectedQty: number; actualQty: number; overBy: number }[];
};

/** Pure approval eligibility check. The approval use case re-runs this inside a locked transaction. */
export function assessApproval(items: readonly CountedItem[]): ApprovalAssessment {
  const missing: string[] = [];
  const shortages: ApprovalAssessment["shortages"] = [];
  const surpluses: ApprovalAssessment["surpluses"] = [];
  for (const item of items) {
    const light = classifyCount(item.expectedQty, item.actualQty);
    if (light === null || item.actualQty === null) missing.push(item.componentName);
    else if (light === "RED")
      shortages.push({ ...item, actualQty: item.actualQty, shortBy: item.expectedQty - item.actualQty });
    else if (light === "YELLOW")
      surpluses.push({ ...item, actualQty: item.actualQty, overBy: item.actualQty - item.expectedQty });
  }
  return { eligible: items.length > 0 && missing.length === 0 && shortages.length === 0, missing, shortages, surpluses };
}
