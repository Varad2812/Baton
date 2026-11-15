import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// E2E against a production build on :3100, fully offline (LLM_DISABLED=1: cache + deterministic
// fallbacks, never a Gemini call). It uses the DATABASE_URL from .env and resets the FestFlow demo
// before and after the run. E2E_SKIP_BUILD=1 reuses an existing .next build.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? `npx next start -p ${PORT}` : `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 420_000,
    reuseExistingServer: false,
    env: { LLM_DISABLED: "1", GROQ_API_KEY: process.env.E2E_GROQ ? (process.env.GROQ_API_KEY ?? "") : "", NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}` },
    stdout: "ignore",
    stderr: "pipe",
  },
});
