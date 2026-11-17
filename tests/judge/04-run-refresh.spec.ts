import { expect, test } from "@playwright/test";
import { go, openDemo } from "./helpers";

// Refresh and back/forward while a pipeline run streams: the page reconnects; a second run is refused.
test("refresh mid-run reconnects; a concurrent run is refused with 409", async ({ page }) => {
  const slug = await openDemo(page);
  await go(page, `/p/${slug}/sources?tab=runs`);
  await page.locator("[data-run-pipeline]").click();
  await expect(page.getByText(/Running…|Run in progress…/).first()).toBeVisible();
  const busy = await page.request.post(`/api/projects/${slug}/pipeline`, { data: { mode: "CACHED" } });
  // Either refused outright (409) or its stream ends with an error event: never a second run.
  if (busy.status() === 200) expect(await busy.text()).toMatch(/already in progress|"stage":"error"/);
  else expect(busy.status()).toBe(409);
  await page.reload();
  await page.locator("main h1").first().waitFor();
  await page.goBack().catch(() => undefined);
  await page.goForward().catch(() => undefined);
  await go(page, `/p/${slug}/sources?tab=runs`);
  await expect(page.locator("[data-run-pipeline]")).toHaveText(/Run pipeline/, { timeout: 120_000 });
  const run = await (await page.request.get(`/api/projects/${slug}/pipeline`)).json();
  expect(run.run.status).not.toBe("RUNNING");
});
