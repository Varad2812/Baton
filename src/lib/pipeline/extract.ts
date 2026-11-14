// Extract stage: batches of chunks -> candidate claims with verbatim evidence quotes.
// Pure: batching + prompt building. LLM wrapper: extractBatch().

import { z } from "zod";
import type { ClaimType } from "@/generated/prisma/enums";
import { llmJson, type LlmRunCtx } from "@/lib/llm";
import { CHECKLIST, CHECKLIST_KEYS, SECTIONS } from "./checklist";
import type { PChunk, PPerson, PSource } from "./types";

export const CLAIM_TYPES = [
  "DECISION",
  "TASK",
  "RISK",
  "DEPENDENCY",
  "CONTACT",
  "QUESTION",
  "RECURRING",
] as const satisfies readonly ClaimType[];

export const BATCH_MAX_CHARS = 12_000;

export type ExtractBatch = {
  id: string;
  group: string;
  restricted: boolean;
  chunkIds: string[];
  chars: number;
};

function groupOf(src: PSource): string {
  switch (src.kind) {
    case "GITHUB_COMMIT":
      return "commits";
    case "GITHUB_PR":
      return "pulls";
    case "GITHUB_ISSUE":
      return "issues";
    case "CHAT":
      return `chat:${src.id}`;
    case "TASKS":
      return "tasks";
    default:
      return "docs";
  }
}

/**
 * Group chunks by source family and pack into batches of <= maxChars.
 * RESTRICTED chunks are never mixed with anything else, so a claim can never
 * cite RESTRICTED and non-RESTRICTED text from the same model call.
 * TESTIMONY is excluded: it enters through the gap interview, not extraction.
 */
export function batchChunks(chunks: PChunk[], sources: PSource[], maxChars = BATCH_MAX_CHARS): ExtractBatch[] {
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const groups = new Map<string, { restricted: boolean; chunks: PChunk[] }>();
  const ordered = [...chunks].sort((a, b) => {
    const sa = srcById.get(a.sourceId);
    const sb = srcById.get(b.sourceId);
    return (
      (sa?.createdAt ?? "").localeCompare(sb?.createdAt ?? "") ||
      a.sourceId.localeCompare(b.sourceId) ||
      a.ordinal - b.ordinal
    );
  });
  for (const c of ordered) {
    const s = srcById.get(c.sourceId);
    if (!s || s.kind === "TESTIMONY") continue;
    const restricted = c.access === "RESTRICTED";
    const key = `${restricted ? "restricted:" : ""}${groupOf(s)}`;
    const g = groups.get(key) ?? { restricted, chunks: [] };
    g.chunks.push(c);
    groups.set(key, g);
  }

  const batches: ExtractBatch[] = [];
  for (const [group, g] of groups) {
    let cur: PChunk[] = [];
    let len = 0;
    const flush = () => {
      if (!cur.length) return;
      batches.push({
        id: `b${batches.length + 1}`,
        group,
        restricted: g.restricted,
        chunkIds: cur.map((c) => c.id),
        chars: len,
      });
      cur = [];
      len = 0;
    };
    for (const c of g.chunks) {
      if (cur.length && len + c.text.length > maxChars) flush();
      cur.push(c);
      len += c.text.length;
    }
    flush();
  }
  return batches;
}

/* ------------------------------------------------------------------------- */
/* Schema + prompt                                                            */
/* ------------------------------------------------------------------------- */

export const ExtractedEvidenceSchema = z.object({
  chunkId: z.string().describe("id attribute of the <chunk> the quote is copied from"),
  quote: z
    .string()
    .describe("8-200 characters copied EXACTLY from that chunk's text: one contiguous span, no ellipsis, no paraphrase"),
  relation: z.enum(["SUPPORTS", "CONTRADICTS"]),
});

export const ExtractedClaimSchema = z.object({
  type: z.enum(CLAIM_TYPES),
  title: z.string().describe("<= 90 chars, specific, e.g. 'Auth moved from Firebase to Supabase on 12 Mar'"),
  statement: z.string().describe("1-3 sentences with the concrete facts (who, what, when, why)"),
  topicKey: z
    .string()
    .describe("snake_case subject key shared by every claim about the same subject, e.g. auth_provider, payment_gateway"),
  section: z.enum(SECTIONS),
  checklistKeys: z.array(z.enum(CHECKLIST_KEYS)).describe("checklist items this claim directly satisfies; usually 0-2"),
  owner: z.string().describe("name of the responsible person from the people list, or empty string"),
  date: z.string().describe("YYYY-MM-DD the fact was decided/stated, or empty string"),
  isInference: z.boolean().describe("true when no single quote states the claim and you inferred it from a pattern"),
  evidence: z.array(ExtractedEvidenceSchema),
});

export const ExtractOutputSchema = z.object({ claims: z.array(ExtractedClaimSchema) });

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

export const EXTRACT_SYSTEM = `You build a handover ledger for a successor taking over a software project.
From the records given, extract the facts the successor needs: decisions (with date and reason),
open tasks with owners, risks, external dependencies and vendors, contacts, open questions, and
RECURRING problems (the same problem reported more than once: one claim citing every occurrence).

Evidence rules (strict, every quote is machine-checked):
- quotes must be copied verbatim from the given chunk text: exact characters, one contiguous span of
  8-200 characters, no ellipsis, no paraphrase, no merging of two spans.
- chunkId must be the id of the chunk the quote was copied from.
- Cite every chunk that supports the claim (up to 6). Use relation CONTRADICTS for a quote that
  disagrees with the claim.
- If nothing states the claim directly and you inferred it (e.g. an implied owner from commit
  history, a risk implied by a deadline), set isInference=true; still cite the quotes you used.
- Text like [REDACTED:SECRET-1] is a redaction placeholder. Never reconstruct secrets.

Other rules:
- topicKey names the SUBJECT, not the position: a claim that auth uses Firebase and a later claim that
  auth moved to Supabase share topicKey auth_provider. Reuse the same key for the same subject.
- Earlier statements that were later replaced are still claims (they show how decisions evolved).
- owner: the person's full name from the people list when someone is responsible; else "".
- Skip trivia (typo fixes, styling, chit-chat). Prefer 5-25 high-value claims per batch.
- checklistKeys: tag only items the claim directly satisfies:
${CHECKLIST.map((c) => `  ${c.key}: ${c.satisfiedBy}`).join("\n")}`;

export function renderChunk(c: PChunk, src: PSource | undefined): string {
  const attrs = [
    `id="${c.id}"`,
    `source="${(src?.title ?? "").replace(/"/g, "'")}"`,
    `locator="${c.locator.replace(/"/g, "'")}"`,
    c.author ? `author="${c.author.replace(/"/g, "'")}"` : "",
    c.timestamp ? `date="${c.timestamp.slice(0, 10)}"` : "",
    src?.authoritative ? `authoritative="true"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<chunk ${attrs}>\n${c.text}\n</chunk>`;
}

export function buildExtractPrompt(
  batch: ExtractBatch,
  chunksById: Map<string, PChunk>,
  sourcesById: Map<string, PSource>,
  people: PPerson[],
  projectName: string,
): string {
  const peopleList = people
    .map((p) => `- ${p.name}${p.roleTitle ? ` (${p.roleTitle})` : ""}; handles: ${p.handles.join(", ")}`)
    .join("\n");
  const body = batch.chunkIds
    .map((id) => chunksById.get(id))
    .filter((c): c is PChunk => !!c)
    .map((c) => renderChunk(c, sourcesById.get(c.sourceId)))
    .join("\n\n");
  return `Project: ${projectName}
People:
${peopleList || "- (none listed)"}

Records (${batch.chunkIds.length} chunks):

${body}

Extract the handover claims from these records as JSON.`;
}

export async function extractBatch(
  batch: ExtractBatch,
  chunksById: Map<string, PChunk>,
  sourcesById: Map<string, PSource>,
  people: PPerson[],
  projectName: string,
  ctx: LlmRunCtx,
): Promise<ExtractedClaim[]> {
  const out = await llmJson(
    {
      name: `extract:${batch.id}:${batch.group}`,
      system: EXTRACT_SYSTEM,
      prompt: buildExtractPrompt(batch, chunksById, sourcesById, people, projectName),
      schema: ExtractOutputSchema,
      temperature: 0.2,
    },
    ctx,
  );
  return out.claims;
}
