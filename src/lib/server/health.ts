// Health facts shared by GET /api/health and the /status page.
import { prisma } from "@/lib/db";
import { geminiApiKey, geminiModel, groqApiKey, groqModel, llmDisabled } from "@/lib/llm";
import { slackConfig } from "@/lib/connectors/slack/service";
import pkg from "../../../package.json";

const started = Date.now();

export async function health() {
  const t0 = Date.now();
  let db = false;
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5_000))]);
    db = true;
  } catch {
    db = false;
  }
  return {
    ok: db,
    db,
    dbMs: Date.now() - t0,
    version: (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) || pkg.version,
    uptimeS: Math.round((Date.now() - started) / 1000),
    llm: {
      chain: ["groq", "gemini", "offline"],
      groq: groqApiKey() ? groqModel() : null,
      gemini: geminiApiKey() && !llmDisabled() ? geminiModel() : null,
      offline: true,
    },
    slack: slackConfig(),
    github: { token: !!process.env.GITHUB_TOKEN?.trim(), webhook: !!process.env.GITHUB_WEBHOOK_SECRET?.trim() },
  };
}
