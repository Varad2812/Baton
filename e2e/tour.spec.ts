import { expect, test, type APIRequestContext } from "@playwright/test";

// The guided tour (landing "60-second tour" link = /p/festflow?tour=1): every one of the 7 steps
// must anchor to its [data-tour] target (never fall back to a centred popover), switching
// persona where the step needs it. Starts from a fresh demo so the targets exist.

async function resetDemo(request: APIRequestContext) {
  for (let i = 0; i < 8; i++) {
    const res = await request.post("/api/demo/reset");
    if (res.ok()) return;
    if (res.status() !== 429) throw new Error(`reset failed: HTTP ${res.status()}`);
    await new Promise((r) => setTimeout(r, Number(res.headers()["retry-after"] ?? 5) * 1000 + 500));
  }
}

const TARGETS = ["kpis", "ledger-claim", "conflict-payment", "interview", "approve", "hidden-claim", "ask-box", "simulate", "leakage"];

test("guided tour anchors all 9 steps", async ({ page, request }) => {
  await resetDemo(request);
  await page.goto("/p/festflow?tour=1");
  const root = page.locator("[data-tour-root]");
  for (const [i, target] of TARGETS.entries()) {
    await expect(root).toHaveAttribute("data-step", String(i + 1), { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-state", "anchored", { timeout: 30_000 });
    await expect(page.locator(`[data-tour="${target}"]`).first()).toBeVisible();
    await page.screenshot({ path: `test-results/tour-step-${i + 1}.png` });
    const next = page.getByRole("button", { name: i === TARGETS.length - 1 ? "Finish" : "Next" });
    await expect(next).toBeEnabled({ timeout: 30_000 });
    await next.click();
  }
  await expect(root).toHaveCount(0);
  const record = await page.evaluate(() => localStorage.getItem("baton.tour.v1"));
  expect(record).toContain("completed");

  // Help → Take the tour restarts it.
  await page.locator('[data-help-menu="topbar"]').click();
  await page.locator("[data-tour-button]").click();
  await expect(page.locator("[data-tour-root]")).toHaveAttribute("data-step", "1", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await resetDemo(request); // tour ends as Meera; leave the shared demo clean
});
