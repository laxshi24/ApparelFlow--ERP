import { z } from "zod";
import { fabricRollIdSchema, fabricYdsSchema } from "./order.schema";

/** Re-cut submission. Target quantity and recipe are fixed for the order; only fabric data and a note are supplied. */
export const recutSchema = z.object({
  fabricRollId: fabricRollIdSchema,
  actualFabricYds: fabricYdsSchema,
  note: z
    .string({ error: "Describe what was corrected" })
    .trim()
    .min(5, { error: "Describe what was corrected (at least 5 characters)" })
    .max(1000, { error: "Note must be 1000 characters or fewer" }),
});

export type RecutInput = z.infer<typeof recutSchema>;
