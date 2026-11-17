// Screenshot sweep: every page x 4 personas x 1440 / 390 px, against a running server.
//   npx tsx scripts/screenshots.ts [baseURL] [outDir] [--readme]
// --readme writes only the handful of shots the README uses (docs/screens). WebGL via SwiftShader.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3200";
const out = process.argv[3] ?? "docs/screens";
const readme = process.argv.includes("--readme");
const PERSONAS = ["meera", "rao", "arjun", "kabir"] as const;
const PAGES = ["", "/sources", "/ledger", "/conflicts", "/interview", "/review", "/handover", "/ask", "/radar", "/trust"];
const README: { name: string; persona: (typeof PERSONAS)[number]; path: string; width: number; before?: string }[] = [
  { name: "landing", persona: "meera", path: "/", width: 1440 },
  { name: "dashboard", persona: "meera", path: "", width: 1440 },
  { name: "evidence-drawer", persona: "rao", path: "/ledger?claim=clm_auth_supabase", width: 1440 },
  { name: "conflicts", persona: "rao", path: "/conflicts", width: 1440 },
  { name: "ask-the-handover", persona: "arjun", path: "/ask?q=Which%20service%20sends%20the%20emails%3F", width: 1440, before: "ask" },
  { name: "knowledge-at-risk", persona: "meera", path: "/radar", width: 1440 },
  { name: "handover", persona: "arjun", path: "/handover", width: 1440 },
  { name: "trust", persona: "rao", path: "/trust", width: 1440 },
  { name: "dashboard-mobile", persona: "arjun", path: "", width: 390 },
];

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const origin = new URL(base).origin;
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "baton.welcome.v1", value: '{"choice":"screens"}' }, { name: "baton.guide.open", value: "0" }] }] } });
  const page = await ctx.newPage();
  await page.goto(`${base}/p/festflow`);
  await page.locator("main h1").first().waitFor({ timeout: 90_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];
  const shot = async (persona: string, p: string, width: number, file: string, before?: string) => {
    await ctx.addCookies([{ name: "baton_persona", value: persona, url: base }]);
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto(p === "/" ? `${base}/` : `${base}/p/${slug}${p}`);
    await page.locator("h1").first().waitFor({ timeout: 60_000 });
    if (before === "ask") {
      await page.locator("[data-ask-submit]").first().click();
      await page.locator("[data-ask-answer], [data-ask-refusal]").first().waitFor({ timeout: 30_000 });
    }
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(out, file), fullPage: !readme });
  };
  if (readme) {
    for (const s of README) await shot(s.persona, s.path, s.width, `${s.name}.png`, s.before);
  } else {
    for (const persona of PERSONAS)
      for (const p of PAGES)
        for (const w of [1440, 390]) await shot(persona, p, w, `${persona}${p.replace(/\//g, "-") || "-dashboard"}-${w}.png`);
  }
  await browser.close();
  console.log(`screenshots written to ${out} (visitor copy ${slug})`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
