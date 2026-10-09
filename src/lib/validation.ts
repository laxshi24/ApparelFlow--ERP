import type { z } from "zod";
import { ValidationError } from "@/lib/errors";

export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  return result.data;
}

/** Reads a JSON body, treating an empty body as `{}` and malformed JSON as a validation error. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError([{ path: "", message: "Request body must be valid JSON" }]);
  }
}
