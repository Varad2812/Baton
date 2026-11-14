import { prisma } from "@/lib/db";
import { getActor, writeAudit } from "@/lib/authz";
import { resetFestflow } from "@/lib/seed/festflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOLDOWN_MS = 10_000;
const g = globalThis as unknown as { __batonLastReset?: number; __batonResetting?: boolean };

// No auth on purpose: judges must be able to restore the demo in one click.
// Rate-limited to one reset per 10 seconds per server instance.
export async function POST() {
  const now = Date.now();
  const since = now - (g.__batonLastReset ?? 0);
  if (g.__batonResetting || since < COOLDOWN_MS) {
    const retry = Math.max(1, Math.ceil((COOLDOWN_MS - since) / 1000));
    return Response.json(
      { ok: false, error: "Demo was just reset. Try again in a few seconds.", retryAfter: retry },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }
  g.__batonLastReset = now;
  g.__batonResetting = true;
  try {
    const counts = await resetFestflow(prisma);
    const actor = await getActor();
    const project = await prisma.project.findUniqueOrThrow({ where: { slug: "festflow" }, select: { id: true } });
    await writeAudit(prisma, {
      projectId: project.id,
      actor,
      action: "demo.reset",
      targetType: "Project",
      targetId: project.id,
      meta: { ms: Date.now() - now },
    });
    return Response.json({ ok: true, counts, ms: Date.now() - now });
  } catch (e) {
    console.error("demo reset failed", e);
    return Response.json({ ok: false, error: "Reset failed. Please retry." }, { status: 500 });
  } finally {
    g.__batonResetting = false;
  }
}
