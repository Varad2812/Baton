"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Loader2, Lock, MessageCircleQuestion, RotateCcw, UserRound } from "lucide-react";
import type { Grade } from "@/generated/prisma/enums";
import { setPersona } from "@/app/_actions/persona";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { GradeDot } from "@/components/ui/grade-chip";
import {
  actionLabel,
  NAV_ACTIONS,
  PAGE_NAME,
  pageFromPath,
  PERSONA_ACTIONS,
  suggestedQuestions,
  type AssistantActionId,
  type NavActionId,
  type PeopleNames,
  type PersonaActionId,
} from "@/lib/assistant/actions";
import { cn } from "@/lib/utils";

type Engine = "groq" | "gemini" | "offline";
type Msg =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "assistant";
      text: string;
      citations: { id: string; title: string; grade: Grade }[];
      actions: AssistantActionId[];
      engine: Engine;
      model: string | null;
      refused?: "leak" | "off_topic";
      limited?: boolean;
    }
  | { id: number; role: "notice"; text: string };

const ENGINE_LABEL: Record<Engine, string> = { groq: "Groq", gemini: "Gemini", offline: "Offline" };

/**
 * "Ask Baton": a right-side help panel. The conversation lives in this component's state only (it
 * survives navigation inside a project because the layout keeps it mounted) and is cleared when the
 * "Viewing as" persona changes, so nothing seen by one role is carried into another role's chat.
 */
export function AskBaton({
  slug,
  persona,
  personaName,
  projectName,
  people,
  className,
}: {
  /** Project the questions are about (the landing page passes the demo project). */
  slug: string;
  /** Current persona key; a change clears the conversation. */
  persona: string;
  personaName?: string;
  projectName: string;
  people: PeopleNames;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const page = pageFromPath(pathname);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; retry: string } | null>(null);
  const [, start] = useTransition();
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastPersona = useRef(persona);
  const base = `/p/${slug}`;

  // A persona switch wipes the chat (history could hold facts the new role may not see).
  useEffect(() => {
    if (lastPersona.current === persona) return;
    lastPersona.current = persona;
    setMsgs((m) =>
      m.length ? [{ id: nextId.current++, role: "notice", text: `Viewing as changed${personaName ? ` to ${personaName}` : ""}. The conversation was cleared so nothing from the previous role carries over.` }] : m,
    );
    setError(null);
  }, [persona, personaName]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    const history = msgs
      .filter((m): m is Extract<Msg, { role: "user" | "assistant" }> => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 2400) }));
    setMsgs((m) => [...m, { id: nextId.current++, role: "user", text: q }]);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, page, message: q, history }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
      const r = j.reply;
      setMsgs((m) => [
        ...m,
        { id: nextId.current++, role: "assistant", text: r.text, citations: r.citations ?? [], actions: r.actions ?? [], engine: r.engine, model: r.model, refused: r.refused, limited: j.limited },
      ]);
    } catch (e) {
      setError({ text: (e as Error).message || "Could not reach Baton.", retry: q });
      setMsgs((m) => m.slice(0, -1));
      setText(q);
    } finally {
      setBusy(false);
    }
  };

  const openFact = (id: string) => {
    setOpen(false);
    const here = page === "dashboard" || page === "ledger";
    router.push(`${here && pathname.startsWith(base) ? pathname : `${base}/ledger`}?claim=${encodeURIComponent(id)}`);
  };

  const runAction = (id: AssistantActionId) => {
    if (id in NAV_ACTIONS) {
      const a = NAV_ACTIONS[id as NavActionId];
      setOpen(false);
      // "Ask the handover" opens with the user's last question already typed in.
      const lastQ = id === "nav:ask" ? [...msgs].reverse().find((m) => m.role === "user")?.text : undefined;
      router.push("absolute" in a ? a.path : `${base}${a.path}${lastQ ? `?q=${encodeURIComponent(lastQ.slice(0, 500))}` : ""}`);
      return;
    }
    const p = PERSONA_ACTIONS[id as PersonaActionId];
    start(async () => {
      await setPersona(p.persona);
      router.refresh();
    });
  };

  const suggestions = suggestedQuestions(page, people);
  const hasChat = msgs.some((m) => m.role !== "notice");

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-assistant-open className={className}>
        <MessageCircleQuestion className="size-3.5" />
        Ask Baton
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        width={440}
        title="Ask Baton"
        subtitle={
          <span>
            How do I use Baton? Questions about {projectName}&apos;s facts go to Ask the handover · {PAGE_NAME[page]}
          </span>
        }
        actions={
          hasChat ? (
            <Button variant="ghost" size="sm" onClick={() => setMsgs([])} aria-label="Clear conversation">
              <RotateCcw className="size-3.5" />
              Clear
            </Button>
          ) : null
        }
        footer={
          <form
            className="w-full"
            data-assistant-form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <div className="relative">
              <textarea
                ref={inputRef}
                rows={2}
                value={text}
                maxLength={600}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void ask(text);
                  }
                }}
                placeholder="Ask about this page, a grade, or what is still open"
                aria-label="Ask Baton a question"
                className="w-full resize-none rounded-md border border-border bg-bg py-2 pl-3 pr-20 text-[13px] leading-relaxed text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              <Button type="submit" size="sm" disabled={busy || !text.trim()} className="absolute bottom-2 right-2" aria-label="Send question">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CornerDownLeft className="size-3.5" />}
                Ask
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-subtle">Not stored anywhere. The conversation clears when you leave or switch persona.</p>
          </form>
        }
      >
        <div className="space-y-4 text-[13px]" aria-live="polite">
          {!hasChat && (
            <div>
              <p className="text-muted">
                I explain pages, grades and what is still open in {projectName}, using only the facts {personaName ?? "your role"} is allowed to see. I cite each fact so you can check its quote.
              </p>
              <div className="mt-3 text-[11px] uppercase tracking-wide text-subtle">Suggested for {PAGE_NAME[page]}</div>
              <ul className="mt-1.5 space-y-1.5">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      data-assistant-suggestion
                      onClick={() => void ask(s)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-left text-[13px] text-text outline-none hover:border-primary/40 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {s}
                      <ArrowRight className="size-3.5 shrink-0 text-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {msgs.map((m) =>
            m.role === "notice" ? (
              <p key={m.id} className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-subtle">
                {m.text}
              </p>
            ) : m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-line rounded-lg rounded-br-sm border border-border bg-surface-2 px-3 py-2 text-text">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} data-assistant-answer className="space-y-2">
                <p className={cn("whitespace-pre-line leading-relaxed", m.refused === "leak" ? "text-muted" : "text-text")}>
                  {m.refused === "leak" && <Lock className="mr-1.5 inline size-3.5 -translate-y-px text-subtle" />}
                  {m.text}
                </p>
                {m.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Cited facts">
                    {m.citations.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        data-assistant-citation
                        onClick={() => openFact(c.id)}
                        title={`Open the evidence for: ${c.title}`}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted outline-none hover:border-primary/40 hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <GradeDot grade={c.grade} />
                        <span className="truncate">{c.title.length > 56 ? `${c.title.slice(0, 55)}…` : c.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.actions.map((a) => (
                      <Button key={a} variant="outline" size="sm" onClick={() => runAction(a)} data-assistant-action={a}>
                        {a.startsWith("persona:") ? <UserRound className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                        {actionLabel(a, people)}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="font-mono text-[10.5px] text-subtle" data-assistant-engine={m.engine}>
                  {ENGINE_LABEL[m.engine]}
                  {m.model && m.engine !== "offline" ? ` · ${m.model}` : ""}
                  {m.engine === "offline" ? " · answered from the guide and project counts" : ""}
                  {m.limited ? " · message limit reached, AI paused for 10 min" : ""}
                </div>
              </div>
            ),
          )}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-subtle" role="status">
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-pulse rounded-full bg-subtle motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </span>
              Checking the records you can see…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-conflicting/35 bg-conflicting/[0.07] px-3 py-2 text-xs text-conflicting" role="alert">
              <span>{error.text}</span>
              <Button size="sm" variant="ghost" onClick={() => void ask(error.retry)}>
                Retry
              </Button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </Drawer>
    </>
  );
}
