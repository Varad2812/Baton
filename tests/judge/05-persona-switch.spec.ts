import { expect, test } from "@playwright/test";
import { asPersona, go, openDemo, viewAs } from "./helpers";

// Switching persona mid-flow: the UI and the server both follow the new role immediately.
test("persona switch mid-flow: approval closes for a successor; observer sees no Team facts", async ({ page, context }) => {
  const slug = await openDemo(page);
  await asPersona(context, "rao");
  await go(page, `/p/${slug}/review`);
  await page.locator('[data-tour="approve"]').click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await viewAs(page, /Arjun Mehta/);
  await expect(page.locator('[data-tour="approve"]')).toBeDisabled();
  expect((await page.request.post(`/api/projects/${slug}/handover/approve`, { data: { override: true, note: "should be refused by the server" } })).status()).toBe(403);

  await viewAs(page, /Kabir Shah/);
  await go(page, `/p/${slug}/ledger`);
  await expect(page.getByText(/hidden at your access level/).first()).toBeVisible();
  await expect(page.getByText("Payment gateway: Razorpay (decided 2 Apr)")).toHaveCount(0);
  const ans = await (await page.request.post(`/api/projects/${slug}/ask`, { data: { question: "Which payment gateway was chosen?" } })).text();
  expect(ans).not.toContain("Razorpay");
  expect(ans).not.toContain("CANARY-");
});
