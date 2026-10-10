import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { cache } from "react";
import { ForbiddenError, UnauthenticatedError } from "@shared/errors";
import { can, type Permission } from "@shared/permissions";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "@backend/services/auth/session.service";

/**
 * Route Handler guard: authenticates from the session cookie and checks the permission.
 * 401 when there is no valid session, 403 when the role lacks the permission.
 */
export async function requireApiUser(request: NextRequest, permission?: Permission): Promise<SessionUser> {
  const user = await validateSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new UnauthenticatedError();
  if (permission && !can(user.role, permission)) throw new ForbiddenError();
  return user;
}

/** Current user for Server Components, memoised per request. Must be called inside a <Suspense> boundary. */
export const getPageUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSessionToken(token);
});

/**
 * Page guard: redirects anonymous visitors to /login and reports whether the user holds the permission.
 * Pages render <AccessDenied/> when `allowed` is false — and every API they call re-checks independently.
 */
export async function requirePageUser(permission?: Permission): Promise<{ user: SessionUser; allowed: boolean }> {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return { user, allowed: permission ? can(user.role, permission) : true };
}
