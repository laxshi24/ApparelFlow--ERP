import { z } from "zod";

export const MAX_COUNT = 10_000_000;

/** A physical count: whole number ≥ 0, or null to clear an entry (uncounted). Never coerced from strings. */
export const actualQtySchema = z
  .number({ error: "Count must be a number" })
  .int({ error: "Count must be a whole number" })
  .min(0, { error: "Count cannot be negative" })
  .max(MAX_COUNT, { error: "Count is unrealistically large" })
  .nullable();

export const countEntriesSchema = z
  .array(z.object({ itemId: z.uuid({ error: "Invalid item id" }), actualQty: actualQtySchema }), {
    error: "counts must be a list",
  })
  .min(1, { error: "Provide at least one count" })
  .max(200)
  .refine((entries) => new Set(entries.map((e) => e.itemId)).size === entries.length, {
    error: "Each component may appear only once",
  });

export type CountEntry = z.infer<typeof countEntriesSchema>[number];

export const saveCountsSchema = z.object({ counts: countEntriesSchema });

/**
 * Approval input. Only `counts` (optional: saves on-screen counts atomically with the decision)
 * is read. verifierId, timestamp, status, decision… in the body are ignored.
 */
export const approveSchema = z.object({ counts: countEntriesSchema.optional() });

export const REJECTION_REASON_MIN = 5;
export const REJECTION_REASON_MAX = 1000;

export const rejectSchema = z.object({
  reason: z
    .string({ error: "A rejection reason is required" })
    .trim()
    .min(REJECTION_REASON_MIN, { error: `Rejection reason must be at least ${REJECTION_REASON_MIN} characters` })
    .max(REJECTION_REASON_MAX, { error: `Rejection reason must be ${REJECTION_REASON_MAX} characters or fewer` }),
  counts: countEntriesSchema.optional(),
});
