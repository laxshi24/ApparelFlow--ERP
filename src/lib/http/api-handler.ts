import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { AppError, type ApiErrorBody } from "@/lib/errors";
import { logger, serializeError } from "@/lib/logger";

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
      if (err instanceof AppError) {
        if (err.status >= 500) logger.error("api.error", { requestId, ...serializeError(err) });
        return errorResponse(err, requestId);
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
