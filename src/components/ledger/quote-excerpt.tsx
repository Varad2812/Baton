import { findQuote } from "@/lib/pipeline/quotes";
import { cn } from "@/lib/utils";

/** Resolve the highlight range: stored offsets first, then a deterministic re-match. */
export function quoteRange(text: string, quote: string, start: number | null, end: number | null) {
  if (start !== null && end !== null && start >= 0 && end <= text.length && end > start) return { start, end };
  return findQuote(text, quote);
}

/** Chunk text with the cited quote highlighted (mono, amber underline). */
export function QuoteExcerpt({
  text,
  quote,
  start,
  end,
  window = 240,
  tone = "support",
  className,
}: {
  text: string;
  quote: string;
  start: number | null;
  end: number | null;
  window?: number | null;
  tone?: "support" | "contradict";
  className?: string;
}) {
  const r = quoteRange(text, quote, start, end);
  const mark = cn(
    "rounded-[2px] px-0.5 font-mono text-[12px] text-text underline decoration-2 underline-offset-[3px]",
    tone === "contradict" ? "bg-conflicting/12 decoration-conflicting" : "bg-primary/10 decoration-primary",
  );
  if (!r) {
    return (
      <div className={cn("whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted", className)}>
        <span className={mark}>{quote}</span>
        <span className="ml-2 text-xs text-conflicting">quote not found in chunk</span>
      </div>
    );
  }
  let from = window === null ? 0 : Math.max(0, r.start - window);
  let to = window === null ? text.length : Math.min(text.length, r.end + window);
  // Snap the window to line boundaries so excerpts never start mid-word.
  if (from > 0) {
    const nl = text.indexOf("\n", from);
    if (nl !== -1 && nl < r.start) from = nl + 1;
  }
  if (to < text.length) {
    const nl = text.lastIndexOf("\n", to);
    if (nl > r.end) to = nl;
  }
  const pre = text.slice(from, r.start);
  const post = text.slice(r.end, to);
  return (
    <div className={cn("whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-muted", className)}>
      {from > 0 && <span className="text-subtle">…</span>}
      {pre}
      <mark className={mark}>{text.slice(r.start, r.end)}</mark>
      {post}
      {to < text.length && <span className="text-subtle">…</span>}
    </div>
  );
}
