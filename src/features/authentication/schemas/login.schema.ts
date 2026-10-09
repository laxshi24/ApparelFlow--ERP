import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .pipe(z.email({ error: "Enter a valid email address" })),
  password: z.string({ error: "Password is required" }).min(1, "Password is required").max(200, "Password is too long"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Accepts only same-site absolute paths to prevent open redirects after login. */
export function safeRedirectPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/api")) return null;
  return next.length <= 512 ? next : null;
}
