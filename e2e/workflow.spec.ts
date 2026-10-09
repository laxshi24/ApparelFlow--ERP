import { expect, test } from "@playwright/test";
import { createOrderViaUi, expectNoA11yViolations, signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

test("cutting → verification → sewing: full gatekeeper workflow across three roles", async ({ page }) => {
  // 1. Cutting Supervisor creates a batch.
  await signInAs(page, "supervisor");
  const order = await createOrderViaUi(page, { recipe: "REC-BL01 — Casual Blouse", qty: "50", roll: "E2E-ROLL-1", fabric: "95" });
  await expect(page.getByText(`Order ${order.orderNo} created`)).toBeVisible();
  await expect(page.getByText("Pending verification").first()).toBeVisible();

  // 2. Sewing Supervisor cannot see it yet.
  await signInAs(page, "sewing");
  await page.goto("/sewing");
  await expect(page.getByText(order.orderNo)).toHaveCount(0);

  // 3. Verifier counts with a shortage: approval is blocked; then corrects and approves.
  await signInAs(page, "verifier");
  await page.goto("/verification");
  await page.getByRole("link", { name: `Verify ${order.orderNo}` }).click();
  const inputs = page.locator("tbody input");
  const expected = ["50", "50", "100", "50", "100"];
  for (const [i, value] of expected.entries()) await inputs.nth(i).fill(i === 2 ? "98" : value);
  await expect(page.getByText("RED · Shortage", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve for sewing/ })).toBeDisabled();
  await expect(page.getByText("Counts saved")).toBeVisible();

  // Counts persist across a reload (autosave).
  await page.reload();
  await expect(page.locator("tbody input").nth(2)).toHaveValue("98");

  await page.locator("tbody input").nth(2).fill("101");
  await expect(page.getByText("YELLOW · Surplus", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve for sewing/ })).toBeEnabled();
  await page.getByRole("button", { name: /Approve for sewing/ }).click();
  await expect(page.getByRole("dialog")).toContainText(`Approve ${order.orderNo}?`);
  await page.getByRole("button", { name: /Confirm approval/ }).click();
  await expect(page.getByText(`${order.orderNo} approved`)).toBeVisible();

  // 4. Sewing Supervisor sees it, inspects attribution and starts assembly.
  await signInAs(page, "sewing");
  await page.goto("/sewing");
  const row = page.getByRole("row", { name: new RegExp(order.orderNo) });
  await expect(row).toContainText("Kavindi Silva");
  await row.getByRole("button", { name: /Start sewing assembly/ }).click();
  await page.getByRole("button", { name: /Confirm start/ }).click();
  await expect(row).toContainText("Assembly in progress");

  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(order.orderNo) })).toContainText("Ruwan Fernando");
  await page.getByRole("link", { name: `Inspect ${order.orderNo}` }).click();
  await expect(page.getByText("Sewing assembly started")).toBeVisible();
  await expect(page.getByText("Approved — verified")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("rejection requires a reason, and a re-cut must be re-verified", async ({ page }) => {
  await signInAs(page, "supervisor");
  const order = await createOrderViaUi(page, { recipe: "REC-CT02 — Crop Top", qty: "20", roll: "E2E-ROLL-2", fabric: "22.5" });

  await signInAs(page, "verifier");
  await page.goto("/verification");
  await page.getByRole("link", { name: `Verify ${order.orderNo}` }).click();
  await page.getByRole("button", { name: /Reject batch/ }).click();
  await page.getByRole("button", { name: /Confirm rejection/ }).click();
  await expect(page.getByText(/rejection reason of at least 5 characters/)).toBeVisible();
  await page.getByLabel(/Rejection reason/).fill("Side strap accents missing for 4 garments");
  await page.getByRole("button", { name: /Confirm rejection/ }).click();
  await expect(page.getByText(`${order.orderNo} rejected`)).toBeVisible();

  await signInAs(page, "supervisor");
  await page.goto(order.url);
  await expect(page.getByText("Side strap accents missing for 4 garments").first()).toBeVisible();
  await page.getByLabel(/What was corrected/).fill("Cut 8 additional side straps");
  await page.getByRole("button", { name: /Submit re-cut for verification/ }).click();
  await page.getByRole("button", { name: /Confirm re-cut/ }).click();
  await expect(page.getByText("Pending verification").first()).toBeVisible();
  await expect(page.getByText("Attempt 1: Rejected")).toBeVisible();

  await signInAs(page, "verifier");
  await page.goto("/verification");
  const card = page.getByRole("listitem").filter({ hasText: order.orderNo });
  await expect(card).toContainText("Re-cut #1");
  await expect(card).toContainText("Counted 0 of 5");
  await card.getByRole("link").click();
  await expect(page.getByRole("button", { name: /Approve for sewing/ })).toBeDisabled();
  await expectNoA11yViolations(page);
});
