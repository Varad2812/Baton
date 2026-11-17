import { expect, test } from "@playwright/test";

// Two judges at once: each gets a private copy; one judge's changes and resets never reach the other.
test("two visitors are isolated; Reset demo resets only your own copy", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  for (const [ctx, p] of [[a, pa], [b, pb]] as const) {
    await ctx.addCookies([{ name: "baton_persona", value: "rao", url: process.env.JUDGE_BASE_URL ?? "http://localhost:3200" }]);
    await p.goto("/p/festflow/conflicts");
    await p.locator("main h1").first().waitFor({ timeout: 90_000 });
  }
  const slugA = new URL(pa.url()).pathname.split("/")[2];
  const slugB = new URL(pb.url()).pathname.split("/")[2];
  expect(slugA).not.toBe(slugB);

  await pa.locator("#cf_payment").getByRole("button", { name: "Pick A" }).click();
  await expect(pa.locator("li#cf_payment")).toContainText("Payment gateway: Razorpay");
  await pb.reload();
  await expect(pb.locator("#cf_payment").getByRole("button", { name: "Pick A" })).toBeVisible();
  expect((await pb.request.get(`/p/${slugA}`)).status()).toBe(404);

  expect((await pb.request.post("/api/demo/reset")).ok()).toBeTruthy();
  await pa.reload();
  await expect(pa.locator("li#cf_payment")).toContainText("Payment gateway: Razorpay");
  await a.close();
  await b.close();
});
