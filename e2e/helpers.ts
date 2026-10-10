import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { SEED_USERS } from "../backend/db/seed";
import { E2E_PASSWORDS } from "./credentials";

export const ROLES = {
  supervisor: { label: "Cutting Supervisor", role: "cutting_supervisor" },
  verifier: { label: "Cutting Verifier", role: "cutting_verifier" },
  sewing: { label: "Sewing Supervisor", role: "sewing_supervisor" },
} as const;

/** Signs in through the real login form, exactly as a user would (no page refresh). */
export async function signInAs(page: Page, who: keyof typeof ROLES) {
  const { label, role } = ROLES[who];
  const email = SEED_USERS.find((u) => u.role === role)!.email;
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORDS[role]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await expect(page.getByRole("banner").getByText(label, { exact: true })).toBeVisible();
}

/** Fails on serious/critical WCAG 2.1 A/AA violations (including colour contrast). */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`)).toEqual([]);
}

export async function createOrderViaUi(page: Page, opts: { recipe: string; qty: string; roll: string; fabric: string }) {
  await page.goto("/orders/new");
  await page.getByLabel("Recipe").selectOption({ label: opts.recipe });
  await page.getByLabel(/Target batch quantity/).fill(opts.qty);
  await page.getByLabel("Fabric roll ID").fill(opts.roll);
  await page.getByLabel(/Actual fabric used/).fill(opts.fabric);
  await page.getByRole("button", { name: /Submit for verification/ }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?created=1/);
  const orderNo = (await page.locator("h1 .font-mono").textContent())!.trim();
  return { orderNo, url: page.url().split("?")[0] };
}
