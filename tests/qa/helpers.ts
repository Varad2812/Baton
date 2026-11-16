import "dotenv/config";
import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { DEMO_PROJECT } from "../visitor";

export const P = "/p/festflow";
export type Persona = "meera" | "rao" | "arjun" | "kabir";
export const NAMES: Record<Persona, string> = {
  meera: "Meera Kulkarni",
  rao: "Prof. S. Rao",
  arjun: "Arjun Mehta",
  kabir: "Kabir Shah",
};

export async function db<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return db(async (c) => (await c.query(sql, params)).rows as T[]);
}
export async function n(sql: string, params: unknown[] = []): Promise<number> {
  return Number(Object.values((await q(sql, params))[0] ?? { n: 0 })[0]);
}

/** Reset FestFlow through the public endpoint (rate limited 1 per 10 s). */
export async function resetDemo(request: APIRequestContext) {
  for (let i = 0; i < 10; i++) {
    const res = await request.post("/api/demo/reset");
    if (res.ok()) return;
    if (res.status() !== 429) throw new Error(`reset failed: HTTP ${res.status()} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, Number(res.headers()["retry-after"] ?? 5) * 1000 + 500));
  }
  throw new Error("reset kept returning 429");
}

/** Set the "Viewing as" cookie directly (same cookie the switcher writes). */
export async function as(context: BrowserContext, key: Persona, baseURL = process.env.QA_BASE_URL ?? "http://localhost:3000") {
  await context.addCookies([{ name: "baton_persona", value: key, url: baseURL }]);
}

/** Switch persona through the real "Viewing as" menu. */
export async function viewAs(page: Page, key: Persona) {
  const name = NAMES[key];
  const trigger = page.getByRole("button", { name: /^Viewing as/ });
  if ((await trigger.getAttribute("aria-label"))?.includes(name)) return;
  await trigger.click();
  await page.getByRole("menuitem", { name: new RegExp(name.replace(/\./g, "\\.")) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Viewing as ${name.replace(/\./g, "\\.")}`) })).toBeVisible();
}

/** The test visitor's private copy of the demo (see tests/visitor.ts). */
export const FESTFLOW = DEMO_PROJECT;
export { id, SFX, SLUG } from "../visitor";

/** Number in the sidebar badge next to a nav label. */
export async function sidebarCount(page: Page, label: string): Promise<number> {
  const link = page.locator('nav[aria-label="Project"] a', { hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
  const txt = (await link.innerText()).trim().match(/(\d+)$/);
  return Number(txt?.[1] ?? NaN);
}

/** Collect console errors and 4xx/5xx responses (ignoring favicons and aborted prefetches). */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (/favicon|Failed to load resource.*(404|401)\b.*(icon)/i.test(t)) return;
      problems.push(`console: ${t.slice(0, 300)}`);
    }
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return problems;
}

/** Navigate and wait for the page header (past the loading skeleton). */
export async function go(page: Page, path: string) {
  await page.goto(path);
  await page.locator("main h1").first().waitFor({ timeout: 30_000 });
}
