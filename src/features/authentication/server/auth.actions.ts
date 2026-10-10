"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_HOME } from "@/lib/auth/permissions";
import { createSession, revokeSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { logger, serializeError } from "@/lib/logger";
import { firstIssuePerField } from "@/lib/validation";
import { loginSchema, safeRedirectPath } from "../schemas/login.schema";
import { authenticate } from "./login";

export type LoginState = { error?: string; fieldErrors?: Record<string, string>; email?: string };

/**
 * Sign-in as a Server Action. Setting the cookie here (rather than from a fetch + client
 * navigation) lets Next.js return the signed-in UI in the same round trip and discard any
 * client-cached pages from the signed-out session — no manual refresh needed.
 * Server Actions are POST-only and Origin-checked by Next.js (CSRF protection).
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") ?? "" });
  if (!parsed.success) return { fieldErrors: firstIssuePerField(parsed.error.issues), email };

  let home: string;
  try {
    const user = await authenticate(parsed.data);
    const cookieStore = await cookies();
    await revokeSession(cookieStore.get(SESSION_COOKIE)?.value); // session fixation protection
    const { token, expiresAt } = await createSession(user.id);
    cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    home = ROLE_HOME[user.role];
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, email };
    logger.error("auth.login_action_failed", serializeError(err));
    return { error: "Sign-in failed. Please try again.", email };
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectPath(formData.get("next")) ?? home);
}

/** Sign-out: revoke the server session, clear the cookie, invalidate cached pages, go to /login. */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  await revokeSession(cookieStore.get(SESSION_COOKIE)?.value);
  cookieStore.delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/login");
}
