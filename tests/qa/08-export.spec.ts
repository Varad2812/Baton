import { expect, test } from "@playwright/test";
import { as, go, P, resetDemo } from "./helpers";

// B5: Markdown / JSON exports of each role's own view (with citations and links), never hidden content.
test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => resetDemo(request));

test("exports: Markdown and JSON with citations; observer export has no Team or Restricted text", async ({ page, context }) => {
  await as(context, "rao");
  expect((await page.request.post(`/api/projects/festflow/handover/approve`, { data: { override: true, note: "QA: approve to test exports." } })).ok()).toBeTruthy();

  await as(context, "arjun");
  const md = await page.request.get(`/api/projects/festflow/handover/export?format=md`);
  expect(md.ok()).toBeTruthy();
  expect(md.headers()["content-disposition"]).toContain("festflow-handover-incoming.md");
  const text = await md.text();
  expect(text).toContain("# FestFlow: handover Meera Kulkarni → Arjun Mehta");
  expect(text).toContain("Approved v1 by Prof. S. Rao");
  expect(text).toMatch(/## Sources\n\n1\. /);
  expect(text).not.toContain("CANARY-");

  const json = await (await page.request.get(`/api/projects/festflow/handover/export?format=json`)).json();
  expect(json.compiledFor.role).toBe("INCOMING");
  expect(json.citations.length).toBeGreaterThan(10);
  expect(json.sections.flatMap((s: { facts: { citations: number[] }[] }) => s.facts.flatMap((f) => f.citations)).every((n: number) => n >= 1 && n <= json.citations.length)).toBe(true);

  await as(context, "kabir");
  const obs = await (await page.request.get(`/api/projects/festflow/handover/export?format=md`)).text();
  expect(obs).not.toContain("Razorpay");
  expect(obs).not.toContain("CANARY-");
  expect(obs).toMatch(/facts hidden at this access level/);

  await as(context, "arjun");
  await go(page, `${P}/handover`);
  await page.locator("[data-share-menu]").click();
  await expect(page.locator('[data-export="md"]')).toBeVisible();
  await expect(page.locator("[data-share-link]")).toBeEnabled();
});
