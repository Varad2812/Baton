import { expect, test } from "@playwright/test";
import { as, go, P, resetDemo, watch, type Persona } from "./helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => {
  await resetDemo(request);
});

const PAGES = ["", "/sources", "/ledger", "/ledger?claim=clm_auth_supabase", "/conflicts", "/interview", "/review", "/handover", "/handover/receipt", "/trust"];

test("no console errors and no 4xx/5xx on any page for any persona", async ({ page, context }) => {
  const problems = watch(page);
  const visited: string[] = [];
  for (const key of ["meera", "rao", "arjun", "kabir"] as Persona[]) {
    await as(context, key);
    for (const path of ["/", "/new", ...PAGES.map((p) => `${P}${p}`)]) {
      const res = await page.goto(path, { waitUntil: "load" });
      expect(res?.status(), `${key} ${path}`).toBeLessThan(400);
      if (path.startsWith(P)) await page.locator("main h1").first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(400);
      await expect(page.getByText("Application error"), `${key} ${path}`).toHaveCount(0);
      await expect(page.getByText(/something went wrong/i), `${key} ${path}`).toHaveCount(0);
      visited.push(`${key} ${path}`);
    }
  }
  // An unknown project is a clean 404, not a crash.
  const nf = await page.goto("/p/does-not-exist");
  expect(nf?.status()).toBe(404);
  const own = problems.filter((p) => !/\/p\/does-not-exist/.test(p) && !/Failed to load resource: the server responded with a status of 404/.test(p));
  expect(own, `problems after ${visited.length} page loads`).toEqual([]);
  await as(context, "meera");
});

test("390px mobile width: no horizontal scroll on landing and dashboard", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const path of ["/", P, `${P}/ledger`, "/new"]) {
    await page.goto(path);
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
    expect(m.sw, `scrollWidth on ${path}`).toBeLessThanOrEqual(m.iw);
    expect(m.bw, `body scrollWidth on ${path}`).toBeLessThanOrEqual(m.iw);
  }
  await ctx.close();
});

const TARGETS = ["kpis", "ledger-claim", "conflict-payment", "interview", "approve", "hidden-claim", "leakage"];

test("tour: all 7 steps highlight a real target", async ({ page, request }) => {
  await resetDemo(request);
  await page.goto(`${P}?tour=1`);
  const root = page.locator("[data-tour-root]");
  for (const [i, target] of TARGETS.entries()) {
    await expect(root).toHaveAttribute("data-step", String(i + 1), { timeout: 30_000 });
    await expect(root, `step ${i + 1} anchored`).toHaveAttribute("data-state", "anchored", { timeout: 30_000 });
    const el = page.locator(`[data-tour="${target}"]`).first();
    await expect(el).toBeVisible();
    // The highlighted rectangle sits on the target.
    const box = await el.boundingBox();
    expect(box && box.width > 0 && box.height > 0, `${target} has a real box`).toBe(true);
    const next = page.getByRole("button", { name: i === TARGETS.length - 1 ? "Finish" : "Next" });
    await expect(next).toBeEnabled({ timeout: 30_000 });
    await next.click();
  }
  await expect(root).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("baton.tour.v1"))).toContain("completed");
  await resetDemo(request);
});
