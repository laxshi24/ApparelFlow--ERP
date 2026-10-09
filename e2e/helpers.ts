import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const ROLES = {
  supervisor: "Cutting Supervisor",
  verifier: "Cutting Verifier",
  sewing: "Sewing Supervisor",
} as const;

/** Signs in through the evaluator demo panel (a real /api/auth/login request). */
export async function signInAs(page: Page, role: keyof typeof ROLES) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`Sign in as ${ROLES[role]}`) }).click();
  // The login page itself lists every role name, so wait for the redirect, then check the header's
  // role caption (the header's persona <select> also repeats role names in its options).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await expect(page.getByRole("banner").locator("p").filter({ hasText: new RegExp(`^${ROLES[role]}$`) })).toBeVisible();
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
