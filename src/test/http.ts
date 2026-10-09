/**
 * HTTP-level helpers for integration tests: build real `NextRequest`s (cookies, Origin,
 * JSON body) and invoke the exported Route Handlers exactly as Next.js would.
 */
import { NextRequest } from "next/server";
import { login } from "@/features/authentication/server/auth.handlers";
import type { UserRole } from "@/lib/database/schema";
import { DEMO_USERS } from "@/lib/database/seed";
import { TEST_DEMO_PASSWORD } from "./constants";

export const BASE_URL = "http://localhost:3000";

type RequestOptions = { cookie?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> };

export function buildRequest(method: string, path: string, options: RequestOptions = {}): NextRequest {
  const headers = new Headers({ host: "localhost:3000", ...options.headers });
  if (method !== "GET" && !headers.has("origin")) headers.set("origin", BASE_URL);
  if (options.cookie) headers.set("cookie", options.cookie);
  let body: string | undefined;
  if (options.rawBody !== undefined) body = options.rawBody;
  else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }
  return new NextRequest(new URL(path, BASE_URL), { method, headers, body });
}

type Handler<P> = (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper returns arbitrary JSON bodies
export type CallResult = { status: number; body: any; response: Response };

export async function call<P = Record<string, never>>(
  handler: Handler<P>,
  method: string,
  path: string,
  options: RequestOptions & { params?: P } = {},
): Promise<CallResult> {
  const response = await handler(buildRequest(method, path, options), {
    params: Promise.resolve(options.params ?? ({} as P)),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, response };
}

export function demoUser(role: UserRole) {
  const user = DEMO_USERS.find((u) => u.role === role);
  if (!user) throw new Error(`No demo user for ${role}`);
  return user;
}

/** Logs in through the real login handler and returns the session cookie header value. */
export async function loginAs(role: UserRole): Promise<string> {
  const { status, response } = await call(login, "POST", "/api/auth/login", {
    body: { email: demoUser(role).email, password: TEST_DEMO_PASSWORD },
  });
  if (status !== 200) throw new Error(`Login as ${role} failed with ${status}`);
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}
