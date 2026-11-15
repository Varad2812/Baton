import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// QA suite against an ALREADY RUNNING production server (default http://localhost:3000):
//   npm run build && LLM_DISABLED=1 PORT=3000 npm start      (LLM_DISABLED skips Gemini; Groq is allowed)
//   npm run qa
const base = process.env.QA_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/qa",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: base,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
