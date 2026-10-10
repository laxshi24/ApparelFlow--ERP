import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { login, logout, me } from "@/features/authentication/server/auth.handlers";
import { MAX_FAILED_LOGINS } from "@/features/authentication/server/login";
import { db } from "@/lib/database/client";
import { sessions, users } from "@/lib/database/schema";
import { resetTransactionalData } from "@/test/db";
import { call, loginAs, seedUser } from "@/test/http";

beforeEach(resetTransactionalData);

describe("POST /api/auth/login", () => {
  it.each(["cutting_supervisor", "cutting_verifier", "sewing_supervisor"] as const)(
    "logs %s in with the role stored in the database",
    async (role) => {
      const { status, body, response } = await call(login, "POST", "/api/auth/login", {
        body: { email: seedUser(role).email, password: seedUser(role).password },
      });
      expect(status).toBe(200);
      expect(body.user.role).toBe(role);
      expect(body.user).not.toHaveProperty("passwordHash");
      const cookie = response.headers.get("set-cookie") ?? "";
      expect(cookie).toMatch(/^af_session=[\w-]{40,};/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).toMatch(/Path=\//);
    },
  );

  it("ignores privilege fields in the request body", async () => {
    const { body } = await call(login, "POST", "/api/auth/login", {
      body: { email: seedUser("sewing_supervisor").email, password: seedUser("sewing_supervisor").password, role: "cutting_verifier" },
    });
    expect(body.user.role).toBe("sewing_supervisor");
  });

  it("normalises email case and whitespace", async () => {
    const { status } = await call(login, "POST", "/api/auth/login", {
      body: { email: `  ${seedUser("cutting_verifier").email.toUpperCase()} `, password: seedUser("cutting_verifier").password },
    });
    expect(status).toBe(200);
  });

  it("returns the same 401 for a wrong password and an unknown email", async () => {
    const wrong = await call(login, "POST", "/api/auth/login", {
      body: { email: seedUser("cutting_verifier").email, password: "wrong-password" },
    });
    const unknown = await call(login, "POST", "/api/auth/login", {
      body: { email: "nobody@apparelflow.demo", password: "wrong-password" },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects malformed input with 400", async () => {
    const { status, body } = await call(login, "POST", "/api/auth/login", { body: { email: "not-an-email" } });
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const bad = await call(login, "POST", "/api/auth/login", { rawBody: "{not json" });
    expect(bad.status).toBe(400);
  });

  it("rejects cross-site login attempts (CSRF)", async () => {
    const { status, body } = await call(login, "POST", "/api/auth/login", {
      body: { email: seedUser("cutting_verifier").email, password: seedUser("cutting_verifier").password },
      headers: { origin: "https://evil.example" },
    });
    expect(status).toBe(403);
    expect(body.error.code).toBe("CSRF_REJECTED");
  });

  it(`throttles after ${MAX_FAILED_LOGINS} failed attempts`, async () => {
    const email = seedUser("cutting_supervisor").email;
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await call(login, "POST", "/api/auth/login", { body: { email, password: "nope" } });
    }
    const { status } = await call(login, "POST", "/api/auth/login", { body: { email, password: seedUser("cutting_supervisor").password } });
    expect(status).toBe(429);
  });
});

describe("session lifecycle", () => {
  it("resolves the current user from a valid session", async () => {
    const cookie = await loginAs("cutting_verifier");
    const { status, body } = await call(me, "GET", "/api/auth/me", { cookie });
    expect(status).toBe(200);
    expect(body.user.email).toBe(seedUser("cutting_verifier").email);
  });

  it("rejects requests without a session, or with a forged token", async () => {
    expect((await call(me, "GET", "/api/auth/me")).status).toBe(401);
    expect((await call(me, "GET", "/api/auth/me", { cookie: "af_session=forged-token-value" })).status).toBe(401);
  });

  it("logout revokes the session server-side", async () => {
    const cookie = await loginAs("cutting_supervisor");
    const out = await call(logout, "POST", "/api/auth/logout", { cookie });
    expect(out.status).toBe(200);
    expect(out.response.headers.get("set-cookie")).toMatch(/af_session=;/);
    expect((await call(me, "GET", "/api/auth/me", { cookie })).status).toBe(401);
  });

  it("rejects expired sessions", async () => {
    const cookie = await loginAs("sewing_supervisor");
    const [u] = await db().select().from(users).where(eq(users.email, seedUser("sewing_supervisor").email));
    await db().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, u.id));
    expect((await call(me, "GET", "/api/auth/me", { cookie })).status).toBe(401);
  });

  it("stores only a hash of the session token", async () => {
    const cookie = await loginAs("cutting_verifier");
    const token = cookie.split("=")[1];
    const rows = await db().select({ id: sessions.id }).from(sessions);
    expect(rows.some((r) => r.id === token)).toBe(false);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.id))).toBe(true);
  });
});
