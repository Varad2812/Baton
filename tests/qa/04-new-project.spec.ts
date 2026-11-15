import { expect, test } from "@playwright/test";
import { as, db, go, n, q, sidebarCount, watch, type Persona } from "./helpers";

// /new with the sample files (MessMate) → real run (Groq if reachable, else the rule-based extractor;
// Gemini is never called because the server runs with LLM_DISABLED=1). Then EVERY page of the new
// project is rendered as each persona and must not carry FestFlow's names or Jan–May axis.

const slug = `qa-messmate-${Date.now().toString(36)}`;
const PROJ = `(SELECT id FROM "Project" WHERE slug = '${slug}')`;

test.afterAll(async () => {
  await db(async (c) => {
    await c.query(`SET statement_timeout = 60000`);
    await c.query(`DELETE FROM "Project" WHERE slug = $1`, [slug]);
  });
});

test("/new: sample files build a project with claims, and no page leaks FestFlow's names", async ({ page, context }) => {
  test.setTimeout(420_000);
  const problems = watch(page);
  await page.goto("/new");
  await page.getByLabel("Project name").fill("MessMate (QA)");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("One-line description").fill("Hostel mess menu, meal ratings and complaints.");
  await page.getByTestId("try-samples").click();
  await expect(page.getByText("messmate-chat-export.json").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue to Run" }).click();
  await expect(page.getByText("Riya Deshpande").first()).toBeVisible();

  const t0 = Date.now();
  await page.getByTestId("build-handover").click();
  await expect(page.getByTestId("run-done")).toBeVisible({ timeout: 180_000 });
  const secs = (Date.now() - t0) / 1000;
  const badge = (await page.getByTestId("run-badge").innerText()).trim();
  console.log(`QA /new run: ${secs.toFixed(1)} s, badge "${badge}"`);
  expect(badge).toMatch(/LIVE · Groq|RULE-BASED/);
  // The badge is not cut off in the wizard either.
  const bb = await page.getByTestId("run-badge").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(bb.sw).toBeLessThanOrEqual(bb.cw + 1);

  // Data really saved.
  const counts = {
    sources: await n(`SELECT count(*) FROM "Source" WHERE "projectId" = ${PROJ}`),
    chunks: await n(`SELECT count(*) FROM "Chunk" ch JOIN "Source" s ON s.id = ch."sourceId" WHERE s."projectId" = ${PROJ}`),
    claims: await n(`SELECT count(*) FROM "Claim" WHERE "projectId" = ${PROJ}`),
    validQuotes: await n(`SELECT count(*) FROM "Evidence" e JOIN "Claim" c ON c.id=e."claimId" WHERE c."projectId" = ${PROJ} AND e."quoteValid"`),
    invalidQuotes: await n(`SELECT count(*) FROM "Evidence" e JOIN "Claim" c ON c.id=e."claimId" WHERE c."projectId" = ${PROJ} AND NOT e."quoteValid"`),
    questions: await n(`SELECT count(*) FROM "GapQuestion" WHERE "projectId" = ${PROJ}`),
    redactions: await n(`SELECT count(*) FROM "Redaction" r JOIN "Chunk" ch ON ch.id=r."chunkId" JOIN "Source" s ON s.id=ch."sourceId" WHERE s."projectId" = ${PROJ}`),
    rawSecret: await n(`SELECT count(*) FROM "Chunk" ch JOIN "Source" s ON s.id = ch."sourceId" WHERE s."projectId" = ${PROJ} AND ch.text LIKE '%mmk_live_%'`),
    verified: await n(`SELECT count(*) FROM "Claim" c WHERE c."projectId" = ${PROJ} AND c.grade='VERIFIED' AND NOT EXISTS (SELECT 1 FROM "Evidence" e WHERE e."claimId"=c.id AND e."quoteValid")`),
  };
  console.log("QA /new counts", counts);
  expect(counts.sources).toBeGreaterThanOrEqual(3);
  expect(counts.claims).toBeGreaterThan(5);
  expect(counts.validQuotes).toBeGreaterThan(5);
  expect(counts.invalidQuotes, "invalid evidence is dropped, never stored as valid").toBe(0);
  expect(counts.questions).toBeGreaterThan(0);
  expect(counts.redactions).toBeGreaterThanOrEqual(2);
  expect(counts.rawSecret).toBe(0);
  expect(counts.verified, "no VERIFIED claim without a matched quote").toBe(0);

  // Words that belong to the sample workspace. Allowed only if this project's own records contain them.
  const sampleWords = ["Meera", "Arjun", "Kabir", "Rao", "FestFlow", "Razorpay", "Kalrav", "Zenith"];
  const own = new Set<string>();
  for (const w of [...sampleWords, "fest"]) {
    const c = await n(
      `SELECT (SELECT count(*) FROM "Chunk" ch JOIN "Source" s ON s.id=ch."sourceId" WHERE s."projectId"=${PROJ} AND ch.text ~* $1)
            + (SELECT count(*) FROM "Person" WHERE "projectId"=${PROJ} AND (name ~* $1 OR "roleTitle" ~* $1))
            + (SELECT count(*) FROM "Project" WHERE id=${PROJ} AND (name ~* $1 OR description ~* $1))`,
      [`\\m${w}\\M`],
    );
    if (c > 0) own.add(w);
  }
  const people = await q<{ name: string }>(`SELECT name FROM "Person" WHERE "projectId"=${PROJ}`);
  console.log("QA own words", [...own], "people", people.map((p) => p.name));

  const pages = ["", "/sources", "/ledger", "/conflicts", "/interview", "/review", "/handover", "/handover/receipt", "/trust"];
  for (const key of ["meera", "rao", "arjun", "kabir"] as Persona[]) {
    await as(context, key);
    for (const p of pages) {
      const path = `/p/${slug}${p}`;
      const res = await page.goto(path);
      expect(res?.status(), `${key} ${path}`).toBeLessThan(400);
      await page.locator("main h1").first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(300);
      const text = await page.locator("body").innerText();
      const aria = await page.evaluate(() => [...document.querySelectorAll("[aria-label],[title]")].map((e) => `${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("title") ?? ""}`).join("\n"));
      for (const w of sampleWords) {
        if (own.has(w)) continue;
        expect.soft(new RegExp(`\\b${w}\\b`).test(text), `${key} ${path}: "${w}" is sample-workspace text`).toBe(false);
        expect.soft(new RegExp(`\\b${w}\\b`).test(aria), `${key} ${path}: "${w}" in aria/title`).toBe(false);
      }
      if (!own.has("fest")) {
        expect.soft(/\bfest\b/i.test(text), `${key} ${path}: "fest"`).toBe(false);
        expect.soft(/\bfest\b/i.test(aria), `${key} ${path}: "fest" in aria`).toBe(false);
      }
      expect.soft(/Jan(uary)?\s*(to|–|-)\s*May/i.test(text + aria), `${key} ${path}: Jan–May axis`).toBe(false);
      expect.soft(/graduating May 2026/.test(text), `${key} ${path}: hardcoded graduation line`).toBe(false);
    }
  }

  // Dashboard specifics for a project with no commits and no festival.
  await as(context, "meera");
  await go(page, `/p/${slug}`);
  await expect(page.getByTestId("ownership-empty")).toContainText("No commit history");
  await expect(page.getByTestId("ownership-empty").getByRole("link", { name: "Connect a repo" })).toBeVisible();
  const axis = await page.locator('svg[aria-label^="Decision timeline"]').getAttribute("aria-label");
  const months = (await q<{ m: string }>(`SELECT to_char(min(timestamp), 'Mon') m FROM "Chunk" ch JOIN "Source" s ON s.id=ch."sourceId" WHERE s."projectId"=${PROJ} AND timestamp IS NOT NULL`))[0]?.m;
  console.log("QA axis label", axis, "first month", months);
  if (months) expect(axis).toContain(months);
  expect(axis).not.toMatch(/January to May/);
  await expect(page.locator('svg[aria-label^="Decision timeline"] text', { hasText: /^fest$/ })).toHaveCount(0);
  const attention = await page.locator("main").innerText();
  expect(attention).not.toMatch(/Ask Meera/);
  if (/\bAsk\s+\w+/.test(attention)) expect(attention).toContain(`Ask ${people[0].name.split(" ")[0]}`);

  // The run badge is fully inside its card (not clipped).
  const clipped = await page.getByTestId("run-badge").first().evaluate((el) => {
    const card = el.closest("section, div.flex-col, [class*=rounded-lg]") as HTMLElement | null;
    const b = el.getBoundingClientRect();
    const c = card?.getBoundingClientRect();
    return { overflow: el.scrollWidth > el.clientWidth + 1, outside: c ? b.right > c.right + 1 || b.left < c.left - 1 : false };
  });
  expect(clipped).toEqual({ overflow: false, outside: false });

  // Sidebar counts equal the page counts (owner).
  await go(page, `/p/${slug}/ledger`);
  const ledgerTotal = Number((await page.locator("main").innerText()).match(/\d+\s+of\s+(\d+)\s+claims/)![1]);
  expect(await sidebarCount(page, "Evidence Ledger")).toBe(ledgerTotal);
  expect(ledgerTotal).toBe(counts.claims);
  expect(await sidebarCount(page, "Sources")).toBe(counts.sources);

  expect(problems.filter((p) => !/404/.test(p)), "console/network problems").toEqual([]);
});
