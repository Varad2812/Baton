import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const P = "/p/festflow";
const FOLLOW_UP = "Where is the Razorpay test-mode key stored, and who can rotate it?";

async function resetDemo(request: APIRequestContext) {
  for (let i = 0; i < 8; i++) {
    const res = await request.post("/api/demo/reset");
    if (res.ok()) return;
    if (res.status() !== 429) throw new Error(`reset failed: HTTP ${res.status()} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, Number(res.headers()["retry-after"] ?? 5) * 1000 + 500));
  }
  throw new Error("reset kept returning 429");
}

/** Switch persona through the "Viewing as" menu in the top bar. */
async function viewAs(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: /^Viewing as/ });
  if ((await trigger.getAttribute("aria-label"))?.includes(name)) return;
  await trigger.click();
  await page.getByRole("menuitem", { name: new RegExp(name.replace(/\./g, "\\.")) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Viewing as ${name.replace(/\./g, "\\.")}`) })).toBeVisible();
}

async function answerGap(page: Page, id: string, answer: string) {
  const q = page.locator(`li#${id}`);
  await q.getByLabel("Your answer").fill(answer);
  await q.getByRole("button", { name: "Save as testimony" }).click();
  await expect(q.getByText("Testimony from Meera Kulkarni")).toBeVisible();
  const change = q.getByTestId("grade-change");
  await expect(change.locator('[title^="Missing"]')).toBeVisible();
  await expect(change.locator('[title^="Single source"]')).toBeVisible();
}

test("handover workflow: interview → resolve → approve → acknowledge → follow-up → reset", async ({ page, request }) => {
  await resetDemo(request);

  // 1. Meera (owner) answers 2 gap questions; each becomes testimony and the grade changes inline.
  await page.goto(`${P}/interview`);
  await viewAs(page, "Meera Kulkarni");
  await answerGap(
    page,
    "gq_db_password",
    "Dev Patil holds the production database password in the club password vault. Arjun gets vault access from Prof. Rao after the fest.",
  );
  await answerGap(
    page,
    "gq_sponsor",
    "Sponsor contact moved to the alumni cell this year. Arjun should go through the alumni cell coordinator, not the old Zenith marketing contact.",
  );

  // 2. Prof. Rao (reviewer) resolves Razorpay vs PhonePe, then approves v1 with an override.
  await viewAs(page, "Prof. S. Rao");
  await page.goto(`${P}/conflicts`);
  const payment = page.locator("#cf_payment");
  await payment.getByRole("button", { name: "Pick A" }).click();
  await expect(page.locator("#cf_payment")).toHaveCount(0); // leaves the Open tab
  await page.goto(`${P}/conflicts?tab=resolved`);
  await expect(page.locator("li#cf_payment")).toContainText("Payment gateway: Razorpay");
  await expect(page.locator("li#cf_payment")).toContainText("Prof. S. Rao");

  await page.goto(`${P}/review`);
  await page.getByRole("button", { name: /approve v1/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Approval is blocked by 2 items");
  const approve = dialog.getByRole("button", { name: "Approve with override" });
  await expect(approve).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await expect(approve).toBeDisabled(); // a note is required with the override
  await dialog.getByLabel(/Override note/).fill("Registration close and refund cutoff to be confirmed with Dev by 26 Apr.");
  await approve.click();
  await expect(page.getByTestId("version-row").first()).toContainText("v1", { timeout: 90_000 });
  await expect(page.getByTestId("version-row").first()).toContainText("override");

  // 3. Arjun (incoming) reads the approved role view, sees a hidden-claim placeholder, acknowledges 2 sections, asks a follow-up.
  await viewAs(page, "Arjun Mehta");
  await page.goto(`${P}/handover`);
  await expect(page.getByTestId("approved-banner")).toContainText("v1 approved by Prof. S. Rao");
  await expect(page.getByTestId("hidden-placeholder").first()).toContainText("hidden — request access");
  for (const section of ["Overview", "Decisions"]) {
    await page.getByRole("button", { name: `Acknowledge ${section}` }).click();
    await expect(page.locator(section === "Overview" ? "#overview" : '[data-section="Decisions"]').getByText("Acknowledged")).toBeVisible();
  }
  await page.getByRole("button", { name: "Ask a follow-up about Access & secrets" }).click();
  await page.getByRole("dialog").getByLabel("Your question").fill(FOLLOW_UP);
  await page.getByRole("dialog").getByRole("button", { name: "Send question" }).click();
  await expect(page.getByTestId("follow-up").filter({ hasText: FOLLOW_UP })).toContainText("waiting for Meera");

  // 4. Meera answers it from her follow-up inbox; the answer is testimony and reaches Arjun.
  await viewAs(page, "Meera Kulkarni");
  await page.goto(`${P}/interview?tab=followups`);
  const item = page.getByTestId("follow-up").filter({ hasText: FOLLOW_UP });
  await item.getByLabel("Answer this follow-up").fill("It is in the Razorpay dashboard under Settings > API keys; Dev Patil can rotate it.");
  await item.getByRole("button", { name: "Send answer" }).click();
  await expect(item).toContainText("answered");

  await viewAs(page, "Arjun Mehta");
  await page.goto(`${P}/handover`);
  await expect(page.getByTestId("follow-up").filter({ hasText: FOLLOW_UP })).toContainText("Dev Patil can rotate it");

  // Receipt shows the real acknowledgement times.
  await page.goto(`${P}/handover/receipt`);
  const ackCell = (s: string) => page.locator("tr").filter({ has: page.locator("td", { hasText: new RegExp(`^${s}$`) }) }).locator("td").last();
  await expect(ackCell("Overview")).toHaveText(/\d{1,2}:\d{2}/);
  await expect(ackCell("Decisions")).toHaveText(/\d{1,2}:\d{2}/);
  await expect(ackCell("Contacts")).toHaveText("—");

  // 5. Reset demo restores the seed.
  await page.getByRole("link", { name: /Back to handover/ }).click();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo restored")).toBeVisible({ timeout: 90_000 });
  await page.goto(`${P}/handover`);
  await expect(page.getByTestId("draft-banner")).toBeVisible();
  await viewAs(page, "Meera Kulkarni");
  await page.goto(`${P}/interview`);
  await expect(page.locator("li#gq_db_password").getByLabel("Your answer")).toBeVisible();
  await page.goto(`${P}/conflicts`);
  await expect(page.locator("#cf_payment").getByRole("button", { name: "Pick A" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pick A" })).toHaveCount(3);
});
