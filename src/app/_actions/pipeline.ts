"use server";

// PLACEHOLDERS: connect after merging the "pipeline" branch.
import { z } from "zod";
import { assertCan, getActor } from "@/lib/authz";
import { errorResult, pendingResult, type ActionResult } from "@/lib/action-result";

const Slug = z.string().min(1).max(64);

export async function runPipeline(input: { slug: string; mode: "CACHED" | "LIVE" }): Promise<ActionResult> {
  try {
    z.object({ slug: Slug, mode: z.enum(["CACHED", "LIVE"]) }).parse(input);
    assertCan(await getActor(), "connect_sources");
    return pendingResult("Running the pipeline");
  } catch (e) {
    return errorResult(e);
  }
}

export async function addGithubSource(input: { slug: string; url: string }): Promise<ActionResult> {
  try {
    z.object({ slug: Slug, url: z.string().url().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/, "Use https://github.com/owner/repo") }).parse(input);
    assertCan(await getActor(), "connect_sources");
    return pendingResult("Importing a GitHub repository");
  } catch (e) {
    return errorResult(e);
  }
}

export async function uploadSources(input: { slug: string; files: { name: string; size: number }[] }): Promise<ActionResult> {
  try {
    z.object({
      slug: Slug,
      files: z.array(z.object({ name: z.string().regex(/\.(md|txt|csv|json|docx)$/i, "Unsupported file type"), size: z.number().max(5_000_000) })).min(1).max(20),
    }).parse(input);
    assertCan(await getActor(), "connect_sources");
    return pendingResult("Uploading sources");
  } catch (e) {
    return errorResult(e);
  }
}

export async function labelSource(input: { sourceId: string; access: "PUBLIC" | "TEAM" | "RESTRICTED" }): Promise<ActionResult> {
  try {
    z.object({ sourceId: z.string().min(1), access: z.enum(["PUBLIC", "TEAM", "RESTRICTED"]) }).parse(input);
    assertCan(await getActor(), "label_sources");
    return pendingResult("Relabelling a source");
  } catch (e) {
    return errorResult(e);
  }
}

export async function grantSourceToIncoming(input: { sourceId: string; granted: boolean }): Promise<ActionResult> {
  try {
    z.object({ sourceId: z.string().min(1), granted: z.boolean() }).parse(input);
    assertCan(await getActor(), "label_sources");
    return pendingResult("Granting a restricted source");
  } catch (e) {
    return errorResult(e);
  }
}
