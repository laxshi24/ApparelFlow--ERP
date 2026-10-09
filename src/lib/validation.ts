import type { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids that are not UUIDs can never exist: answer 404 without touching the database. */
export function parseId(id: string, resource = "Resource"): string {
  if (!UUID_RE.test(id)) throw new NotFoundError(`${resource} not found`);
  return id.toLowerCase();
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** First issue per top-level field — the most fundamental message (e.g. "required" before "format"). */
export function firstIssuePerField(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    result[key] ??= issue.message;
  }
  return result;
}

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
