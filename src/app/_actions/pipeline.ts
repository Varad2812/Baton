"use server";

// The pipeline run itself streams over SSE from POST /api/projects/[slug]/pipeline (a Server Action
// cannot stream), so it has no action here.
import { refresh } from "next/cache";
import { projectPersonas } from "@/lib/authz";
import { z } from "zod";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import type { UploadFile } from "@/lib/pipeline/ingest/files";
import { importGithub, labelSource as labelFn, uploadSources as uploadFn } from "@/lib/pipeline/sources";
import { actionContext } from "@/lib/server/action-context";

const GithubInput = z.object({
  slug: z.string(),
  url: z.string().trim().regex(/^(https:\/\/github\.com\/)?[\w.-]+\/[\w.-]+\/?$/, "Use https://github.com/owner/repo"),
});

export async function addGithubSource(input: z.input<typeof GithubInput>): Promise<ActionResult> {
  try {
    const v = GithubInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "connect_sources");
    const r = await importGithub(actor, project.id, { url: v.url });
    refresh();
    return okResult(`Imported ${r.repo}: ${r.sources} sources, ${r.chunks} chunks, ${r.redactions} redactions. Run the pipeline to extract claims.`);
  } catch (e) {
    return errorResult(e);
  }
}

const FileName = z.string().regex(/\.(md|markdown|txt|csv|json|docx|pdf|zip)$/i, "Unsupported file type (use .md .txt .csv .json .docx .pdf, or a Slack export .zip)");

export async function uploadSources(slug: string, form: FormData): Promise<ActionResult> {
  try {
    const { actor, project } = await actionContext(slug, "connect_sources");
    const files: UploadFile[] = [];
    for (const v of form.getAll("files")) {
      if (typeof v === "string") continue;
      FileName.parse(v.name);
      files.push({ name: v.name, bytes: new Uint8Array(await v.arrayBuffer()) });
    }
    const access = z.enum(["PUBLIC", "TEAM", "RESTRICTED"]).optional().parse(form.get("access") || undefined);
    const r = await uploadFn(actor, project.id, files, { access, authoritative: form.get("authoritative") === "true" });
    refresh();
    return okResult(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}: ${r.sources} sources, ${r.chunks} chunks, ${r.redactions} redactions before storage.`);
  } catch (e) {
    return errorResult(e);
  }
}

const LabelInput = z.object({ slug: z.string(), sourceId: z.string().min(1), access: z.enum(["PUBLIC", "TEAM", "RESTRICTED"]) });

export async function labelSource(input: z.input<typeof LabelInput>): Promise<ActionResult> {
  try {
    const v = LabelInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "label_sources");
    const r = await labelFn(actor, project.id, v.sourceId, { access: v.access });
    refresh();
    return okResult(`Access set to ${v.access.toLowerCase()}. Chunks inherit it; ${r.regraded} claim${r.regraded === 1 ? "" : "s"} re-graded.`);
  } catch (e) {
    return errorResult(e);
  }
}

const GrantInput = z.object({ slug: z.string(), sourceId: z.string().min(1), granted: z.boolean() });

export async function grantSourceToIncoming(input: z.input<typeof GrantInput>): Promise<ActionResult> {
  try {
    const v = GrantInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "label_sources");
    await labelFn(actor, project.id, v.sourceId, { grantedToIncoming: v.granted });
    refresh();
    const ppl = await projectPersonas(v.slug); const first = (k: "meera" | "arjun" | "rao") => ppl[k].name.split(" ")[0];
    return okResult(v.granted ? `${first("arjun")} (incoming) can now see claims from this restricted source.` : `Grant revoked. Claims from this source are hidden from ${first("arjun")} again.`);
  } catch (e) {
    return errorResult(e);
  }
}
