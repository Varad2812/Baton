import { expect, test } from "@playwright/test";
import { PAGES } from "./helpers";

// 390 px phone: every page fits the width and the menu opens the navigation.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("390px: no horizontal scroll on any page; the menu reaches every page", async ({ page }) => {
  for (const path of ["/", "/new", "/status"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(1);
  }
  await page.goto("/p/festflow");
  await page.locator("main h1").first().waitFor({ timeout: 90_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];
  for (const p of PAGES) {
    await page.goto(`/p/${slug}${p}`);
    await page.locator("main h1").first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), p).toBeLessThanOrEqual(1);
  }
  await page.locator('[data-shell="menu"]').click();
  await expect(page.locator('[data-shell="menu-overlay"]').getByRole("link", { name: "Ask the handover" })).toBeVisible();
});
