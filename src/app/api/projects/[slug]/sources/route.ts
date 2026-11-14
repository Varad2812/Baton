import { getActor } from "@/lib/authz";
import { BadRequestError, handle, projectBySlug } from "@/lib/http";
import type { UploadFile } from "@/lib/pipeline/ingest/files";
import { uploadSources } from "@/lib/pipeline/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Upload files (OWNER). multipart/form-data:
 *   files: File[] (.md .txt .csv .json .docx, max 10 x 2 MB)
 *   access: PUBLIC | TEAM | RESTRICTED (default TEAM)
 *   authoritative: "true" | "false"
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    const form = await req.formData().catch(() => {
      throw new BadRequestError("Send the files as multipart/form-data");
    });
    const files: UploadFile[] = [];
    for (const v of form.getAll("files")) {
      if (typeof v === "string") continue;
      files.push({ name: v.name, bytes: new Uint8Array(await v.arrayBuffer()) });
    }
    const access = form.get("access");
    const result = await uploadSources(actor, project.id, files, {
      access: typeof access === "string" && access ? access : undefined,
      authoritative: form.get("authoritative") === "true",
    });
    return result;
  }, { status: 201 });
}
