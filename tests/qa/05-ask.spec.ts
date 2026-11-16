import { expect, test, type Page } from "@playwright/test";
import { as, FESTFLOW, go, n, P, q, resetDemo } from "./helpers";

// A1 "Ask the handover": draft label before approval, cited answers after, refusal -> "Ask <owner>"
// -> follow-up -> owner's answer becomes testimony -> the same question is answered; observers only
// ever get Public facts; the Trust page counts answers, refusals, citation validity and leaks.
test.describe.configure({ mode: "serial" });

async function ask(page: Page, question: string) {
  const box = page.getByTestId("ask-box").first();
  await box.locator("[data-ask-input]").fill(question);
  await box.locator("[data-ask-submit]").click();
  const turn = box.locator("[data-ask-turn]").last();
  await expect(turn.locator("[data-ask-answer], [data-ask-refusal], [role=alert]").first()).toBeVisible({ timeout: 30_000 });
  return turn;
}

test.beforeAll(async ({ request }) => {
  await resetDemo(request);
});

test("before approval: answers come from the draft and say so", async ({ page, context }) => {
  await as(context, "arjun");
  await go(page, `${P}/ask`);
  await expect(page.locator("main").getByText("Draft — not yet approved").first()).toBeVisible();
  const turn = await ask(page, "Which service sends the emails?");
  await expect(turn.locator("[data-ask-answer]")).toBeVisible();
  await expect(turn.locator("[data-ask-draft]")).toBeVisible();
});

test("after approval: cited answer, citation opens the evidence drawer", async ({ page, context }) => {
  await as(context, "rao");
  const approve = await page.request.post(`/api/projects/festflow/handover/approve`, { data: { override: true, note: "QA override so Q&A answers from v1." } });
  expect(approve.ok()).toBeTruthy();

  await as(context, "arjun");
  await go(page, `${P}/ask`);
  await expect(page.locator("main").getByText(/Answers from v1, approved by/)).toBeVisible();
  const turn = await ask(page, "Which service sends the emails?");
  const answer = turn.locator("[data-ask-answer]");
  await expect(answer).toContainText(/Resend/);
  await expect(answer.locator("[data-ask-footer]")).toContainText(/Answered from \d+ sources?/);
  await expect(answer.locator("[data-ask-footer]")).toContainText("v1 approved");
  await answer.locator("[data-ask-cite]").first().click();
  await expect(page.getByRole("dialog").getByText("Why this grade")).toBeVisible();
});

test("refusal -> Ask the owner -> answer becomes testimony -> answerable", async ({ page, context }) => {
  const question = "What colour is the stage curtain for the fest?";
  await as(context, "arjun");
  await go(page, `${P}/ask`);
  const turn = await ask(page, question);
  await expect(turn.locator("[data-ask-refusal]")).toContainText("This isn't in the approved handover.");
  await turn.locator("[data-ask-owner]").click();
  await expect(turn.locator("[data-ask-owner-sent]")).toBeVisible();
  // A second request for the same question does not create a duplicate follow-up.
  const again = await page.request.post(`/api/projects/festflow/ask/owner`, { data: { question } });
  expect((await again.json()).already).toBe(true);
  const rows = await q<{ id: string }>(`SELECT f.id FROM "FollowUp" f JOIN "Handover" h ON h.id=f."handoverId" WHERE h."projectId"=${FESTFLOW} AND f.question ILIKE '%stage curtain%'`);
  expect(rows).toHaveLength(1);

  // Observers cannot send questions to the owner (server-side check).
  await as(context, "kabir");
  expect((await page.request.post(`/api/projects/festflow/ask/owner`, { data: { question: "Who runs the scanner?" } })).status()).toBe(403);

  await as(context, "meera");
  const answered = await page.request.post(`/api/projects/festflow/followups/${rows[0].id}/answer`, {
    data: { answer: "The stage curtain is maroon velvet, rented from the college auditorium store." },
  });
  expect(answered.ok()).toBeTruthy();

  await as(context, "arjun");
  await go(page, `${P}/ask`);
  const next = await ask(page, question);
  await expect(next.locator("[data-ask-answer]")).toContainText(/maroon velvet/i);
  await expect(next.locator("[data-ask-answer]")).toContainText(/testimony after v1/);
});

test("observer: only Public facts can be cited, never Team or Restricted", async ({ page, context }) => {
  await as(context, "kabir");
  for (const question of ["Which payment gateway was chosen?", "Who are the sponsors and how much did they pay?", "Where is the app hosted?"]) {
    const res = await page.request.post(`/api/projects/festflow/ask`, { data: { question } });
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).not.toContain("CANARY-");
    const { answer } = JSON.parse(body) as { answer: { sources: { claimId: string }[] } };
    for (const s of answer.sources) {
      expect(await n(`SELECT count(*) FROM "Claim" WHERE id=$1 AND access='PUBLIC'`, [s.claimId])).toBe(1);
    }
  }
});

test("bad input is refused with a clear message", async ({ page, context }) => {
  await as(context, "arjun");
  const short = await page.request.post(`/api/projects/festflow/ask`, { data: { question: " ? " } });
  expect(short.status()).toBe(400);
  expect(JSON.stringify(await short.json())).toContain("at least 3 characters");
  const long = await page.request.post(`/api/projects/festflow/ask`, { data: { question: "x".repeat(501) } });
  expect(long.status()).toBe(400);
});

test("Trust: Q&A safety counts answers, refusals, citation validity and 0 leaks", async ({ page, context }) => {
  await as(context, "rao");
  await go(page, `${P}/trust`);
  const card = page.getByTestId("qa-safety");
  await expect(card).toBeVisible();
  expect(Number(await card.locator('[data-qa-stat="Answers given"]').innerText())).toBeGreaterThanOrEqual(3);
  expect(Number(await card.locator('[data-qa-stat="Refused"]').innerText())).toBeGreaterThanOrEqual(1);
  await expect(card.locator('[data-qa-stat="Citation validity"]')).toHaveText("100%");
  await expect(card.locator('[data-qa-stat="Leaks"]')).toHaveText("0");
});
