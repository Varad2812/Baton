import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { asPersona, PAGES } from "./helpers";

// Accessibility: axe finds no serious or critical violations on the landing page, /new and every project page.
test("axe: zero serious or critical violations", async ({ page, context }) => {
  await asPersona(context, "rao");
  await page.goto("/p/festflow");
  await page.locator("main h1").first().waitFor({ timeout: 90_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];
  const report: string[] = [];
  for (const path of ["/", "/new", ...PAGES.map((p) => `/p/${slug}${p}`)]) {
    await page.goto(path);
    await page.locator("h1").first().waitFor();
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).exclude("canvas").analyze();
    for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
      report.push(`${path}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
    }
  }
  expect(report).toEqual([]);
});
