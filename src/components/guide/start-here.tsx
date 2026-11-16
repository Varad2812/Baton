"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, Compass, MessageCircleQuestion, X } from "lucide-react";
import { setPersona } from "@/app/_actions/persona";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = { key: string; title: string; why: string; href: string; persona: string; done: boolean };

const OPEN_KEY = "baton.guide.open";
const SEEN_KEY = "baton.guide.seen";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

/** Collapsible right rail: five clickable steps; each switches persona, navigates and ticks itself. */
export function StartHere({
  slug,
  conflictsDone,
  approved,
  evidenceClaimId,
  people,
}: {
  slug: string;
  conflictsDone: boolean;
  approved: boolean;
  evidenceClaimId: string | null;
  people: { owner: string; successor: string; reviewer: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const base = `/p/${slug}`;

  useEffect(() => {
    const saved = read(OPEN_KEY);
    const nextOpen = saved === null ? window.innerWidth >= 1280 : saved === "1";
    let nextSeen: Record<string, boolean> = {};
    try {
      nextSeen = JSON.parse(read(SEEN_KEY + "." + slug) ?? "{}");
    } catch {}
    const id = requestAnimationFrame(() => {
      setOpen(nextOpen);
      setSeen(nextSeen);
    });
    return () => cancelAnimationFrame(id);
  }, [slug]);

  // Steps the database cannot see are ticked when the judge actually visits the thing.
  useEffect(() => {
    const mark: string[] = [];
    if (pathname === base) mark.push("found");
    if (sp.get("claim")) mark.push("evidence");
    if (pathname.startsWith(`${base}/handover`) && approved) mark.push("handover");
    if (!mark.length) return;
    const id = requestAnimationFrame(() =>
      setSeen((prev) => {
        if (mark.every((m) => prev[m])) return prev;
        const next = { ...prev, ...Object.fromEntries(mark.map((m) => [m, true])) };
        write(SEEN_KEY + "." + slug, JSON.stringify(next));
        return next;
      }),
    );
    return () => cancelAnimationFrame(id);
  }, [pathname, sp, base, slug, approved]);

  const steps: Step[] = [
    { key: "found", title: "See what was found", why: "Every fact starts as a quote from a real record, not a summary.", href: base, persona: "meera", done: !!seen.found },
    { key: "evidence", title: "Check a fact's evidence", why: "The quote is highlighted inside its original source, so you can verify it yourself.", href: evidenceClaimId ? `${base}/ledger?claim=${evidenceClaimId}` : `${base}/ledger`, persona: "rao", done: !!seen.evidence },
    { key: "conflict", title: "Resolve a conflict", why: "When two sources disagree, a person decides. Baton never picks silently.", href: `${base}/conflicts`, persona: "rao", done: conflictsDone },
    { key: "approve", title: "Approve as reviewer", why: `${people.reviewer} signs off; approval freezes an immutable version.`, href: `${base}/review`, persona: "rao", done: approved },
    { key: "handover", title: `See ${people.successor}'s handover`, why: "What the successor gets: an approved plan, role-safe, every line cited.", href: `${base}/handover`, persona: "arjun", done: !!seen.handover },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  const toggle = (v: boolean) => {
    setOpen(v);
    write(OPEN_KEY, v ? "1" : "0");
  };

  if (!open) {
    return (
      <button
        data-guide
        onClick={() => toggle(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3.5 py-2 text-[13px] font-medium text-text shadow-lg shadow-black/40 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Compass className="size-4 text-primary" />
        Start here
        <span className="font-mono text-xs text-subtle">{doneCount}/5</span>
      </button>
    );
  }

  return (
    <aside
      data-guide
      aria-label="Start here"
      className="fixed inset-y-0 right-0 z-50 flex w-[272px] shrink-0 flex-col border-l border-border bg-surface shadow-2xl shadow-black/50 xl:sticky xl:top-0 xl:z-30 xl:h-screen xl:shadow-none"
    >
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-text">
          <Compass className="size-4 text-primary" />
          Start here
          <span className="font-mono text-xs font-normal text-subtle">{doneCount}/5</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Collapse guide" onClick={() => toggle(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <p className="px-4 pt-3 text-xs text-muted">Five clicks to see everything Baton does. Each step switches who you are viewing as.</p>
      <ol className="flex-1 space-y-1 overflow-y-auto p-3">
        {steps.map((s, i) => (
          <li key={s.key} className={cn("rounded-md border p-3", s.done ? "border-border bg-transparent" : s.key === next?.key ? "border-primary/40 bg-surface-2" : "border-border bg-surface-2/50")}>
            <div className="flex items-start gap-2.5">
              <span className={cn("mt-px flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]", s.done ? "border-verified bg-verified/15 text-verified" : "border-subtle text-subtle")}>
                {s.done ? <Check className="size-3" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[13px] font-medium", s.done ? "text-muted" : "text-text")}>{s.title}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-subtle">{s.why}</p>
                <Button
                  size="sm"
                  variant={s.key === next?.key ? "default" : "outline"}
                  className="mt-2"
                  disabled={pending}
                  data-guide-step={s.key}
                  onClick={() =>
                    start(async () => {
                      await setPersona(s.persona);
                      router.push(s.href);
                    })
                  }
                >
                  {s.done ? "Do it again" : "Do it"}
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="flex items-start gap-2 border-t border-border px-4 py-3 text-xs leading-relaxed text-subtle" data-guide-ask>
        <MessageCircleQuestion className="mt-px size-3.5 shrink-0 text-muted" aria-hidden />
        <span>
          Stuck? Click <span className="font-medium text-text">Ask Baton</span> in the top bar. It explains any page or grade from what your persona may see, and
          text boxes have a <span className="font-medium text-text">Draft</span> button.
        </span>
      </p>
    </aside>
  );
}
