import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// "Judge alone" suite: a first-time visitor with no setup, against a running server.
//   local:      npm run build && LLM_DISABLED=1 PORT=3200 npm start; JUDGE_BASE_URL=http://localhost:3200 npm run judge
//   production: JUDGE_BASE_URL=https://baton-qxyj.onrender.com npm run judge
// Every test starts as a NEW visitor (fresh browser context = its own private copy of the demo), so it
// works the same against production and never touches other visitors' data.
const base = process.env.JUDGE_BASE_URL ?? "http://localhost:3200";
const remote = !/localhost|127\.0\.0\.1/.test(base);

export default defineConfig({
  testDir: "tests/judge",
  fullyParallel: false,
  workers: 1,
  retries: remote ? 1 : 0,
  timeout: remote ? 300_000 : 180_000,
  expect: { timeout: remote ? 45_000 : 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: base,
    // A judge would click a choice in the first-visit welcome; the suite starts past it (09 checks it).
    storageState: { cookies: [], origins: [{ origin: new URL(base).origin, localStorage: [{ name: "baton.welcome.v1", value: '{"choice":"judge-suite"}' }] }] },
    viewport: { width: 1440, height: 900 },
    actionTimeout: remote ? 45_000 : 20_000,
    navigationTimeout: remote ? 120_000 : 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
