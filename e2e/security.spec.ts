import { expect, test } from "@playwright/test";
import { SEED_USERS } from "../backend/db/seed";
import { E2E_PASSWORDS } from "./credentials";
import { expectNoA11yViolations, signInAs } from "./helpers";

test("anonymous visitors are redirected to sign in and APIs return 401", async ({ page, request }) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders/);
  await expectNoA11yViolations(page);
  expect((await request.get("/api/orders")).status()).toBe(401);
  expect((await request.get("/api/sewing")).status()).toBe(401);
});

test("role navigation only shows permitted areas, and direct URLs are denied", async ({ page }) => {
  await signInAs(page, "sewing");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Sewing Queue", "Recipes"]);
  for (const path of ["/verification", "/orders", "/orders/new", "/audit"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Access denied (403)" })).toBeVisible();
  }

  await signInAs(page, "supervisor");
  await page.goto("/sewing");
  await expect(page.getByRole("heading", { name: "Access denied (403)" })).toBeVisible();
});

test("a non-verifier gets 403 from the approval API even with a forged body", async ({ page }) => {
  await signInAs(page, "supervisor");
  const recipes = await (await page.request.get("/api/recipes")).json();
  const created = await page.request.post("/api/orders", {
    data: { recipeId: recipes.recipes[0].id, targetQty: 5, fabricRollId: "E2E-SEC", actualFabricYds: 9, idempotencyKey: crypto.randomUUID() },
  });
  expect(created.status()).toBe(201);
  const { order } = await created.json();

  const res = await page.request.post(`/api/verification/${order.id}/approve`, {
    data: { role: "cutting_verifier", verifierId: "x", status: "VERIFIED" },
  });
  expect(res.status()).toBe(403);

  const crossSite = await page.request.post(`/api/verification/${order.id}/approve`, { headers: { origin: "https://evil.example" } });
  expect(crossSite.status()).toBe(403);
});

test("sign-in and sign-out update the page immediately, without a manual refresh", async ({ page }) => {
  const [supervisor, verifier] = ["cutting_supervisor", "cutting_verifier"] as const;
  const email = (role: string) => SEED_USERS.find((u) => u.role === role)!.email;
  const banner = page.getByRole("banner");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email(supervisor));
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();

  await page.getByLabel("Password").fill(E2E_PASSWORDS[supervisor]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(banner.getByText("Nimal Perera")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(banner).toBeHidden();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  // Same tab, no reload: a different user must see their own role, not the cached previous session.
  await page.getByLabel("Email").fill(email(verifier));
  await page.getByLabel("Password").fill(E2E_PASSWORDS[verifier]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/verification$/);
  await expect(banner.getByText("Kavindi Silva")).toBeVisible();
  await expect(banner.getByText("Nimal Perera")).toHaveCount(0);

  // After sign-out, protected pages are no longer reachable from history.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login/);
});

test("session cookie is HttpOnly and SameSite=Lax", async ({ page }) => {
  await signInAs(page, "verifier");
  const cookie = (await page.context().cookies()).find((c) => c.name === "af_session");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("af_session");
});
