import { health } from "@/lib/server/health";

export const dynamic = "force-dynamic";

/** Liveness + configuration (no secrets): db, LLM engines configured, Slack/GitHub config, version. */
export async function GET() {
  const h = await health();
  // Always 200 so a short DB blip does not make the platform restart the service; `ok` and `db` say what is wrong.
  return Response.json(h);
}
