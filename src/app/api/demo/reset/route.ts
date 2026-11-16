import { prisma } from "@/lib/db";
import { getActor, writeAudit } from "@/lib/authz";
import { resetSandbox } from "@/lib/sandbox";
import { festflowCounts } from "@/lib/seed/festflow";
import { rateLimit } from "@/lib/server/rate-limit";
import { getVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MS = 60_000;
const MAX_RESETS = 20;
const g = globalThis as unknown as { __batonResetting?: Set<string> };
const resetting = (g.__batonResetting ??= new Set());

// No auth on purpose: anyone can restore THEIR OWN copy of the demo in one click. Other visitors'
// copies and the template are never touched. At most 20 resets per minute per visitor.
export async function POST() {
  const vid = await getVisitorId();
  if (!vid) return Response.json({ ok: false, error: "Your browser blocked the demo cookie. Allow cookies for this site and retry." }, { status: 400 });
  const wait = resetting.has(vid) ? 5 : rateLimit("demo.reset", vid, MAX_RESETS, WINDOW_MS);
  if (wait) {
    return Response.json(
      { ok: false, error: "Your demo was reset several times in a row. Try again in a few seconds.", retryAfter: wait },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  const t0 = Date.now();
  resetting.add(vid);
  try {
    const project = await resetSandbox(vid);
    const counts = await festflowCounts(prisma, project.id);
    const actor = await getActor(project.slug);
    await writeAudit(prisma, {
      projectId: project.id,
      actor,
      action: "demo.reset",
      targetType: "Project",
      targetId: project.id,
      meta: { ms: Date.now() - t0 },
    });
    return Response.json({ ok: true, slug: project.slug, counts, ms: Date.now() - t0 });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "demo reset failed", error: (e as Error)?.message }));
    return Response.json({ ok: false, error: "Reset failed. Please retry." }, { status: 500 });
  } finally {
    resetting.delete(vid);
  }
}
