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
