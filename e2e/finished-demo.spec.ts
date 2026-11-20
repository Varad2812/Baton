import { expect, test } from "@playwright/test";

test("a successor compares payment receipts and searches the approved evidence on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/handover");
  await page.getByText("Compare the payment evidence", { exact: true }).click();
  const comparison = page.locator("details[open]").first();
  await expect(comparison.locator("blockquote")).toHaveCount(2);
  await expect(comparison).toContainText("Meeting notes 02-Apr");
  await expect(comparison).toContainText("PhonePe trial creds");
  const search = page.getByRole("searchbox");
  await search.fill("lower setup fee");
  await expect(page.getByRole("heading", { name: "Payment gateway: Razorpay (decided 2 Apr)" })).toBeVisible();
  await search.fill("xyz-no-such-receipt");
  await expect(page.getByRole("status").filter({hasText:"No matching facts"})).toBeVisible();
  await page.getByRole("button", { name:"Clear search" }).click();
  await expect(search).toBeFocused();
  await expect(page.getByRole("heading", { name: "Decisions", exact:true })).toBeVisible();
});
