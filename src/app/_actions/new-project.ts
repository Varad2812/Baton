"use server";

// PLACEHOLDERS for the /new wizard: connect after merging the "pipeline" branch.
// Each one validates its input with the same zod schemas the wizard uses, then returns
// { ok: false, pending: true, reason: "will work after merge" } without writing anything.
// The exact contract the merge session must implement is in PROGRESS.md ("/new wizard").
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

const PENDING = { ok: false as const, pending: true, reason: "will work after merge" };

function invalid(e: unknown): NewProjectResult<never> {
  if (e instanceof z.ZodError) {
    const fieldErrors = fieldErrorsOf(e);
    const [key, msg] = Object.entries(fieldErrors)[0] ?? ["input", "Invalid input"];
    return { ok: false, reason: `${key}: ${msg}`, fieldErrors };
  }
  console.error(e);
  return { ok: false, reason: "Something went wrong. Please retry." };
}

/**
 * Creates the Project, its three Person rows and a DRAFT Handover (departing → incoming, reviewer).
 * After merge: returns { ok: true, projectId, slug }.
 */
export async function createProject(
  input: CreateProjectInput,
): Promise<NewProjectResult<{ projectId: string; slug: string }>> {
  try {
    CreateProjectInput.parse(input);
    return PENDING;
  } catch (e) {
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
 * request stays under the server-action body limit.
 * After merge: returns { ok: true, sources: [{ id, title, kind, access }] }.
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
    return PENDING;
  } catch (e) {
    return invalid(e);
  }
}

/**
 * Creates a PipelineRun (mode LIVE, falls back to CACHED) and returns where to stream it from.
 * After merge: returns { ok: true, runId, streamUrl: `/api/projects/${slug}/pipeline` }; the wizard
 * then POSTs to streamUrl and reads SSE events `{ stage, status, counts, ms }`.
 */
export async function startPipeline(
  input: StartPipelineInput,
): Promise<NewProjectResult<{ runId: string; streamUrl: string }>> {
  try {
    StartPipelineInput.parse(input);
    return PENDING;
  } catch (e) {
    return invalid(e);
  }
}
