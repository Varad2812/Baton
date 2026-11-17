import { expect, test } from "@playwright/test";
import { asPersona, go, openDemo } from "./helpers";

// Bad input on every form: the UI stops it with a plain message, and the server refuses it too.
test("/new: empty, invalid and too-long fields show inline messages", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(page.getByText("Give the project a name")).toBeVisible();
  await page.getByLabel("Project name").fill("   ");
  await page.getByLabel("One-line description").fill("short");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(page.getByText("One line, at least 8 characters")).toBeVisible();
  await page.getByLabel("Project name").fill("x".repeat(80));
  await expect(page.getByText("At most 60 characters")).toBeVisible();
});

test("server refuses bad input with friendly 4xx messages, never a 500", async ({ page, context }) => {
  const slug = await openDemo(page);
  const api = `/api/projects/${slug}`;
  await asPersona(context, "arjun");
  const cases: { name: string; res: () => Promise<import("@playwright/test").APIResponse>; status: number; text: RegExp }[] = [
    { name: "empty question", res: () => page.request.post(`${api}/ask`, { data: { question: "   " } }), status: 400, text: /at least 3 characters/ },
    { name: "huge question", res: () => page.request.post(`${api}/ask`, { data: { question: "q".repeat(600) } }), status: 400, text: /under 500 characters/ },
    { name: "not JSON", res: () => page.request.post(`${api}/ask`, { headers: { "content-type": "application/json" }, data: Buffer.from("{oops") }), status: 400, text: /JSON/ },
    { name: "follow-up without text", res: () => page.request.post(`${api}/followups`, { data: { section: "General", question: "" } }), status: 400, text: /.+/ },
  ];
  for (const c of cases) {
    const r = await c.res();
    expect(r.status(), c.name).toBe(c.status);
    expect(JSON.stringify(await r.json()), c.name).toMatch(c.text);
  }
  await asPersona(context, "meera");
  const meera = [
    { name: "short interview answer", res: () => page.request.post(`${api}/gap-questions/does-not-exist/answer`, { data: { answer: "x" } }), status: 400 },
    { name: "bad GitHub URL", res: () => page.request.post(`${api}/sources/github`, { data: { url: "not a repo url!" } }), status: 400 },
    { name: "wrong file type", res: () => page.request.post(`${api}/sources`, { multipart: { files: { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } } }), status: 400 },
    { name: "empty file", res: () => page.request.post(`${api}/sources`, { multipart: { files: { name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("") } } }), status: 400 },
    { name: "not a Slack ZIP", res: () => page.request.post(`${api}/sources/slack-export`, { multipart: { file: { name: "x.zip", mimeType: "application/zip", buffer: Buffer.from("hello") } } }), status: 400 },
    { name: "unknown claim", res: () => page.request.patch(`${api}/claims/nope`, { data: { title: "A new title" } }), status: 404 },
  ];
  for (const c of meera) expect((await c.res()).status(), c.name).toBe(c.status);
});

test("Ask the handover: whitespace cannot be submitted; approve needs an override note", async ({ page, context }) => {
  const slug = await openDemo(page);
  await asPersona(context, "arjun");
  await go(page, `/p/${slug}/ask`);
  await page.locator("[data-ask-input]").first().fill("   ");
  await expect(page.locator("[data-ask-submit]").first()).toBeDisabled();

  await asPersona(context, "rao");
  await go(page, `/p/${slug}/review`);
  await page.locator('[data-tour="approve"]').click();
  const dialog = page.getByRole("dialog");
  const approve = dialog.getByRole("button", { name: /^Approve/ });
  await expect(approve).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("textbox").first().fill("too short");
  await expect(approve).toBeDisabled();
});
