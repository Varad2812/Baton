import { expect, type BrowserContext, type Page } from "@playwright/test";

export type Persona = "meera" | "rao" | "arjun" | "kabir";
export const BASE = process.env.JUDGE_BASE_URL ?? "http://localhost:3200";

/** Open the sample project as a brand-new visitor; returns this visitor's private slug. */
export async function openDemo(page: Page, path = ""): Promise<string> {
  await page.goto(`/p/festflow${path}`);
  await page.locator("main h1").first().waitFor({ timeout: 90_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];
  expect(slug).toMatch(/^festflow-[0-9a-f]{10}$/);
  return slug;
}

/** Switch persona the way a judge does: through the "Viewing as" menu. */
export async function viewAs(page: Page, name: RegExp) {
  await page.getByRole("button", { name: /^Viewing as/ }).click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Viewing as ${name.source}`) })).toBeVisible();
}

/** Same cookie the switcher sets (for API-only checks). */
export async function asPersona(context: BrowserContext, key: Persona) {
  await context.addCookies([{ name: "baton_persona", value: key, url: BASE }]);
}

export async function go(page: Page, path: string) {
  await page.goto(path);
  await page.locator("main h1").first().waitFor({ timeout: 90_000 });
}

/** Console errors, uncaught exceptions and 5xx responses on a page. */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource.*(4\d\d)/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`http ${r.status()} ${r.url()}`);
  });
  return problems;
}

export const PAGES = ["", "/sources", "/ledger", "/conflicts", "/interview", "/review", "/handover", "/ask", "/radar", "/trust"];
