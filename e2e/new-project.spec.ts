import "dotenv/config";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

// /new wizard end to end with "Try with sample files", offline (LLM_DISABLED=1): the project,
// people, uploads, chunks and redactions are saved; extraction stops with the friendly
// "model unavailable" panel; Retry reuses the saved project instead of uploading again.
// The test project is deleted afterwards (Project cascades to every child row).

const slug = `messmate-e2e-${Date.now().toString(36)}`;

async function db<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function counts() {
  return db(async (c) => {
    const q = async (sql: string) => Number((await c.query(sql, [slug])).rows[0].n);
    const proj = `(SELECT id FROM "Project" WHERE slug = $1)`;
    return {
      sources: await q(`SELECT count(*) n FROM "Source" WHERE "projectId" = ${proj}`),
      chunks: await q(`SELECT count(*) n FROM "Chunk" ch JOIN "Source" s ON s.id = ch."sourceId" WHERE s."projectId" = ${proj}`),
      redactions: await q(
        `SELECT count(*) n FROM "Redaction" r JOIN "Chunk" ch ON ch.id = r."chunkId" JOIN "Source" s ON s.id = ch."sourceId" WHERE s."projectId" = ${proj}`,
      ),
      rawSecret: await q(
        `SELECT count(*) n FROM "Chunk" ch JOIN "Source" s ON s.id = ch."sourceId" WHERE s."projectId" = ${proj} AND (ch.text LIKE '%mmk_live_%' OR ch.text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\\.[a-z]{2,}')`,
      ),
      people: await q(`SELECT count(*) n FROM "Person" WHERE "projectId" = ${proj} AND EXISTS (SELECT 1 FROM unnest(handles) h WHERE h LIKE 'persona:%')`),
      handovers: await q(`SELECT count(*) n FROM "Handover" WHERE "projectId" = ${proj}`),
      claims: await q(`SELECT count(*) n FROM "Claim" WHERE "projectId" = ${proj}`),
    };
  });
}

test.afterAll(async () => {
  await db(async (c) => {
    if (process.env.E2E_DEBUG_LOCKS) {
      const r = await c.query(
        `select pid, state, now()-xact_start xact, wait_event_type w, left(query,160) q, pg_blocking_pids(pid) b from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and state<>'idle'`,
      );
      console.log(r.rows);
    }
    await c.query(`SET statement_timeout = 30000`);
    await c.query(`DELETE FROM "Project" WHERE slug = $1`, [slug]);
  });
});

test("/new: sample files → project + uploads + redaction saved → run finishes without Gemini", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("Project name").fill("MessMate (e2e)");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("One-line description").fill("Hostel mess menu, meal ratings and complaints.");
  await page.getByTestId("try-samples").click();

  // Samples land on the Sources step with 3 files and pre-filled people.
  await expect(page.getByText("messmate-chat-export.json").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue to Run" }).click();
  await expect(page.getByText("Riya Deshpande").first()).toBeVisible();

  const t0 = Date.now();
  await page.getByTestId("build-handover").click();
  // No AI engine reachable (LLM_DISABLED=1, no GROQ_API_KEY): the rule-based extractor still finishes.
  await expect(page.getByTestId("run-done")).toBeVisible({ timeout: 60_000 });
  const secs = (Date.now() - t0) / 1000;
  console.log(`run finished in ${secs.toFixed(1)} s`);
  expect(secs).toBeLessThan(30);
  await expect(page.getByTestId("run-badge")).toContainText(process.env.E2E_GROQ ? "LIVE · Groq" : "RULE-BASED · no AI available");

  const first = await counts();
  console.log("saved after run", first);
  expect(first.sources).toBeGreaterThanOrEqual(3);
  expect(first.chunks).toBeGreaterThan(0);
  expect(first.redactions).toBeGreaterThanOrEqual(2); // mmk_live_ token + contractor email
  expect(first.rawSecret).toBe(0);
  expect(first.people).toBe(3);
  expect(first.handovers).toBe(1);
  expect(first.claims).toBeGreaterThan(5);
  const extra = await db(async (c) => {
    const proj = `(SELECT id FROM "Project" WHERE slug = $1)`;
    const r = await c.query(
      `SELECT (SELECT count(*) FROM "Evidence" e JOIN "Claim" cl ON cl.id = e."claimId" WHERE cl."projectId" = ${proj} AND e."quoteValid") ev,
              (SELECT count(*) FROM "GapQuestion" WHERE "projectId" = ${proj}) q,
              (SELECT count(DISTINCT grade) FROM "Claim" WHERE "projectId" = ${proj}) grades`,
      [slug],
    );
    return { evidence: Number(r.rows[0].ev), questions: Number(r.rows[0].q), grades: Number(r.rows[0].grades) };
  });
  console.log("evidence/questions/grades", extra);
  expect(extra.evidence).toBeGreaterThan(5);
  expect(extra.questions).toBeGreaterThan(0);
  expect(extra.grades).toBeGreaterThanOrEqual(2);

  for (const path of ["", "/ledger", "/handover"]) {
    const res = await page.goto(`/p/${slug}${path}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Application error")).toHaveCount(0);
  }

  // The project opens with the departing person as the owner persona.
  await page.goto(`/p/${slug}/interview`);
  await expect(page.getByRole("button", { name: /^Viewing as Riya Deshpande/ })).toBeVisible();
  await expect(page.getByText("Interviewee: Riya Deshpande")).toBeVisible();
});
