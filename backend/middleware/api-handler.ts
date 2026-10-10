import "server-only";
import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import { AppError, type ApiErrorBody } from "@shared/errors";
import { logger, serializeError } from "@backend/utils/logger";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence for cookie-authenticated mutations (in addition to SameSite=Lax cookies):
 * browsers always send `Origin` on cross-site POST/PUT/PATCH/DELETE; it must match our host.
 * Non-browser clients that send neither Origin nor Sec-Fetch-Site carry no ambient credentials.
 */
export function isCrossSiteRequest(request: Request): boolean {
  if (!UNSAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return true;
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export function errorResponse(err: AppError, requestId?: string): Response {
  const body: ApiErrorBody = {
    error: { code: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) },
  };
  return Response.json(body, { status: err.status, headers: requestId ? { "x-request-id": requestId } : undefined });
}

/** PostgreSQL SQLSTATE of a (possibly Drizzle-wrapped) driver error. */
function pgErrorCode(err: unknown): string | undefined {
  for (let e: unknown = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

/**
 * Database integrity rules are the last line of defence. If application checks were ever
 * bypassed, the constraint/trigger rejection is surfaced as a client error instead of a 500.
 */
function mapDatabaseError(err: unknown): AppError | null {
  switch (pgErrorCode(err)) {
    case "23505":
      return new AppError(409, "CONFLICT", "This change conflicts with an existing record (it may already have been processed)");
    case "23514":
    case "42501":
      return new AppError(422, "BUSINESS_RULE_VIOLATION", "This change violates a data integrity rule and was not applied");
    case "40001":
    case "40P01":
      return new AppError(409, "CONFLICT", "A concurrent update was detected; please retry");
    default:
      return null;
  }
}

type Handler<C> = (request: NextRequest, context: C) => Promise<Response>;

/** Wraps a Route Handler with CSRF checks, consistent error responses and structured logging. */
export function apiHandler<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    const requestId = randomUUID();
    if (isCrossSiteRequest(request)) {
      logger.warn("csrf.rejected", { requestId, method: request.method, path: request.nextUrl?.pathname });
      return errorResponse(new AppError(403, "CSRF_REJECTED", "Cross-site request rejected"), requestId);
    }
    try {
      const response = await handler(request, context);
      response.headers.set("x-request-id", requestId);
      response.headers.set("cache-control", "no-store");
      return response;
    } catch (err) {
      // Next.js signals (prerender bail-out on request.cookies, redirect, notFound) are control flow,
      // not failures: swallowing them would turn a dynamic route into a logged/prerendered 500.
      unstable_rethrow(err);
      if (err instanceof AppError) {
        if (err.status >= 500) logger.error("api.error", { requestId, ...serializeError(err) });
        return errorResponse(err, requestId);
      }
      const dbError = mapDatabaseError(err);
      if (dbError) {
        logger.warn("api.database_integrity_rejection", { requestId, pgCode: pgErrorCode(err), ...serializeError(err) });
        return errorResponse(dbError, requestId);
      }
      logger.error("api.unhandled_error", {
        requestId,
        method: request.method,
        path: request.nextUrl?.pathname,
        ...serializeError(err),
      });
      // Never leak internals (SQL, stack traces) to the client.
      return errorResponse(new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred"), requestId);
    }
  };
}
