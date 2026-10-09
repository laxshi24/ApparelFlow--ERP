import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth/guards";
import { ROLE_HOME } from "@/lib/auth/permissions";
import { createSession, revokeSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { apiHandler } from "@/lib/http/api-handler";
import { parseOrThrow, readJson } from "@/lib/validation";
import { loginSchema } from "../schemas/login.schema";
import { authenticate } from "./login";

/** POST /api/auth/login — any role/privilege fields in the body are ignored; the role comes from the DB. */
export const login = apiHandler(async (request: NextRequest) => {
  const input = parseOrThrow(loginSchema, await readJson(request));
  const user = await authenticate(input);

  // Prevent session fixation: drop any session presented with this request.
  await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const { token, expiresAt } = await createSession(user.id);

  const response = NextResponse.json({ user, home: ROLE_HOME[user.role] });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return response;
});

/** POST /api/auth/logout — idempotent. */
export const logout = apiHandler(async (request: NextRequest) => {
  await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
  return response;
});

/** GET /api/auth/me */
export const me = apiHandler(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  return NextResponse.json({ user });
});
