import { expect, test } from "@playwright/test";
import { as, go, n, P, q, resetDemo, FESTFLOW as FF } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Everything the seed defines, so "Reset demo restores the seed exactly" is a deep comparison. */
async function snapshot() {
  const one = async (sql: string) => (await q(sql))[0];
  const rows = (sql: string) => q<Record<string, unknown>>(sql);
  return {
    counts: await one(`SELECT
      (SELECT count(*) FROM "Source" WHERE "projectId"=${FF}) sources,
      (SELECT count(*) FROM "Chunk" ch JOIN "Source" s ON s.id=ch."sourceId" WHERE s."projectId"=${FF}) chunks,
      (SELECT count(*) FROM "Redaction" r JOIN "Chunk" ch ON ch.id=r."chunkId" JOIN "Source" s ON s.id=ch."sourceId" WHERE s."projectId"=${FF}) redactions,
      (SELECT count(*) FROM "Claim" WHERE "projectId"=${FF}) claims,
      (SELECT count(*) FROM "Evidence" e JOIN "Claim" c ON c.id=e."claimId" WHERE c."projectId"=${FF}) evidence,
      (SELECT count(*) FROM "Conflict" WHERE "projectId"=${FF}) conflicts,
      (SELECT count(*) FROM "GapQuestion" WHERE "projectId"=${FF}) gaps,
      (SELECT count(*) FROM "HandoverVersion" v JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF}) versions,
      (SELECT count(*) FROM "Acknowledgement" a JOIN "HandoverVersion" v ON v.id=a."versionId" JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF}) acks,
      (SELECT count(*) FROM "FollowUp" f JOIN "Handover" h ON h.id=f."handoverId" WHERE h."projectId"=${FF}) followups`),
    grades: await rows(`SELECT grade, status, count(*)::int n FROM "Claim" WHERE "projectId"=${FF} GROUP BY 1,2 ORDER BY 1,2`),
    conflicts: await rows(`SELECT id, kind, status, resolution FROM "Conflict" WHERE "projectId"=${FF} ORDER BY id`),
    sources: await rows(`SELECT id, access, "grantedToIncoming", authoritative FROM "Source" WHERE "projectId"=${FF} ORDER BY id`),
    chunkAccess: await rows(`SELECT ch.access, count(*)::int n FROM "Chunk" ch JOIN "Source" s ON s.id=ch."sourceId" WHERE s."projectId"=${FF} GROUP BY 1 ORDER BY 1`),
    gapAnswers: await rows(`SELECT id, answer IS NOT NULL answered FROM "GapQuestion" WHERE "projectId"=${FF} ORDER BY id`),
    claimText: await rows(`SELECT id, md5(title || statement) h, "reviewerNote" FROM "Claim" WHERE "projectId"=${FF} ORDER BY id`),
    handover: await one(`SELECT status, "currentVersion" FROM "Handover" WHERE "projectId"=${FF}`),
  };
}

test.beforeAll(async ({ request }) => {
  await resetDemo(request);
});

test("conflicts: Pick A re-grades both claims; Ask leaver creates a gap question", async ({ page, context }) => {
  await as(context, "rao");
  const [cf] = await q<{ claimAId: string; claimBId: string }>(`SELECT "claimAId","claimBId" FROM "Conflict" WHERE id='cf_payment'`);
  const grade = async (id: string) => (await q<{ grade: string; status: string }>(`SELECT grade, status FROM "Claim" WHERE id=$1`, [id]))[0];
  expect((await grade(cf.claimAId)).grade).toBe("CONFLICTING");
  expect((await grade(cf.claimBId)).grade).toBe("CONFLICTING");

  await go(page, `${P}/conflicts`);
  const before = await page.getByRole("button", { name: /^Pick A$/ }).count();
  expect(before).toBe(3);
  await page.locator("#cf_payment").getByRole("button", { name: "Pick A" }).click();
  await expect.poll(async () => (await q(`SELECT status FROM "Conflict" WHERE id='cf_payment'`))[0]).toMatchObject({ status: "RESOLVED" });
  const a = await grade(cf.claimAId);
  const b = await grade(cf.claimBId);
  expect(a.grade, "winner no longer CONFLICTING").not.toBe("CONFLICTING");
  expect(b.status, "loser is rejected").toBe("REJECTED");
  expect(b.grade, "loser no longer CONFLICTING").not.toBe("CONFLICTING");
  expect((await q(`SELECT resolution FROM "Conflict" WHERE id='cf_payment'`))[0]).toMatchObject({ resolution: "A" });
  expect(await n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action LIKE 'conflict.%' AND "actorRole"='REVIEWER'`)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Pick A$/ })).toHaveCount(2);

  // "Ask leaver": every seeded conflict already has a queued question, so remove the one for
  // cf_regclose first; asking must then CREATE exactly one, and asking twice must not duplicate it.
  await q(`DELETE FROM "GapQuestion" WHERE id='gq_regclose'`);
  const gapsBefore = await n(`SELECT count(*) FROM "GapQuestion" WHERE "projectId"=${FF}`);
  const ask = page.locator("#cf_regclose").getByRole("button", { name: /^Ask / });
  await ask.click();
  await expect.poll(() => n(`SELECT count(*) FROM "GapQuestion" WHERE "projectId"=${FF}`)).toBe(gapsBefore + 1);
  expect((await q(`SELECT resolution, status FROM "Conflict" WHERE id='cf_regclose'`))[0]).toMatchObject({ resolution: "ASKED", status: "OPEN" });
  const created = await q<{ id: string; answer: string | null; relatedClaimId: string }>(`SELECT id, answer, "relatedClaimId" FROM "GapQuestion" WHERE "projectId"=${FF} AND kind='CONFLICT' AND "relatedClaimId" IN ('clm_regclose_25','clm_regclose_28')`);
  expect(created).toHaveLength(1);
  expect(created[0].answer).toBeNull();
  await ask.click();
  await page.waitForTimeout(1500);
  expect(await n(`SELECT count(*) FROM "GapQuestion" WHERE "projectId"=${FF}`)).toBe(gapsBefore + 1);
  await as(context, "meera");
  await go(page, `${P}/interview`);
  await expect(page.locator(`li#${created[0].id}`)).toBeVisible();
});

test("gap interview: answering creates testimony and changes the claim's grade", async ({ page, context, request }) => {
  await resetDemo(request);
  await as(context, "meera");
  const [gq] = await q<{ relatedClaimId: string }>(`SELECT "relatedClaimId" FROM "GapQuestion" WHERE id='gq_db_password'`);
  const before = (await q<{ grade: string }>(`SELECT grade FROM "Claim" WHERE id=$1`, [gq.relatedClaimId]))[0].grade;
  expect(before).toBe("MISSING");
  const testimonyBefore = await n(`SELECT count(*) FROM "Source" WHERE "projectId"=${FF} AND kind='TESTIMONY'`);
  await go(page, `${P}/interview`);
  const li = page.locator("li#gq_db_password");
  await li.getByLabel("Your answer").fill("Dev Patil holds the production database password in the club password vault. Arjun gets vault access from Prof. Rao.");
  await li.getByRole("button", { name: "Save as testimony" }).click();
  await expect(li.getByText("Testimony from Meera Kulkarni")).toBeVisible();
  await expect(li.getByTestId("grade-change").locator('[title="Missing"]')).toBeVisible();
  await expect(li.getByTestId("grade-change").locator('[title="Single source"]')).toBeVisible();
  expect(await n(`SELECT count(*) FROM "Source" WHERE "projectId"=${FF} AND kind='TESTIMONY'`)).toBe(testimonyBefore + 1);
  const after = (await q<{ grade: string; fromTestimony: boolean }>(`SELECT grade, "fromTestimony" FROM "Claim" WHERE id=$1`, [gq.relatedClaimId]))[0];
  expect(after.grade).toBe("SINGLE_SOURCE");
  expect(await n(`SELECT count(*) FROM "Evidence" e JOIN "Chunk" c ON c.id=e."chunkId" JOIN "Source" s ON s.id=c."sourceId" WHERE e."claimId"=$1 AND s.kind='TESTIMONY' AND e."quoteValid"`, [gq.relatedClaimId])).toBeGreaterThan(0);
  expect((await q<{ answer: string | null }>(`SELECT answer FROM "GapQuestion" WHERE id='gq_db_password'`))[0].answer).toContain("Dev Patil");
  // Only the owner may answer: Arjun gets no answer box.
  await as(context, "arjun");
  await go(page, `${P}/interview`);
  await expect(page.locator("li#gq_sponsor").getByLabel("Your answer")).toHaveCount(0);
  const res = await page.request.post(`/api/projects/festflow/gap-questions/gq_sponsor/answer`, { data: { answer: "should be refused by the server" } });
  expect(res.status()).toBe(403);
});

async function claimStatus(id: string) {
  return (await q<{ status: string; title: string; reviewerNote: string | null }>(`SELECT status, title, "reviewerNote" FROM "Claim" WHERE id=$1`, [id]))[0];
}

test("review: edit, reject/restore, mark reviewed, blocked approval, override, version, diff", async ({ page, context, request }) => {
  await resetDemo(request);
  await as(context, "rao");
  const target = (await q<{ id: string; section: string; title: string }>(`SELECT id, section, title FROM "Claim" WHERE "projectId"=${FF} AND grade='SINGLE_SOURCE' AND type='TASK' ORDER BY id LIMIT 1`))[0];
  await go(page, `${P}/review`);
  const row = page.locator(`li[data-claim="${target.id}"]`);
  await expect(row).toBeVisible();

  // Edit
  await row.getByRole("button", { name: "Edit" }).click();
  await row.getByLabel("Claim title").fill(`${target.title} (QA edit)`);
  await row.getByLabel("Reviewer note").fill("QA reviewed this");
  await row.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await claimStatus(target.id)).status).toBe("EDITED");
  expect((await claimStatus(target.id)).title).toContain("(QA edit)");
  expect((await claimStatus(target.id)).reviewerNote).toBe("QA reviewed this");
  expect(await n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND "targetId"=$1 AND "actorRole"='REVIEWER'`, [target.id])).toBeGreaterThan(0);

  // Reject / restore
  await row.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("dialog").getByLabel("Reason for rejecting").fill("QA: not a real task");
  await page.getByRole("dialog").getByRole("button", { name: "Reject claim" }).click();
  await expect.poll(async () => (await claimStatus(target.id)).status).toBe("REJECTED");
  await expect(row.getByText("rejected").first()).toBeVisible();
  await row.getByRole("button", { name: "Restore" }).click();
  await expect.poll(async () => (await claimStatus(target.id)).status).not.toBe("REJECTED");

  // Mark section reviewed
  const sectionCard = page.locator(`li[data-claim="${target.id}"]`).locator("xpath=ancestor::*[contains(@class,'scroll-mt-28')][1]");
  const auditBefore = await n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action='section.reviewed'`);
  await sectionCard.getByRole("button", { name: /Mark reviewed/ }).click();
  await expect.poll(() => n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action='section.reviewed'`)).toBe(auditBefore + 1);
  await expect(sectionCard.getByRole("button", { name: /^Reviewed/ })).toBeVisible();

  // Owner cannot approve (no self-approval): button disabled and the API refuses.
  await as(context, "meera");
  await go(page, `${P}/review`);
  await expect(page.getByRole("button", { name: /approve v1/i })).toBeDisabled();
  const refused = await page.request.post(`/api/projects/festflow/handover/approve`, { data: { note: "self approval" } });
  expect(refused.status()).toBe(403);
  expect(await n(`SELECT count(*) FROM "HandoverVersion" v JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF}`)).toBe(0);

  // Reviewer: approval blocked by open conflicts; override needs a note.
  await as(context, "rao");
  await go(page, `${P}/review`);
  await page.getByRole("button", { name: /approve v1/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/blocked by \d+ item/);
  const approve = dialog.getByRole("button", { name: "Approve with override" });
  await expect(approve).toBeDisabled();
  const direct = await page.request.post(`/api/projects/festflow/handover/approve`, { data: {} });
  expect(direct.status(), "server refuses a blocked approval without override").toBe(409);
  expect(await n(`SELECT count(*) FROM "HandoverVersion" v JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF}`)).toBe(0);
  await dialog.getByRole("checkbox").check();
  await expect(approve).toBeDisabled();
  await dialog.getByLabel(/Override note/).fill("QA override: open items to be confirmed with the treasurer.");
  await approve.click();
  await expect(page.getByTestId("version-row").first()).toContainText("v1", { timeout: 90_000 });
  const ver = await q<{ number: number; note: string; approvedAt: Date | null }>(`SELECT v.number, v.note, v."approvedAt" FROM "HandoverVersion" v JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF}`);
  expect(ver).toHaveLength(1);
  expect(ver[0].note).toContain("QA override");
  expect(ver[0].approvedAt).not.toBeNull();
  expect(await n(`SELECT count(*) FROM "RoleView" r JOIN "HandoverVersion" v ON v.id=r."versionId" JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF}`)).toBe(4);
  expect((await q(`SELECT status, "currentVersion" FROM "Handover" WHERE "projectId"=${FF}`))[0]).toMatchObject({ status: "APPROVED", currentVersion: 1 });

  // A change after v1 shows up in the diff (draft vs v1), with its audit-backed edit.
  const row2 = page.locator(`li[data-claim="${target.id}"]`);
  await row2.getByRole("button", { name: "Edit" }).click();
  await row2.getByLabel("Claim title").fill(`${target.title} (QA v2 edit)`);
  await row2.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await claimStatus(target.id)).title).toContain("v2 edit");
  await go(page, `${P}/review?diff=1..draft`);
  const diff = page.locator("#diff");
  await expect(diff).toContainText("v1 → current draft");
  await expect(diff).toContainText(/1 changed/);
  await expect(diff).toContainText("QA v2 edit");
  // v1 snapshot is immutable: its stored title is still the pre-v2 one.
  const snap = (await q<{ snapshot: { claims: { id: string; title: string }[] } }>(`SELECT v.snapshot FROM "HandoverVersion" v JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF}`))[0].snapshot;
  expect(snap.claims.find((c) => c.id === target.id)?.title).not.toContain("v2 edit");
});

async function ackRows() {
  return n(`SELECT count(*) FROM "Acknowledgement" a JOIN "HandoverVersion" v ON v.id=a."versionId" JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF}`);
}

test("handover: approved RoleView per persona, acknowledge, follow-up → testimony, request access audit, receipt", async ({ page, context, request }) => {
  await resetDemo(request);
  // Approve v1 with an override as the reviewer (server-side, like the UI does).
  await as(context, "rao");
  const approve = await page.request.post(`/api/projects/festflow/handover/approve`, { data: { override: true, note: "QA override for handover checks (open items)." } });
  expect(approve.status(), await approve.text()).toBe(200);

  // Each persona gets its own stored RoleView; restricted material never reaches INCOMING/OBSERVER.
  const hidden: Record<string, number> = {};
  for (const key of ["meera", "rao", "arjun", "kabir"] as const) {
    await as(context, key);
    await go(page, `${P}/handover`);
    await expect(page.getByTestId("approved-banner")).toContainText("v1 approved by Prof. S. Rao");
    const stored = (await q<{ hiddenCount: number; compiled: unknown }>(
      `SELECT r."hiddenCount", r.compiled FROM "RoleView" r JOIN "HandoverVersion" v ON v.id=r."versionId" JOIN "Handover" h ON h.id=v."handoverId" WHERE h."projectId"=${FF} AND r.role=$1`,
      [{ meera: "OWNER", rao: "REVIEWER", arjun: "INCOMING", kabir: "OBSERVER" }[key]],
    ))[0];
    hidden[key] = stored.hiddenCount;
    const body = await page.locator("main").innerText();
    expect(body, `${key} never sees the canary`).not.toContain("CANARY-RM-7F3A");
    if (key === "arjun" || key === "kabir") {
      expect(stored.hiddenCount).toBeGreaterThan(0);
      await expect(page.getByTestId("hidden-placeholder").first()).toContainText("hidden — request access");
    } else {
      expect(stored.hiddenCount).toBe(0);
      await expect(page.getByTestId("hidden-placeholder")).toHaveCount(0);
    }
  }
  expect(hidden.kabir).toBeGreaterThan(hidden.arjun);

  // Arjun: acknowledge two sections.
  await as(context, "arjun");
  await go(page, `${P}/handover`);
  const acks0 = await ackRows();
  for (const section of ["Overview", "Decisions"]) {
    await page.getByRole("button", { name: `Acknowledge ${section}` }).click();
    await expect(page.locator(section === "Overview" ? "#overview" : `[data-section="${section}"]`).getByText("Acknowledged")).toBeVisible();
  }
  expect(await ackRows()).toBe(acks0 + 2);
  // Observer cannot acknowledge (server refuses).
  await as(context, "kabir");
  const kab = await page.request.post(`/api/projects/festflow/handover/ack`, { data: { version: 1, section: "Overview" } });
  expect(kab.status()).toBe(403);

  // Arjun: request access from the hidden placeholder, audit row written.
  await as(context, "arjun");
  await go(page, `${P}/handover`);
  const reqBefore = await n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action='access.requested'`);
  await page.getByTestId("hidden-placeholder").first().getByRole("button", { name: "Request access" }).click();
  await expect.poll(() => n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action='access.requested'`)).toBe(reqBefore + 1);
  await expect(page.getByTestId("hidden-placeholder").first()).toContainText(/Requested from/);

  // Arjun asks a follow-up; it reaches Meera; her answer becomes testimony and returns to Arjun.
  const Q = "Where is the Razorpay test-mode key stored, and who can rotate it?";
  await page.getByRole("button", { name: "Ask a follow-up about Access & secrets" }).click();
  await page.getByRole("dialog").getByLabel("Your question").fill(Q);
  await page.getByRole("dialog").getByRole("button", { name: "Send question" }).click();
  await expect(page.getByTestId("follow-up").filter({ hasText: Q })).toContainText("waiting for Meera");
  expect(await n(`SELECT count(*) FROM "FollowUp" WHERE question=$1 AND answer IS NULL`, [Q])).toBe(1);

  await as(context, "meera");
  await go(page, `${P}/interview`);
  const testimonyBefore = await n(`SELECT count(*) FROM "Source" WHERE "projectId"=${FF} AND kind='TESTIMONY'`);
  const item = page.getByTestId("follow-up").filter({ hasText: Q });
  await item.getByLabel("Answer this follow-up").fill("It is in the Razorpay dashboard under Settings > API keys; Dev Patil can rotate it.");
  await item.getByRole("button", { name: "Send answer" }).click();
  await expect(item).toContainText("answered");
  expect(await n(`SELECT count(*) FROM "Source" WHERE "projectId"=${FF} AND kind='TESTIMONY'`)).toBe(testimonyBefore + 1);
  expect(await n(`SELECT count(*) FROM "FollowUp" WHERE question=$1 AND answer LIKE '%Dev Patil%'`, [Q])).toBe(1);

  await as(context, "arjun");
  await go(page, `${P}/handover`);
  await expect(page.getByTestId("follow-up").filter({ hasText: Q })).toContainText("Dev Patil can rotate it");

  // Receipt: acknowledged sections have real times, others a dash; and a sha256.
  await go(page, `${P}/handover/receipt`);
  const ackCell = (s: string) => page.locator("tr").filter({ has: page.locator("td", { hasText: new RegExp(`^${s}$`) }) }).locator("td").last();
  await expect(ackCell("Overview")).toHaveText(/\d{1,2}:\d{2}/);
  await expect(ackCell("Decisions")).toHaveText(/\d{1,2}:\d{2}/);
  await expect(ackCell("Contacts")).toHaveText("—");
  await expect(page.locator("main")).toContainText(/[0-9a-f]{16,}/);
  await expect(page.locator("main")).toContainText("QA override");
});

test("trust: re-check quotes and leakage test run and show 0 leaks", async ({ page, context }) => {
  await as(context, "rao");
  await go(page, `${P}/trust`);
  const recheckBefore = await n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action='trust.recheck_quotes'`);
  await page.getByRole("button", { name: "Re-check quotes" }).click();
  await expect.poll(() => n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action='trust.recheck_quotes'`)).toBe(recheckBefore + 1);
  const total = await n(`SELECT count(*) FROM "Evidence" e JOIN "Claim" c ON c.id=e."claimId" WHERE c."projectId"=${FF}`);
  const valid = await n(`SELECT count(*) FROM "Evidence" e JOIN "Claim" c ON c.id=e."claimId" WHERE c."projectId"=${FF} AND e."quoteValid"`);
  expect(valid).toBe(total);
  await expect(page.locator("main")).toContainText(`${valid}/${total}`);

  const leakBefore = await n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action='trust.leakage_test'`);
  await page.getByRole("button", { name: "Run leakage test" }).click();
  await expect.poll(() => n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND action='trust.leakage_test'`), { timeout: 60_000 }).toBe(leakBefore + 1);
  const meta = (await q<{ meta: { totalHits?: number; hits?: number } }>(`SELECT meta FROM "AuditLog" WHERE "projectId"=${FF} AND action='trust.leakage_test' ORDER BY at DESC LIMIT 1`))[0].meta;
  expect(JSON.stringify(meta)).toMatch(/0/);
  const matrix = page.locator('[data-tour="leakage"]');
  await expect(matrix).toBeVisible();
  const cells = await matrix.locator("span.font-mono, td").allInnerTexts();
  expect(cells.length).toBeGreaterThan(0);
  await expect(page.locator("main")).toContainText(/0\s*leaks/i);
  // Every persona's matrix row shows 0 hits: the red "X" state never renders.
  const rows = matrix.locator("tbody tr");
  await expect(rows).toHaveCount(4);
  for (let i = 0; i < 4; i++) expect((await rows.nth(i).locator("td").last().innerText()).trim(), `leaks in matrix row ${i}`).toBe("0");
  // Incoming and Observer rows really withheld something (so "0 leaks" is a real test).
  expect(Number((await rows.nth(2).locator("td").nth(3).innerText()).trim())).toBeGreaterThan(0);
  expect(Number((await rows.nth(3).locator("td").nth(3).innerText()).trim())).toBeGreaterThan(Number((await rows.nth(2).locator("td").nth(3).innerText()).trim()));
});

test("sources: access label and grant to successor change what the successor sees", async ({ page, context, request }) => {
  await resetDemo(request);
  const countFor = async (key: "arjun" | "kabir") => {
    await as(context, key);
    await go(page, `${P}/ledger`);
    return Number((await page.locator("main").innerText()).match(/\d+\s+of\s+(\d+)\s+claims/)![1]);
  };
  const arjun0 = await countFor("arjun");

  // 1. Grant the RESTRICTED budget sheet to Arjun → he sees its claims.
  await as(context, "meera");
  await go(page, `${P}/sources`);
  const restricted = (await q<{ id: string; title: string }>(`SELECT id, title FROM "Source" WHERE "projectId"=${FF} AND access='RESTRICTED' AND kind<>'TESTIMONY' LIMIT 1`))[0];
  const row = page.locator("tr, li").filter({ hasText: restricted.title }).first();
  await row.getByRole("switch", { name: "Grant to incoming lead" }).click();
  await expect.poll(async () => (await q(`SELECT "grantedToIncoming" g FROM "Source" WHERE id=$1`, [restricted.id]))[0]).toMatchObject({ g: true });
  const arjun1 = await countFor("arjun");
  expect(arjun1).toBeGreaterThan(arjun0);
  expect(await n(`SELECT count(*) FROM "AuditLog" WHERE "projectId"=${FF} AND "actorRole"='OWNER' AND action LIKE 'source.%'`)).toBeGreaterThan(0);
  // The observer still sees nothing restricted.
  await as(context, "kabir");
  await go(page, `${P}/ledger`);
  await expect(page.locator("main")).not.toContainText("CANARY-RM-7F3A");

  // 2. Relabel a TEAM source as RESTRICTED → its chunks inherit, claims only it supports disappear for Arjun.
  const [pick] = await q<{ id: string; title: string; solo: number }>(`
    SELECT s.id, s.title, count(DISTINCT c.id)::int solo FROM "Source" s
    JOIN "Chunk" ch ON ch."sourceId"=s.id JOIN "Evidence" e ON e."chunkId"=ch.id JOIN "Claim" c ON c.id=e."claimId"
    WHERE s."projectId"=${FF} AND s.access='TEAM' AND s.kind IN ('DOC','CHAT','TASKS')
      AND NOT EXISTS (SELECT 1 FROM "Evidence" e2 JOIN "Chunk" ch2 ON ch2.id=e2."chunkId" WHERE e2."claimId"=c.id AND ch2."sourceId"<>s.id)
    GROUP BY s.id, s.title ORDER BY solo DESC LIMIT 1`);
  expect(pick.solo).toBeGreaterThan(0);
  await as(context, "meera");
  await go(page, `${P}/sources`);
  await page.getByLabel(`Access label for ${pick.title}`).selectOption("RESTRICTED");
  await expect.poll(async () => (await q(`SELECT access FROM "Source" WHERE id=$1`, [pick.id]))[0]).toMatchObject({ access: "RESTRICTED" });
  expect(await n(`SELECT count(*) FROM "Chunk" WHERE "sourceId"=$1 AND access<>'RESTRICTED'`, [pick.id])).toBe(0);
  expect(await n(`SELECT count(*) FROM "Claim" c WHERE c."projectId"=${FF} AND c.access='RESTRICTED' AND EXISTS (SELECT 1 FROM "Evidence" e JOIN "Chunk" ch ON ch.id=e."chunkId" WHERE e."claimId"=c.id AND ch."sourceId"=$1)`, [pick.id])).toBeGreaterThan(0);
  const arjun2 = await countFor("arjun");
  expect(arjun2).toBeLessThan(arjun1);
  // Non-owners cannot label sources.
  await as(context, "rao");
  const denied = await page.request.patch(`/api/projects/festflow/sources/${pick.id}`, { data: { access: "PUBLIC" } });
  expect(denied.status()).toBe(403);
  await as(context, "meera");
});

test("Reset demo restores the seed exactly", async ({ page, context, request }) => {
  await resetDemo(request);
  const seed = await snapshot();
  await as(context, "meera");
  // Dirty the project: answer a gap, edit a claim, grant a source, relabel one, approve.
  const gq = await page.request.post(`/api/projects/festflow/gap-questions/gq_sponsor/answer`, { data: { answer: "QA: moved to the alumni cell coordinator." } });
  expect(gq.ok()).toBeTruthy();
  const claim = (await q<{ id: string }>(`SELECT id FROM "Claim" WHERE "projectId"=${FF} AND status='DRAFT' LIMIT 1`))[0].id;
  await as(context, "rao");
  expect((await page.request.patch(`/api/projects/festflow/claims/${claim}`, { data: { title: "QA changed title" } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/projects/festflow/handover/approve`, { data: { override: true, note: "QA override for the reset check." } })).ok()).toBeTruthy();
  const dirty = await snapshot();
  expect(JSON.stringify(dirty)).not.toBe(JSON.stringify(seed));
  expect(dirty.counts.versions).toBe("1");

  // Real UI path: the Reset demo dialog.
  await go(page, `${P}/review`);
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo restored")).toBeVisible({ timeout: 90_000 });
  const restored = await snapshot();
  expect(restored).toEqual(seed);
});
