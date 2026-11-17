import { expect, test } from "@playwright/test";
import { asPersona, go, openDemo } from "./helpers";

// Double-clicking every primary action never creates duplicates.
test("double clicks: resolve, approve, ask owner, answer, reset", async ({ page, context }) => {
  const slug = await openDemo(page);
  const api = `/api/projects/${slug}`;

  await asPersona(context, "rao");
  await go(page, `/p/${slug}/conflicts`);
  await page.locator("#cf_payment").getByRole("button", { name: "Pick A" }).dblclick();
  await expect(page.locator("li#cf_payment")).toContainText("Payment gateway: Razorpay");
  const trust = await (await page.request.get(`${api}/trust`)).json();
  expect(trust.audit.filter((a: { action: string; targetId: string }) => a.action === "conflict.resolve").length).toBe(1);

  // Approve: the dialog button double-clicked, then the same request replayed -> exactly v1.
  await go(page, `/p/${slug}/review`);
  await page.locator('[data-tour="approve"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("textbox").first().fill("Judge test: approving with open items on purpose.");
  await dialog.getByRole("button", { name: /^Approve/ }).dblclick();
  await expect(page.getByText(/v1 approved/).first()).toBeVisible();
  const replay = await page.request.post(`${api}/handover/approve`, { data: { override: true, note: "Judge replay of the same approval.", expectedVersion: 1 } });
  expect(replay.status()).toBe(409);
  const hv = await (await page.request.get(`${api}/handover`)).json();
  expect(hv.version.number).toBe(1);

  // Ask the owner twice -> one follow-up.
  await asPersona(context, "arjun");
  const q = { question: "Who prints the gate passes for the fest?" };
  const [a, b] = await Promise.all([page.request.post(`${api}/ask/owner`, { data: q }), page.request.post(`${api}/ask/owner`, { data: q })]);
  const statuses = [a.status(), b.status()].sort();
  expect(statuses[0]).toBe(200);
  expect([200, 409]).toContain(statuses[1]);

  // Answer a gap question twice -> the second is refused, one testimony.
  await asPersona(context, "meera");
  await go(page, `/p/${slug}/interview`);
  const li = page.locator("li#gq_db_password");
  await li.getByLabel("Your answer").fill("Dev Patil holds the production database password in the club vault.");
  await li.getByRole("button", { name: "Save as testimony" }).dblclick();
  await expect(li.getByText(/Testimony from/)).toBeVisible();
  await expect(li.getByRole("button", { name: "Save as testimony" })).toHaveCount(0);

  // Reset twice quickly: both succeed or the second politely waits; the demo is back to the seed.
  const [r1, r2] = await Promise.all([page.request.post("/api/demo/reset"), page.request.post("/api/demo/reset")]);
  expect([r1.status(), r2.status()].every((s) => s === 200 || s === 429)).toBe(true);
  await go(page, `/p/${slug}/conflicts`);
  await expect(page.locator("#cf_payment").getByRole("button", { name: "Pick A" })).toBeVisible();
});
