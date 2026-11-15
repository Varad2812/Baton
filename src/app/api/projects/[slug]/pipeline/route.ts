import { z } from "zod";
import { assertCan, getActor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { errorResponse, handle, projectBySlug, readJson } from "@/lib/http";
import { cacheHasProject } from "@/lib/pipeline/cache";
import { defaultMode, PipelineUnavailableError, runPipeline } from "@/lib/pipeline/run";
import type { StageEvent } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ slug: string }> };

const Body = z.object({
  mode: z.enum(["LIVE", "CACHED"]).optional(),
  budget: z.number().int().min(1).max(80).optional(),
  /** Run row created by the /new wizard's startPipeline action. */
  runId: z.string().trim().min(1).max(64).optional(),
});

/**
 * Run the pipeline and stream progress as Server-Sent Events:
 *   data: {"stage":"extract","status":"running","counts":{"batches":7,"done":2}}
 * The last event is {"stage":"done",...} or {"stage":"error",...}.
 */
export async function POST(req: Request, { params }: Ctx) {
  let project, actor, body;
  try {
    const { slug } = await params;
    project = await projectBySlug(slug);
    actor = await getActor(slug);
    assertCan(actor, "connect_sources");
    body = await readJson(req, Body);
    if (body.mode === "CACHED" && !cacheHasProject(project.slug)) {
      throw new PipelineUnavailableError("There is no cached result for this project. Run it live instead.");
    }
  } catch (e) {
    return errorResponse(e);
  }

  const enc = new TextEncoder();
  const mode = body.mode ?? defaultMode(project.slug);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let terminal = false;
      const send = (e: StageEvent) => {
        if (e.stage === "done" || e.stage === "error") terminal = true;
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(enc.encode(`: keep-alive\n\n`));
          } catch {
            closed = true;
          }
        }
      }, 15_000);
      try {
        await runPipeline(project.id, { mode, actor, emit: send, budget: body.budget, runId: body.runId });
      } catch (e) {
        // runPipeline emits its own error event once a run exists; cover failures before that.
        if (!terminal) {
          const code = e instanceof PipelineUnavailableError ? e.code : undefined;
          send({ stage: "error", status: "error", message: (e as Error)?.message || "Pipeline failed", ...(code ? { code } : {}) });
        }
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Latest run (for the stepper after a reload) and the default mode for this project. */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const run = await prisma.pipelineRun.findFirst({
      where: { projectId: project.id },
      orderBy: { startedAt: "desc" },
    });
    return { run, defaultMode: defaultMode(project.slug) };
  });
}
