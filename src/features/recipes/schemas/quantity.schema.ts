import { z } from "zod";
import { MAX_TARGET_QTY } from "@/domain/quantities";

/** Target batch quantity: a positive whole number of garments. Shared by the calculator and order creation. */
export const targetQtySchema = z
  .number({ error: "Target quantity must be a number" })
  .int({ error: "Target quantity must be a whole number" })
  .min(1, { error: "Target quantity must be at least 1" })
  .max(MAX_TARGET_QTY, { error: `Target quantity cannot exceed ${MAX_TARGET_QTY.toLocaleString("en-US")}` });

/** Query-string form, e.g. ?qty=50. Rejects "1.5", "-3", "1e3", "abc" and blanks. */
export const targetQtyQuerySchema = z.object({
  qty: z
    .string({ error: "qty is required" })
    .trim()
    .regex(/^\d{1,9}$/, { error: "Target quantity must be a whole number" })
    .transform(Number)
    .pipe(targetQtySchema),
});
