// Citation contract for "Ask the handover" (pure). Every sentence must cite at least one numbered
// source from the allowed set; a sentence with a missing or unknown citation is dropped, and so is
// one whose quoted words cannot be string-matched inside a source it cites.
import { findQuote } from "@/lib/pipeline/quotes";
import type { AskSentence } from "./types";

export type RawSentence = { text: string; cites?: unknown[]; quote?: string | null };
export type DropReason = "empty" | "uncited" | "unknown_citation" | "quote_mismatch";

const INLINE_QUOTE = /[“"]([^”"]{12,400})[”"]/g;

export function validateSentences(
  raw: RawSentence[],
  sources: Map<number, { text: string }>,
): { kept: AskSentence[]; dropped: { text: string; reason: DropReason }[]; citations: number; validCitations: number } {
  const kept: AskSentence[] = [];
  const dropped: { text: string; reason: DropReason }[] = [];
  let citations = 0;
  let validCitations = 0;
  for (const s of raw) {
    const text = String(s.text ?? "")
      .replace(/\s*\[(\d+(?:\s*,\s*\d+)*)\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const cites = [...new Set((s.cites ?? []).map((c) => Number(c)).filter((c) => Number.isInteger(c)))];
    citations += cites.length;
    if (!text) {
      dropped.push({ text, reason: "empty" });
      continue;
    }
    if (!cites.length) {
      dropped.push({ text, reason: "uncited" });
      continue;
    }
    if (cites.some((c) => !sources.has(c))) {
      dropped.push({ text, reason: "unknown_citation" });
      continue;
    }
    const cited = cites.map((c) => sources.get(c)!.text);
    const quoted = [...text.matchAll(INLINE_QUOTE)].map((m) => m[1]);
    if (s.quote && s.quote.trim().length >= 8) quoted.push(s.quote.trim());
    if (quoted.some((q) => !cited.some((t) => findQuote(t, q)))) {
      dropped.push({ text, reason: "quote_mismatch" });
      continue;
    }
    validCitations += cites.length;
    kept.push({ text, cites: cites.sort((a, b) => a - b) });
  }
  return { kept, dropped, citations, validCitations };
}
