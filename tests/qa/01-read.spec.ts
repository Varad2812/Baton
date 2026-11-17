import { expect, test } from "@playwright/test";
import { as, go, n, P, q, resetDemo, sidebarCount, SFX, FESTFLOW } from "./helpers";

const FF = FESTFLOW;

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => {
  await resetDemo(request);
});

test("landing: stats come from the DB; CTAs work", async ({ page }) => {
  const db = {
    sources: await n(`SELECT count(*) FROM "Source" WHERE "projectId" = ${FF}`),
    claims: await n(`SELECT count(*) FROM "Claim" WHERE "projectId" = ${FF} AND status <> 'REJECTED'`),
    verified: await n(`SELECT count(*) FROM "Claim" WHERE "projectId" = ${FF} AND status <> 'REJECTED' AND grade='VERIFIED'`),
    quotes: await n(`SELECT count(*) FROM "Evidence" e JOIN "Claim" c ON c.id=e."claimId" WHERE c."projectId" = ${FF} AND e."quoteValid"`),
  };
  await page.goto("/");
  const text = await page.locator("body").innerText();
  const grab = (label: string) => Number((text.match(new RegExp(`${label}\\s*\\n\\s*(\\d+)`)) ?? [])[1]);
  expect(grab("Sources"), "landing Sources").toBe(db.sources);
  expect(grab("Facts found"), "landing Facts found").toBe(db.claims);
  expect(text).toContain(`${db.quotes} evidence quotes`);
  expect(text).toContain(`${db.verified} facts`);
  expect(grab("Leaks")).toBe(0);

  await page.getByRole("link", { name: "See a finished handover" }).first().click();
  await expect(page).toHaveURL(/\/p\/festflow(-[0-9a-f]{10})?$/);
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByTestId("role-card")).toContainText("Your job");
  await page.goto("/");
  await page.getByRole("link", { name: "Try with your own files" }).first().click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByLabel("Project name")).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "60-second tour" }).first().click();
  await expect(page).toHaveURL(/tour=1/);
});

test("persona switch changes visible claims; observer sees fewer and hidden placeholders", async ({ page, context }) => {
  const total = await n(`SELECT count(*) FROM "Claim" WHERE "projectId" = ${FF}`);
  const pub = await n(`SELECT count(*) FROM "Claim" WHERE "projectId" = ${FF} AND access='PUBLIC'`);
  const seen: Record<string, number> = {};
  for (const key of ["meera", "rao", "arjun", "kabir"] as const) {
    await as(context, key);
    await go(page, `${P}/ledger`);
    const meta = await page.locator("main").innerText();
    const m = meta.match(/(\d+)\s+of\s+(\d+)\s+facts/);
    expect(m, `ledger meta for ${key}`).toBeTruthy();
    seen[key] = Number(m![2]);
  }
  expect(seen.meera).toBe(total);
  expect(seen.rao).toBe(total);
  expect(seen.arjun).toBeLessThan(total); // 2 RESTRICTED claims hidden without a grant
  expect(seen.kabir).toBeLessThan(seen.arjun);
  expect(seen.kabir).toBeGreaterThanOrEqual(pub);
  await expect(page.locator('[data-shell="sidebar"]')).toContainText("hidden at your access level");
  await expect(page.locator("main")).toContainText("hidden at observer access");
  const restricted = await q<{ id: string; title: string }>(`SELECT id, title FROM "Claim" WHERE access='RESTRICTED' AND "projectId" = ${FF} LIMIT 1`);
  await go(page, `${P}/ledger?claim=${restricted[0].id}`);
  await expect(page.getByText("1 fact hidden — request access from owner")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(restricted[0].title);
  await as(context, "meera");
});

test("ledger: filters change counts, drawer highlights the quote inside its chunk, contradicting evidence shown", async ({ page, context }) => {
  await as(context, "meera");
  await go(page, `${P}/ledger`);
  const countOf = async () => Number((await page.locator("main").innerText()).match(/(\d+)\s+of\s+\d+\s+facts/)![1]);
  const all = await countOf();
  const dbVerified = await n(`SELECT count(*) FROM "Claim" WHERE "projectId" = ${FF} AND grade='VERIFIED'`);
  await go(page, `${P}/ledger?grade=VERIFIED`);
  expect(await countOf()).toBe(dbVerified);
  await go(page, `${P}/ledger?grade=VERIFIED&type=DECISION`);
  const dbVD = await n(`SELECT count(*) FROM "Claim" WHERE "projectId" = ${FF} AND grade='VERIFIED' AND type='DECISION'`);
  expect(await countOf()).toBe(dbVD);
  expect(dbVD).toBeLessThan(dbVerified);
  expect(dbVerified).toBeLessThan(all);
  await go(page, `${P}/ledger?q=Supabase`);
  const sup = await countOf();
  expect(sup).toBeGreaterThan(0);
  expect(sup).toBeLessThan(all);

  // Clicking a filter in the rail changes the URL.
  await go(page, `${P}/ledger`);
  await page.getByRole("link", { name: /^Conflicting/ }).first().click();
  await expect(page).toHaveURL(/grade=CONFLICTING/);

  // Drawer: the quote is highlighted inside the full chunk.
  await go(page, `${P}/ledger?claim=clm_auth_supabase`);
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Why this grade");
  await expect(drawer.locator("mark").first()).toBeVisible();
  const quotes = (await q<{ quote: string }>(`SELECT quote FROM "Evidence" WHERE "claimId"='clm_auth_supabase${SFX}' AND "quoteValid"`)).map((r) =>
    r.quote.replace(/\s+/g, " ").trim().toLowerCase(),
  );
  const marks = (await drawer.locator("mark").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim().toLowerCase());
  expect(marks.length).toBeGreaterThan(0);
  for (const m of marks) expect(quotes.some((qq) => qq.includes(m) || m.includes(qq)), `highlight "${m.slice(0, 40)}" is a stored quote`).toBe(true);
  await expect(drawer).toContainText("exact match");

  // Contradicting claim + its evidence are shown for the payment conflict.
  const ids = await q<{ claimAId: string; claimBId: string }>(`SELECT "claimAId", "claimBId" FROM "Conflict" WHERE id='cf_payment${SFX}'`);
  await go(page, `${P}/ledger?claim=${ids[0].claimBId}`);
  const d2 = page.getByRole("dialog");
  await expect(d2).toContainText("Contradicted");
  await expect(d2.locator("mark").first()).toBeVisible();
  const partnerTitle = (await q<{ title: string }>(`SELECT title FROM "Claim" WHERE id=$1`, [ids[0].claimAId]))[0].title;
  await expect(d2).toContainText(partnerTitle);
});

test("sidebar counts equal the counts on each page", async ({ page, context }) => {
  for (const key of ["meera", "arjun", "kabir"] as const) {
    await as(context, key);
    await go(page, `${P}/ledger`);
    const sidebar = {
      sources: await sidebarCount(page, "Sources"),
      claims: await sidebarCount(page, "Facts"),
      conflicts: await sidebarCount(page, "Conflicts"),
      interview: await sidebarCount(page, "Questions for"),
    };
    const ledger = Number((await page.locator("main").innerText()).match(/\d+\s+of\s+(\d+)\s+facts/)![1]);
    expect(sidebar.claims, `${key}: sidebar claims vs ledger`).toBe(ledger);
    await go(page, `${P}/sources`);
    expect(await page.locator("main").innerText(), `${key}: sources page shows the sidebar count`).toMatch(new RegExp(`\\b${sidebar.sources}\\b`));
    await go(page, `${P}/conflicts`);
    const openCards = await page.getByRole("button", { name: /^Pick A$/ }).count();
    expect(openCards, `${key}: open conflicts`).toBe(sidebar.conflicts);
    await go(page, `${P}/interview`);
    const unanswered = await page.locator("li[id^=gq_]").filter({ hasNot: page.getByText(/Testimony from/) }).count();
    expect(unanswered, `${key}: interview open questions`).toBe(sidebar.interview);
  }
  await as(context, "meera");
});

test("sidebar Review / Handover / Trust counts equal their pages", async ({ page, context }) => {
  await as(context, "meera");
  await go(page, `${P}/review`);
  const pending = await sidebarCount(page, "Review & approve");
  expect(pending).toBe(await n(`SELECT count(*) FROM "Claim" WHERE "projectId" = ${FF} AND status IN ('DRAFT','EDITED')`));
  const rows = await page.locator("li[data-claim]").count();
  const rejected = await page.locator("li[data-claim]").filter({ has: page.getByText("rejected", { exact: true }) }).count();
  expect(rows - rejected, "claim rows on the review page that are awaiting review").toBe(pending);
  expect(await sidebarCount(page, "Arjun's handover")).toBe(await page.getByTestId("version-row").count());
  const red = await sidebarCount(page, "Safety checks");
  expect(red).toBe(await n(`SELECT count(*) FROM "Redaction" r JOIN "Chunk" ch ON ch.id=r."chunkId" JOIN "Source" s ON s.id=ch."sourceId" WHERE s."projectId" = ${FF}`));
  await go(page, `${P}/trust`);
  await expect(page.locator("main")).toContainText(new RegExp(`Redactions\\s*${red}`));
});
