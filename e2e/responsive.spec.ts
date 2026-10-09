import { expect, test } from "@playwright/test";
import { expectNoA11yViolations, signInAs } from "./helpers";

/** Runs on the mobile project as well as desktop: no horizontal page overflow, no a11y violations. */
const pages = [
  { role: "supervisor", path: "/orders" },
  { role: "supervisor", path: "/orders/new" },
  { role: "supervisor", path: "/recipes" },
  { role: "supervisor", path: "/audit" },
  { role: "verifier", path: "/verification" },
  { role: "sewing", path: "/sewing" },
] as const;

for (const { role, path } of pages) {
  test(`${path} as ${role} fits the viewport and passes axe`, async ({ page }) => {
    await signInAs(page, role);
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoA11yViolations(page);
  });
}

test("login page fits the viewport and passes axe", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Demo accounts for evaluators" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await expectNoA11yViolations(page);
});
