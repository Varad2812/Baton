import { prisma } from "@/lib/db";

export type RunSummary = {
  mode: "LIVE" | "CACHED";
  model: string;
  calls: number;
  ms: number | null;
  /** A LIVE run was requested but the model was unavailable (quota, key, timeout). */
  fellBack: boolean;
};

/** Mode, model, network call count and wall time of a pipeline run (calls come from its audit row). */
export async function runSummary(
  run: { id: string; mode: string; model: string; startedAt: Date; finishedAt: Date | null; error: string | null } | null,
): Promise<RunSummary | null> {
  if (!run) return null;
  const audit = await prisma.auditLog.findFirst({ where: { action: "pipeline.run", targetId: run.id }, select: { meta: true } });
  const meta = (audit?.meta ?? {}) as { llmCalls?: number; ms?: number; requested?: string };
  return {
    mode: run.mode === "LIVE" ? "LIVE" : "CACHED",
    model: run.model,
    calls: meta.llmCalls ?? 0,
    ms: meta.ms ?? (run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null),
    fellBack: run.mode === "CACHED" && (meta.requested === "LIVE" || !!run.error),
  };
}
