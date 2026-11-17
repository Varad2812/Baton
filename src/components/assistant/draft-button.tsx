"use client";

import { useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Loader2, PenLine } from "lucide-react";
import { logDraftUsed } from "@/app/_actions/assistant";
import { Button } from "@/components/ui/button";
import { FIELD_SPEC, isTestimonyField, type DraftField } from "@/lib/assistant/fields";
import { cn } from "@/lib/utils";

type Engine = "groq" | "gemini" | "offline";
export type DraftTarget = { claimId?: string; conflictId?: string; questionId?: string; followUpId?: string; section?: string; projectName?: string };
export type DraftApplied = { mode: "insert" | "replace"; engine: Engine };

const ENGINE_LABEL: Record<Engine, string> = { groq: "Groq", gemini: "Gemini", offline: "Offline" };

/**
 * Small "Smart Draft" button for a text field. Opens a popover: optional rough notes -> Smart Draft -> preview ->
 * Insert / Replace / Cancel. It never submits the form. Testimony fields only rephrase the user's own
 * notes (the server refuses when there are none). Inserting writes an "assistant.draft.used" audit row.
 */
export function DraftButton({
  field,
  slug,
  target,
  value,
  onApply,
  className,
  disabled,
}: {
  field: DraftField;
  slug: string | null;
  target?: DraftTarget;
  value: string;
  onApply: (next: string, info: DraftApplied) => void;
  className?: string;
  disabled?: boolean;
}) {
  const testimony = isTestimonyField(field);
  const spec = FIELD_SPEC[field];
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ text: string; engine: Engine; model: string | null; note?: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const reset = () => {
    setDraft(null);
    setMessage(null);
    setBusy(false);
  };

  const generate = async () => {
    setBusy(true);
    setMessage(null);
    setDraft(null);
    try {
      const res = await fetch("/api/assistant/draft", {
        signal: AbortSignal.timeout(30_000),
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, field, notes, current: value, target: target ?? {} }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
      const d = j.draft as { text: string | null; refusal?: string; engine: Engine; model: string | null; note?: string };
      if (d.text) setDraft({ text: d.text, engine: d.engine, model: d.model, note: d.note });
      else setMessage(d.refusal ?? "Nothing to draft yet.");
    } catch (e) {
      setMessage((e as Error).message || "Could not reach Baton. Retry.");
    } finally {
      setBusy(false);
    }
  };

  const apply = (mode: "insert" | "replace") => {
    if (!draft) return;
    const sep = value.includes("\n") || value.length > 80 ? "\n" : " ";
    const next = mode === "replace" || !value.trim() ? draft.text : `${value.trimEnd()}${sep}${draft.text}`;
    onApply(next.slice(0, spec.max), { mode, engine: draft.engine });
    if (slug) void logDraftUsed({ slug, field, mode, engine: draft.engine, targetId: target?.claimId ?? target?.conflictId ?? target?.questionId ?? target?.followUpId });
    setOpen(false);
    setNotes("");
    reset();
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Popover.Trigger
        disabled={disabled}
        data-draft-button={field}
        aria-label="Open Smart Draft"
        title={`Smart Draft: ${spec.label}`}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-[5px] border border-border bg-surface px-1.5 text-[11px] font-medium text-muted outline-none hover:border-primary/40 hover:text-text focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40",
          className,
        )}
      >
        <PenLine className="size-3" aria-hidden />
        Smart Draft
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="z-[80]">
          <Popover.Popup
            initialFocus={notesRef}
            data-draft-popover={field}
            className="w-[min(380px,calc(100vw-32px))] rounded-lg border border-border bg-surface-2 p-3 text-[13px] shadow-xl shadow-black/50 outline-none"
          >
            <Popover.Title className="text-[13px] font-semibold text-text">Smart Draft — writes from your notes</Popover.Title>
            <Popover.Description className="mt-0.5 text-xs text-muted">
              {testimony
                ? "Rephrases only what you write here (or what is already in the box). It never adds facts, and nothing is sent until you submit."
                : "Uses the facts on screen that your role may see. Nothing is sent until you submit the form."}
            </Popover.Description>
            <label className="mt-2.5 block text-[11px] uppercase tracking-wide text-subtle" htmlFor={`draft-notes-${field}`}>
              Rough notes{testimony ? "" : " (optional)"}
            </label>
            <textarea
              id={`draft-notes-${field}`}
              ref={notesRef}
              rows={2}
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
              }}
              placeholder={testimony ? "e.g. dev has it, in the club bitwarden, shared in march" : "e.g. superseded by the 02-Apr notes"}
              className="mt-1 w-full resize-none rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-subtle">{spec.label}</span>
              <Button size="sm" variant="outline" onClick={() => void generate()} disabled={busy} data-draft-generate>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />}
                {draft ? "Draft again" : "Smart Draft"}
              </Button>
            </div>

            {message && (
              <p className="mt-2.5 rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted" role="status" data-draft-message>
                {message}
              </p>
            )}
            {draft && (
              <div className="mt-2.5" data-draft-result>
                <p className="max-h-40 overflow-y-auto whitespace-pre-line rounded-md border border-border bg-bg px-2.5 py-2 text-[13px] leading-relaxed text-text">{draft.text}</p>
                <div className="mt-1 font-mono text-[10.5px] text-subtle" data-draft-engine={draft.engine}>
                  {ENGINE_LABEL[draft.engine]}
                  {draft.model && draft.engine !== "offline" ? ` · ${draft.model}` : ""}
                  {draft.note ? ` · ${draft.note}` : ""}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-border pt-2.5">
              <Popover.Close render={<Button size="sm" variant="ghost" />}>Cancel</Popover.Close>
              <Button size="sm" variant="outline" disabled={!draft} onClick={() => apply("replace")}>
                Replace
              </Button>
              <Button size="sm" disabled={!draft} onClick={() => apply("insert")}>
                Insert
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
