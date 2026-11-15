import { expect, test } from "@playwright/test";

// Runs offline: playwright.config.ts starts the server with LLM_DISABLED=1 and no GROQ key, so
// every answer comes from the offline engine (knowledge-base FAQ + project counts).
const P = "/p/festflow";

test("Ask Baton answers on the dashboard (offline engine)", async ({ page, context }) => {
  await context.addCookies([{ name: "baton_persona", value: "meera", url: "http://localhost:3100" }]);
  await page.goto(P);
  await page.locator("[data-assistant-open]").click();
  const panel = page.getByRole("dialog", { name: "Ask Baton" });
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-assistant-suggestion]")).toHaveCount(3);

  await panel.getByLabel("Ask Baton a question").fill("What does Confirmed mean?");
  await panel.getByRole("button", { name: "Send question" }).click();
  const answer = panel.locator("[data-assistant-answer]").last();
  await expect(answer).toContainText("two or more independent sources");
  await expect(answer.locator("[data-assistant-engine]")).toHaveAttribute("data-assistant-engine", "offline");
  await expect(answer).toContainText("Offline");

  // A count question answers from the project and cites facts that open the evidence drawer.
  await panel.locator("[data-assistant-form] textarea").fill("How many conflicts are open?");
  await page.keyboard.press("Enter");
  const counts = panel.locator("[data-assistant-answer]").last();
  await expect(counts).toContainText(/open conflicts?/);
  await counts.locator("[data-assistant-citation]").first().click();
  await expect(page).toHaveURL(/\?claim=clm_/);
  await expect(page.getByRole("dialog").getByText("Why this grade")).toBeVisible();
});

test("Draft helper: review reject reason (insert, never submits) and testimony refusal", async ({ page, context }) => {
  await context.addCookies([{ name: "baton_persona", value: "rao", url: "http://localhost:3100" }]);
  await page.goto(`${P}/review`);
  await page.getByRole("button", { name: "Reject" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Reject fact" });
  await expect(dialog).toBeVisible();

  await dialog.locator('[data-draft-button="reject_reason"]').click();
  const pop = page.locator('[data-draft-popover="reject_reason"]');
  await expect(pop).toBeVisible();
  await pop.getByLabel(/Rough notes/).fill("superseded by the 02-apr notes");
  await pop.locator("[data-draft-generate]").click();
  await expect(pop.locator("[data-draft-result]")).toContainText("Superseded by the 02-apr notes.");
  await expect(pop.locator("[data-draft-engine]")).toHaveAttribute("data-draft-engine", "offline");
  await pop.getByRole("button", { name: "Insert" }).click();
  await expect(pop).toBeHidden();
  const reason = dialog.getByRole("textbox", { name: "Reason for rejecting" });
  await expect(reason).toHaveValue("Superseded by the 02-apr notes.");
  // Inserting never submits: the dialog is still open and nothing was rejected.
  await expect(dialog.getByRole("button", { name: "Reject fact" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Testimony: with no notes the assistant refuses to invent an answer.
  await context.addCookies([{ name: "baton_persona", value: "meera", url: "http://localhost:3100" }]);
  await page.goto(`${P}/interview`);
  await page.locator('[data-draft-button="interview_answer"]').first().click();
  const pop2 = page.locator('[data-draft-popover="interview_answer"]');
  await pop2.locator("[data-draft-generate]").click();
  await expect(pop2.locator("[data-draft-message]")).toHaveText("Type a few words of what you know and I'll make it clear.");
  await expect(pop2.getByRole("button", { name: "Insert" })).toBeDisabled();
});
