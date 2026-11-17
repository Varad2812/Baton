"use client";

// "Ask the handover": a question box whose answers come only from the approved handover the viewer
// may see. Every sentence carries numbered citations that open the evidence drawer. When the records
// don't answer it, the successor can send the question to the departing owner in one click.
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CornerDownLeft, Loader2, MessageSquareQuote, RotateCcw, Send } from "lucide-react";
import type { AskAnswer } from "@/lib/ask/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Turn = { id: number; question: string; answer?: AskAnswer; error?: string; pending?: boolean };
type OwnerState = "idle" | "pending" | "sent" | "already" | "error";

const ENGINE: Record<AskAnswer["engine"], string> = { groq: "Groq", gemini: "Gemini", offline: "Offline (exact quotes)" };
const MAX = 500;
const TIMEOUT_MS = 30_000;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; issues?: { message: string }[] } & T;
    if (!res.ok || !j.ok) throw new Error(j.issues?.[0]?.message ?? j.error ?? `Request failed (HTTP ${res.status}).`);
    return j;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("No answer within 30 seconds. Try again.");
    if (e instanceof TypeError) throw new Error("Network error. Check your connection and try again.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function AskBox({
  slug,
  successor,
  suggestions,
  compact = false,
  openInPlace = false,
}: {
  slug: string;
  /** First name of the successor (who may send a question to the owner). */
  successor: string;
  suggestions: string[];
  compact?: boolean;
  /** Open citations in this page's evidence drawer (?claim=) instead of Facts. */
  openInPlace?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(() => (compact ? "" : (sp.get("q") ?? "").slice(0, MAX)));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [owner, setOwner] = useState<Record<number, OwnerState>>({});
  const seq = useRef(0);
  const busy = turns.some((t) => t.pending);

  async function ask(question: string, replaceId?: number) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    const id = replaceId ?? ++seq.current;
    setTurns((ts) => (replaceId ? ts.map((t) => (t.id === id ? { id, question: text, pending: true } : t)) : [...ts, { id, question: text, pending: true }]));
    if (!replaceId) setQ("");
    try {
      const { answer } = await postJson<{ answer: AskAnswer }>(`/api/projects/${slug}/ask`, { question: text });
      setTurns((ts) => ts.map((t) => (t.id === id ? { id, question: text, answer } : t)));
    } catch (e) {
      setTurns((ts) => ts.map((t) => (t.id === id ? { id, question: text, error: (e as Error).message } : t)));
    }
  }

  async function askOwner(turn: Turn) {
    if (owner[turn.id] === "pending" || owner[turn.id] === "sent" || owner[turn.id] === "already") return;
    setOwner((o) => ({ ...o, [turn.id]: "pending" }));
    try {
      const r = await postJson<{ already: boolean }>(`/api/projects/${slug}/ask/owner`, { question: turn.question });
      setOwner((o) => ({ ...o, [turn.id]: r.already ? "already" : "sent" }));
      router.refresh();
    } catch {
      setOwner((o) => ({ ...o, [turn.id]: "error" }));
    }
  }

  const openClaim = (claimId: string) => {
    const href = openInPlace ? `${pathname}?claim=${encodeURIComponent(claimId)}` : `/p/${slug}/ledger?claim=${encodeURIComponent(claimId)}`;
    router.push(href, { scroll: false });
  };

  return (
    <div data-testid="ask-box" className={cn("rounded-lg border border-border bg-surface", compact ? "print:hidden" : "")}>
      <form
        className="flex items-start gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <MessageSquareQuote className="mt-2 size-4 shrink-0 text-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <label htmlFor={`ask-${compact ? "c" : "p"}`} className="sr-only">
            Ask a question about this project
          </label>
          <textarea
            id={`ask-${compact ? "c" : "p"}`}
            data-ask-input
            rows={compact ? 1 : 2}
            maxLength={MAX}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(q);
              }
            }}
            placeholder="Ask about this project, e.g. which payment gateway was chosen and why"
            className="block w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-text placeholder:text-subtle focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-subtle">
            <span>Answers come only from the handover you may see, and every sentence is cited.</span>
            <span className="font-mono tabular-nums">
              {q.length}/{MAX}
            </span>
          </div>
        </div>
        <Button type="submit" size="sm" disabled={busy || q.trim().length < 3} data-ask-submit className="mt-0.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Ask
        </Button>
      </form>

      {!turns.length && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2.5">
          <span className="mr-1 self-center text-[11px] uppercase tracking-wide text-subtle">Try</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              data-ask-suggestion
              onClick={() => void ask(s)}
              disabled={busy}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {turns.length > 0 && (
        <ol className="divide-y divide-border border-t border-border" aria-live="polite">
          {turns.map((t) => (
            <li key={t.id} className="px-4 py-3" data-ask-turn>
              <p className="flex items-start gap-2 text-[13px] text-muted">
                <CornerDownLeft className="mt-0.5 size-3.5 shrink-0 rotate-180 text-subtle" aria-hidden />
                <span className="min-w-0">{t.question}</span>
              </p>
              {t.pending && (
                <div className="mt-2 space-y-1.5" aria-label="Looking through the handover">
                  <Skeleton className="h-3.5 w-11/12" />
                  <Skeleton className="h-3.5 w-8/12" />
                </div>
              )}
              {t.error && (
                <div role="alert" className="mt-2 flex items-center justify-between gap-3 rounded-md border border-conflicting/30 bg-conflicting/10 px-3 py-2 text-xs text-conflicting">
                  <span>{t.error}</span>
                  <Button size="sm" variant="outline" onClick={() => void ask(t.question, t.id)} disabled={busy}>
                    <RotateCcw className="size-3.5" />
                    Try again
                  </Button>
                </div>
              )}
              {t.answer && <AnswerView answer={t.answer} onCite={openClaim} owner={owner[t.id] ?? "idle"} onAskOwner={() => void askOwner(t)} successor={successor} slug={slug} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AnswerView({
  answer: a,
  onCite,
  owner,
  onAskOwner,
  successor,
  slug,
}: {
  answer: AskAnswer;
  onCite: (claimId: string) => void;
  owner: OwnerState;
  onAskOwner: () => void;
  successor: string;
  slug: string;
}) {
  const byN = new Map(a.sources.map((s) => [s.n, s]));
  const where =
    a.mode === "approved" ? (
      <span>
        v{a.version} approved{a.approvedBy ? ` by ${a.approvedBy}` : ""}
      </span>
    ) : (
      <Badge variant="primary" size="sm" data-ask-draft>
        Draft — not yet approved
      </Badge>
    );

  if (a.status === "refused") {
    return (
      <div data-ask-refusal data-reason={a.reason} className="mt-2 rounded-md border border-border bg-bg px-3 py-2.5">
        <p className="text-[13px] text-text">{a.text}</p>
        {a.gap && (
          <button type="button" onClick={() => onCite(a.gap!.claimId)} className="mt-1 text-xs text-muted underline-offset-2 hover:text-text hover:underline">
            Known gap: {a.gap.title}
          </button>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {a.askOwner.allowed ? (
            owner === "sent" || owner === "already" ? (
              <span data-ask-owner-sent className="text-verified">
                {owner === "already" ? "Already asked. " : "Sent to "}
                {owner === "already" ? `${a.askOwner.first} has it in the follow-up inbox.` : `${a.askOwner.first}. The answer becomes testimony and you can ask here again.`}{" "}
                <Link href={`/p/${slug}/handover#follow-ups`} className="underline underline-offset-2">
                  See follow-ups
                </Link>
              </span>
            ) : (
              <>
                <Button size="sm" onClick={onAskOwner} disabled={owner === "pending"} data-ask-owner>
                  {owner === "pending" && <Loader2 className="size-3.5 animate-spin" />}
                  Ask {a.askOwner.first}
                </Button>
                {owner === "error" && <span className="text-conflicting">Could not send it. Try again.</span>}
              </>
            )
          ) : (
            <span className="text-subtle">
              Only {successor} (the successor) can send this question to {a.askOwner.first}.
            </span>
          )}
          <span className="ml-auto text-subtle">{where}</span>
        </div>
      </div>
    );
  }

  return (
    <div data-ask-answer className="mt-2">
      <p className="text-[14px] leading-relaxed text-text">
        {a.sentences.map((s, i) => (
          <span key={i}>
            {s.text}
            {s.cites.map((n) => {
              const src = byN.get(n);
              return (
                <sup key={n} className="ml-0.5">
                  <button
                    type="button"
                    data-ask-cite={n}
                    onClick={() => src && onCite(src.claimId)}
                    title={src ? `${src.label}: ${src.title}` : undefined}
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-surface-2 px-1 font-mono text-[10px] leading-none text-primary hover:bg-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {n}
                  </button>
                </sup>
              );
            })}{" "}
          </span>
        ))}
      </p>
      <ul className="mt-2.5 space-y-1">
        {a.sources.map((s) => (
          <li key={s.n}>
            <button
              type="button"
              onClick={() => onCite(s.claimId)}
              className="grid w-full grid-cols-[24px_minmax(0,1fr)] gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="font-mono text-primary">[{s.n}]</span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-text">{s.label}</span>
                  {s.grade && <GradeChip grade={s.grade} compact />}
                  {s.afterApproval && (
                    <Badge variant="testimony" size="sm">
                      testimony after v{a.version}
                    </Badge>
                  )}
                  <span className="truncate text-muted">{s.title}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block font-mono text-[11px] text-subtle">“{s.excerpt}”</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-subtle" data-ask-footer>
        <span>
          Answered from {a.sources.length} source{a.sources.length === 1 ? "" : "s"} · {ENGINE[a.engine]}
        </span>
        <span>·</span>
        {where}
        {a.stats.dropped > 0 && (
          <span title="Sentences without a valid citation are removed before you see them.">
            · {a.stats.dropped} uncited sentence{a.stats.dropped === 1 ? "" : "s"} removed
          </span>
        )}
      </p>
    </div>
  );
}
