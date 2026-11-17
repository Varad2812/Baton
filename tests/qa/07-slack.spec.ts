import { expect, test } from "@playwright/test";
import { as, FESTFLOW, go, n, P, resetDemo } from "./helpers";

// A3 Slack: the three entry points are on Sources; the FestFlow sample export goes through the one
// Slack importer (private channel -> Restricted), and Trust shows % Confirmed before/after Slack.
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetDemo(request);
});

test("sample Slack export: imported with mapped access, confirms facts, Trust shows before/after", async ({ page, context }) => {
  await as(context, "arjun");
  await go(page, `${P}/sources/add?method=slack`);
  const card = page.getByTestId("slack-connect");
  await expect(card.locator("[data-slack-demo]")).toBeDisabled();

  await as(context, "meera");
  await go(page, `${P}/sources/add?method=slack`);
  await expect(card.locator("[data-slack-demo]")).toBeVisible();
  await expect(card.locator("[data-slack-oauth]")).toBeVisible();
  await card.locator("[data-slack-sample]").click();
  await expect(page.getByText(/Slack export imported/)).toBeVisible({ timeout: 30_000 });
  expect(await n(`SELECT count(*) FROM "Source" WHERE "projectId"=${FESTFLOW} AND "externalId" LIKE 'slack:%' AND access='RESTRICTED'`)).toBe(1);
  expect(await n(`SELECT count(*) FROM "Source" WHERE "projectId"=${FESTFLOW} AND "externalId" LIKE 'slack:%' AND access='TEAM'`)).toBe(2);

  // A second upload of the same export adds nothing.
  const chunks = await n(`SELECT count(*) FROM "Chunk" c JOIN "Source" s ON s.id=c."sourceId" WHERE s."projectId"=${FESTFLOW}`);
  await card.locator("[data-slack-sample]").click();
  await expect(page.getByText(/nothing new|0 new messages/).first()).toBeVisible({ timeout: 30_000 });
  expect(await n(`SELECT count(*) FROM "Chunk" c JOIN "Source" s ON s.id=c."sourceId" WHERE s."projectId"=${FESTFLOW}`)).toBe(chunks);

  await go(page, `${P}/trust?tab=accuracy`);
  const impact = page.getByTestId("slack-impact");
  const before = Number((await impact.locator('[data-slack-stat="Before Slack"]').innerText()).replace("%", ""));
  const after = Number((await impact.locator('[data-slack-stat="After Slack"]').innerText()).replace("%", ""));
  expect(after).toBeGreaterThan(before);
});

test("bad Slack export upload gets a clear error", async ({ page, context }) => {
  await as(context, "meera");
  const res = await page.request.post(`/api/projects/festflow/sources/slack-export`, { multipart: { file: { name: "notes.zip", mimeType: "application/zip", buffer: Buffer.from("plain text") } } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/not a ZIP/);
  await as(context, "kabir");
  const denied = await page.request.post(`/api/projects/festflow/sources/slack-export`, { multipart: { file: { name: "x.zip", mimeType: "application/zip", buffer: Buffer.from("PK") } } });
  expect(denied.status()).toBe(403);
});
