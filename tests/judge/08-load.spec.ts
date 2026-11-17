import { expect, test } from "@playwright/test";
import { PAGES } from "./helpers";

// Small load check: 20 concurrent page requests (one visitor's copy) all succeed.
test("20 concurrent requests to the main pages succeed", async ({ page }) => {
  await page.goto("/p/festflow");
  await page.locator("main h1").first().waitFor({ timeout: 90_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];
  const paths = Array.from({ length: 20 }, (_, i) => (i < 2 ? ["/", "/api/health"][i] : `/p/${slug}${PAGES[i % PAGES.length]}`));
  const t0 = Date.now();
  const res = await Promise.all(paths.map((p) => page.request.get(p, { timeout: 120_000 })));
  const ms = Date.now() - t0;
  const bad = res.map((r, i) => [paths[i], r.status()] as const).filter(([, s]) => s >= 400);
  expect(bad).toEqual([]);
  console.log(`20 concurrent requests in ${ms} ms`);
});
