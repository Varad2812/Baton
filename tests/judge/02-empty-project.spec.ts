import { expect, test } from "@playwright/test";
import { asPersona, PAGES, pastWelcome, watch } from "./helpers";

// A brand-new project with no sources: every page loads, says what to do next, and nothing 500s.
test("empty project: every page explains the next step", async ({ page, context }) => {
  await asPersona(context, "meera");
  await page.goto("/");
  const created = await page.request.post("/api/projects", { data: { name: `Judge empty ${Date.now().toString(36)}` } });
  expect(created.status()).toBe(201);
  const { project } = (await created.json()) as { project: { slug: string } };
  const problems = watch(page);
  try {
    for (const p of PAGES) {
      const res = await page.goto(`/p/${project.slug}${p}`);
      expect(res?.status(), p).toBeLessThan(400);
      await page.locator("main h1").first().waitFor();
    }
    await page.goto(`/p/${project.slug}/ask`);
    await expect(page.getByRole("link", { name: "Go to Sources" })).toBeVisible();
    await page.goto(`/p/${project.slug}/radar`);
    await expect(page.getByRole("link", { name: "Connect a repo" })).toBeVisible();
    expect(problems).toEqual([]);
    // Another visitor cannot open it.
    const other = await page.context().browser()!.newContext({ storageState: pastWelcome() });
    const res = await other.request.get(`/p/${project.slug}`);
    expect(res.status()).toBe(404);
    await other.close();
  } finally {
    expect((await page.request.delete(`/api/projects/${project.slug}`)).ok()).toBeTruthy();
  }
});
