import { expect, test } from "@playwright/test";
import { as, FESTFLOW, go, n, P, resetDemo } from "./helpers";

// A2: Knowledge-at-risk radar + continuous handover on the sample project:
// approve v1 -> Simulate new activity (owner) -> "v1 is out of date" banner -> Draft v2 shows only the
// changes -> approve v2 -> the successor sees "What changed since v1" and a "v2 new" badge.
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetDemo(request);
});

test("radar: towers, findings with actions, every person scored", async ({ page, context }) => {
  await as(context, "meera");
  await go(page, `${P}/radar`);
  await expect(page.getByTestId("radar-3d")).toBeVisible();
  const items = page.getByTestId("risk-items");
  await expect(items.locator('[data-risk-item="single_owner"]').first()).toContainText("email-templates");
  await go(page, `${P}/radar?tab=people`);
  const people = page.getByTestId("people-concentration");
  for (const name of ["Meera Kulkarni", "Arjun Mehta", "Kabir Shah"]) await expect(people.locator(`[data-person="${name}"]`)).toBeVisible();
  await go(page, `${P}/radar`);

  // "Ask Meera to document email-templates" becomes an interview question, once.
  const before = await n(`SELECT count(*) FROM "GapQuestion" WHERE "projectId"=${FESTFLOW} AND kind='SINGLE_OWNER' AND question ILIKE '%email-templates%'`);
  const btn = items.locator('[data-risk-item="single_owner"]').first().getByRole("button");
  await btn.click();
  await expect(page.getByText(/Added to the questions for Meera|Already in the questions/)).toBeVisible();
  await btn.click();
  await expect.poll(() => n(`SELECT count(*) FROM "GapQuestion" WHERE "projectId"=${FESTFLOW} AND kind='SINGLE_OWNER' AND question ILIKE '%email-templates%'`)).toBe(Math.max(before, 1));
});

test("simulate -> out-of-date banner -> Draft v2 shows only changes -> approve v2 -> successor sees what changed", async ({ page, context }) => {
  await as(context, "rao");
  expect((await page.request.post(`/api/projects/festflow/handover/approve`, { data: { override: true, note: "QA: approve v1 before new activity." } })).ok()).toBeTruthy();

  // Observers and successors cannot inject activity (button disabled, server refuses).
  await as(context, "arjun");
  await go(page, `${P}/sources?tab=current`);
  await expect(page.locator("[data-simulate]")).toBeDisabled();

  await as(context, "meera");
  await go(page, `${P}/sources?tab=current`);
  await page.locator("[data-simulate]").click();
  await expect(page.getByText(/Simulated activity ingested: 9 new items, 5 new facts/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-simulate]")).toBeDisabled();
  expect(await n(`SELECT count(*) FROM "Source" WHERE "projectId"=${FESTFLOW} AND "externalId" LIKE 'sim:%'`)).toBe(3);

  await go(page, P);
  const banner = page.getByTestId("changes-banner");
  await expect(banner).toContainText("v1 is out of date: 5 new facts, 1 contradiction, 5 outdated facts, 1 newly confirmed");

  await as(context, "rao");
  await go(page, P);
  await page.getByTestId("changes-banner").locator("[data-draft-next]").click();
  await expect(page).toHaveURL(/review\?changes=1/);
  const only = page.getByTestId("changes-only");
  await expect(only).toContainText("Draft v2: changes since v1");
  await expect(only).toContainText("Regular pass costs ₹349 after early-bird");
  await expect(only).toContainText("Registrations extended to 5 May");

  expect((await page.request.post(`/api/projects/festflow/handover/approve`, { data: { override: true, note: "QA: price conflict goes to the treasurer." } })).ok()).toBeTruthy();

  await as(context, "arjun");
  await go(page, P);
  await expect(page.getByTestId("new-version-badge")).toHaveText("v2 new");
  await go(page, `${P}/handover`);
  const what = page.getByTestId("what-changed");
  await expect(what).toContainText("What changed since v1");
  await expect(what).toContainText("Fest on-call rota");
  await go(page, P);
  await expect(page.getByTestId("new-version-badge")).toHaveCount(0);
});
