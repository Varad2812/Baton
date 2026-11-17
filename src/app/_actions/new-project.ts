"use server";

// Server actions for the /new wizard. Contract (kept stable for the wizard): PROGRESS.md "/new wizard".
// There is no login: whoever creates a project acts as its departing OWNER, so createProject sets
// the persona cookie to the owner persona. Every later call still goes through getActor + assertCan,
// and uploads go through the same ingest + redaction as the Sources page (secrets never stored).
import { cookies } from "next/headers";
import { z } from "zod";
import {
  ACCESS,
  ALLOWED_EXT,
  CreateProjectInput,
  GithubUrlSchema,
  MAX_FILE_BYTES,
  MAX_FILES,
  SlugSchema,
  StartPipelineInput,
  extOf,
  fieldErrorsOf,
  type NewProjectResult,
} from "@/components/new-project/schema";
import { assertCan, ForbiddenError, getActor, PERSONA_COOKIE, PERSONAS, personaHandle, writeAudit, type PersonaKey } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { cacheHasProject } from "@/lib/pipeline/cache";
import { PROJECT_TTL_MS, resolveProject } from "@/lib/sandbox";
import { getVisitorId } from "@/lib/visitor";
import type { UploadFile } from "@/lib/pipeline/ingest/files";
import { importGithub, uploadSources as uploadFn } from "@/lib/pipeline/sources";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

const TEN_MIN = 10 * 60_000;

function invalid(e: unknown): NewProjectResult<never> {
  if (e instanceof z.ZodError) {
    const fieldErrors = fieldErrorsOf(e);
    const [key, msg] = Object.entries(fieldErrors)[0] ?? ["input", "Invalid input"];
    return { ok: false, reason: `${key}: ${msg}`, fieldErrors };
  }
  if (e instanceof ForbiddenError) {
    return { ok: false, reason: `You're viewing as a ${e.role.toLowerCase()}, who can't ${e.action.replace(/_/g, " ")}. Switch to the departing owner and retry.` };
  }
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 500 && e instanceof Error) return { ok: false, reason: e.message };
  console.error(e);
  return { ok: false, reason: "Something went wrong. Please retry." };
}

async function limited(bucket: string, max: number): Promise<NewProjectResult<never> | null> {
  const wait = rateLimit(bucket, await clientIp(), max, TEN_MIN);
  return wait ? { ok: false, reason: `Too many requests. Try again in ${wait > 90 ? `${Math.ceil(wait / 60)} min` : `${wait} s`}.` } : null;
}

/** Identity-map handles for a person typed into the People step (chat authors often use first names). */
function handlesFor(key: PersonaKey, name: string): string[] {
  const n = name.trim();
  const first = n.split(/\s+/).find((w) => !/\.$/.test(w)) ?? n; // skip "Dr." / "Prof."
  return [...new Set([personaHandle(key), n, n.toLowerCase(), first.toLowerCase()])];
}

/**
 * Creates the Project, its three Person rows (each mapped to a demo persona: departing = owner,
 * incoming = successor, reviewer) and a DRAFT Handover. AuditLog "project.create".
 */
export async function createProject(
  input: CreateProjectInput,
): Promise<NewProjectResult<{ projectId: string; slug: string }>> {
  try {
    const p = CreateProjectInput.parse(input);
    const rl = await limited("new.project", 6);
    if (rl) return rl;
    if (await prisma.project.findUnique({ where: { slug: p.slug }, select: { id: true } })) {
      return { ok: false, reason: `/p/${p.slug} is already taken. Pick another slug.`, fieldErrors: { slug: "Taken" } };
    }
    const owner = { ...PERSONAS.meera, name: p.people.departing.name, roleTitle: p.people.departing.roleTitle };
    // The project is private to the browser that created it (anonymous visitor cookie).
    const visitorId = await getVisitorId();

    const project = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { slug: p.slug, name: p.name, description: p.description, kind: "STANDARD", visitorId, expiresAt: visitorId ? new Date(Date.now() + PROJECT_TTL_MS) : null },
      });
      const mk = (key: PersonaKey, person: { name: string; roleTitle: string }) =>
        tx.person.create({ data: { projectId: project.id, name: person.name, roleTitle: person.roleTitle, handles: handlesFor(key, person.name) } });
      const from = await mk("meera", p.people.departing);
      const to = await mk("arjun", p.people.incoming);
      const reviewer = await mk("rao", p.people.reviewer);
      const handover = await tx.handover.create({
        data: { projectId: project.id, fromPersonId: from.id, toPersonId: to.id, reviewerPersonId: reviewer.id, status: "DRAFT" },
      });
      await writeAudit(tx, {
        projectId: project.id,
        actor: owner,
        action: "project.create",
        targetType: "Project",
        targetId: project.id,
        meta: { slug: p.slug, handoverId: handover.id, people: { departing: from.name, incoming: to.name, reviewer: reviewer.name }, via: "new-wizard" },
      });
      return project;
    });

    // The creator acts as the departing owner from here on (they can switch persona in the top bar).
    (await cookies()).set(PERSONA_COOKIE, "meera", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
    return { ok: true, projectId: project.id, slug: project.slug };
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return { ok: false, reason: "That slug was just taken. Pick another.", fieldErrors: { slug: "Taken" } };
    return invalid(e);
  }
}

const UploadForm = z.object({
  slug: SlugSchema,
  files: z
    .array(
      z.object({
        name: z.string().refine((n) => (ALLOWED_EXT as readonly string[]).includes(extOf(n)), "Unsupported file type"),
        size: z.number().int().positive("Empty file").max(MAX_FILE_BYTES, "Larger than 5 MB"),
      }),
    )
    .max(MAX_FILES, `At most ${MAX_FILES} files`),
  access: z.array(z.enum(ACCESS)),
  githubUrl: GithubUrlSchema.optional(),
});

/**
 * FormData fields: `slug`, `files` (File, repeatable), `access` (repeatable, same order as `files`:
 * PUBLIC | TEAM | RESTRICTED), optional `githubUrl`. The wizard sends one file per call so each
 * request stays under the server-action body limit. Kind is re-detected on the server; every file is
 * chunked and redacted before it is stored. GitHub imports are PUBLIC.
 */
export async function uploadSources(
  formData: FormData,
): Promise<NewProjectResult<{ sources: { id: string; title: string; kind: string; access: string }[] }>> {
  try {
    const files = formData.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
    const github = formData.get("githubUrl");
    const parsed = UploadForm.parse({
      slug: formData.get("slug"),
      files: files.map((f) => ({ name: f.name, size: f.size })),
      access: formData.getAll("access"),
      githubUrl: typeof github === "string" && github ? github : undefined,
    });
    if (parsed.access.length !== parsed.files.length) throw new z.ZodError([{ code: "custom", path: ["access"], message: "One access label per file", input: parsed.access }]);
    if (!parsed.files.length && !parsed.githubUrl) throw new z.ZodError([{ code: "custom", path: ["files"], message: "Add at least one file or a GitHub URL", input: [] }]);

    const actor = await getActor(parsed.slug);
    assertCan(actor, "connect_sources");
    const project = await resolveProject(parsed.slug);
    if (!project) return { ok: false, reason: `Project /p/${parsed.slug} does not exist yet. Go back and retry the build.` };
    const rl = await limited("new.upload", 80);
    if (rl) return rl;

    const ids: string[] = [];
    // Group by access label so each group is one ingest call (the wizard sends one file anyway).
    for (const access of ACCESS) {
      const group: UploadFile[] = [];
      for (const [i, f] of files.entries()) {
        if (parsed.access[i] === access) group.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      }
      if (!group.length) continue;
      const r = await uploadFn(actor, project.id, group, { access, authoritative: false });
      ids.push(...r.sourceIds);
    }
    if (parsed.githubUrl) {
      const r = await importGithub(actor, project.id, { url: parsed.githubUrl, access: "PUBLIC" });
      ids.push(...r.sourceIds);
    }

    const sources = await prisma.source.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, kind: true, access: true },
      orderBy: { createdAt: "asc" },
    });
    return { ok: true, sources };
  } catch (e) {
    return invalid(e);
  }
}

/**
 * Creates a RUNNING PipelineRun for the project and returns where to stream it from. The wizard
 * POSTs `{ runId, mode }` to streamUrl and reads SSE events `{ stage, status, counts, ms }`; the
 * route adopts this run row. If the model is unavailable the stream ends with
 * `{ stage: "error", code: "LLM_UNAVAILABLE" }` and the uploaded sources stay saved.
 */
export async function startPipeline(
  input: StartPipelineInput,
): Promise<NewProjectResult<{ runId: string; streamUrl: string }>> {
  try {
    const { slug, mode } = StartPipelineInput.parse(input);
    const actor = await getActor(slug);
    assertCan(actor, "connect_sources");
    const project = await resolveProject(slug);
    if (!project) return { ok: false, reason: `Project /p/${slug} does not exist.` };
    if (mode === "CACHED" && !cacheHasProject(slug)) return { ok: false, reason: "There is no cached result for this project. Run it live instead." };
    const chunks = await prisma.chunk.count({ where: { source: { projectId: project.id } } });
    if (!chunks) return { ok: false, reason: "No readable text was saved from your sources. Add a file with text and retry." };
    const busy = await prisma.pipelineRun.findFirst({
      where: { projectId: project.id, status: "RUNNING", startedAt: { gt: new Date(Date.now() - 5 * 60_000) } },
      select: { id: true },
    });
    if (busy) return { ok: false, reason: "A run is already in progress for this project. Wait a minute and retry." };
    const rl = await limited("new.run", 12);
    if (rl) return rl;

    let run;
    try {
      run = await prisma.pipelineRun.create({
        data: { projectId: project.id, mode, status: "RUNNING", stages: [], model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash" },
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") return { ok: false, reason: "A run is already in progress for this project. Wait a minute and retry." };
      throw e;
    }
    return { ok: true, runId: run.id, streamUrl: `/api/projects/${slug}/pipeline` };
  } catch (e) {
    return invalid(e);
  }
}
