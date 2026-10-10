"use client";

import type { ApiErrorBody, ErrorCode, FieldIssue } from "@shared/errors";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK_ERROR",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  /** Field-level validation messages keyed by path, for inline form errors. */
  fieldErrors(): Record<string, string> {
    const issues = (this.details as { issues?: FieldIssue[] } | undefined)?.issues ?? [];
    return Object.fromEntries(issues.map((i) => [i.path, i.message]));
  }
}

/** Same-origin JSON fetch. Throws ApiClientError with the server's error code/message on failure. */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiClientError(0, "NETWORK_ERROR", "Network error — check your connection and try again.");
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error page (e.g. platform 502); fall through to a generic message.
  }
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }
  return data as T;
}
