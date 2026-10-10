import { z } from "zod";
import { targetQtySchema } from "@shared/validation/quantity.schema";
import { ORDER_STATUSES } from "@shared/types";

export const MAX_FABRIC_YDS = 1_000_000;

const hasAtMostTwoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

export const fabricYdsSchema = z
  .number({ error: "Actual fabric used must be a number" })
  .finite({ error: "Actual fabric used must be a finite number" })
  .min(0, { error: "Actual fabric used cannot be negative" })
  .max(MAX_FABRIC_YDS, { error: "Actual fabric used is unrealistically large" })
  .refine(hasAtMostTwoDecimals, { error: "Use at most 2 decimal places" });

export const fabricRollIdSchema = z
  .string({ error: "Fabric roll ID is required" })
  .trim()
  .min(1, { error: "Fabric roll ID is required" })
  .max(64, { error: "Fabric roll ID must be 64 characters or fewer" })
  .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/ ]*$/, {
    error: "Use letters, numbers, spaces and . _ - / only",
  });

/**
 * Order creation input. Only these fields are read; anything else in the body
 * (status, createdBy, expected counts, order number…) is stripped and ignored.
 */
export const createOrderSchema = z.object({
  recipeId: z.uuid({ error: "Select a recipe" }),
  targetQty: targetQtySchema,
  fabricRollId: fabricRollIdSchema,
  actualFabricYds: fabricYdsSchema,
  idempotencyKey: z.uuid({ error: "A valid idempotency key is required" }),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const ORDER_PAGE_SIZE = 20;

export const listOrdersQuerySchema = z.object({
  q: z.string().trim().max(64).optional().catch(undefined),
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
