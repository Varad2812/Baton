"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, Compass, MessageCircleQuestion } from "lucide-react";
import { setPersona } from "@/app/_actions/persona";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { GUIDE_OPEN_EVENT } from "@/components/shell/help-menu";
import { cn } from "@/lib/utils";

type Step = { key: string; title: string; why: string; href: string; persona: string; done: boolean };

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

/**
 * Start here: a small "Guide 2/8" pill bottom-right that opens a drawer of eight clickable steps; each
 * switches persona, navigates and ticks itself. Closed by default; Help → Start here guide or the
 * welcome choice "Explore" opens it.
 */
export function StartHere({
  slug,
  conflictsDone,
  approved,
  evidenceClaimId,
  evidenceChecked,
  asked,
  radarSeen,
  slackImported,
  people,
}: {
  slug: string;
  conflictsDone: boolean;
  approved: boolean;
  evidenceClaimId: string | null;
  evidenceChecked: boolean;
  asked: boolean;
  radarSeen: boolean;
  slackImported: boolean;
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
    let nextSeen: Record<string, boolean> = {};
    try {
      nextSeen = JSON.parse(read(SEEN_KEY + "." + slug) ?? "{}");
    } catch {}
    const id = requestAnimationFrame(() => setSeen(nextSeen));
    const onOpen = () => setOpen(true);
    window.addEventListener(GUIDE_OPEN_EVENT, onOpen);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener(GUIDE_OPEN_EVENT, onOpen);
    };
  }, [slug]);

  // Steps the database cannot see are ticked when the judge actually visits the thing.
  useEffect(() => {
    const mark: string[] = [];
    if (pathname === base) mark.push("found");
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
    { key: "evidence", title: "Check a fact's evidence", why: "The quote is highlighted inside its original source, so you can verify it yourself.", href: evidenceClaimId ? `${base}/ledger?claim=${evidenceClaimId}` : `${base}/ledger`, persona: "rao", done: evidenceChecked },
    { key: "conflict", title: "Resolve a conflict", why: "When two sources disagree, a person decides. Baton never picks silently.", href: `${base}/conflicts`, persona: "rao", done: conflictsDone },
    { key: "approve", title: "Approve as reviewer", why: `${people.reviewer} signs off; approval freezes an immutable version.`, href: `${base}/review`, persona: "rao", done: approved },
    { key: "handover", title: `See ${people.successor}'s handover`, why: "What the successor gets: an approved plan, role-safe, every line cited.", href: `${base}/handover`, persona: "arjun", done: !!seen.handover },
    { key: "ask", title: "Ask the handover a question", why: "Answers come only from the approved handover, every sentence cited. If it isn't there, one click asks the person leaving.", href: `${base}/ask`, persona: "arjun", done: asked },
    { key: "radar", title: "See knowledge at risk", why: "Areas only one person knows, scored before anyone resigns. Then Simulate new activity on Sources to see v1 go out of date.", href: `${base}/radar`, persona: "meera", done: radarSeen },
    { key: "slack", title: "Import Slack", why: "Public channels become Team, private ones Restricted; Safety checks shows how many facts Slack confirms.", href: `${base}/sources/add?method=slack`, persona: "meera", done: slackImported },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <>
      <button
        data-guide
        onClick={() => setOpen(true)}
        aria-label={`Open the Start here guide, ${doneCount} of ${steps.length} steps done`}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-text shadow-lg shadow-black/40 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary print:hidden"
      >
        <Compass className="size-3.5 text-primary" aria-hidden />
        Guide
        <span className="font-mono text-xs text-subtle">{doneCount}/{steps.length}</span>
      </button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        width={340}
        title={
          <span className="flex items-center gap-2">
            <Compass className="size-4 text-primary" aria-hidden />
            Start here
            <span className="font-mono text-xs font-normal text-subtle">{doneCount}/{steps.length}</span>
          </span>
        }
        subtitle="Eight short steps through everything Baton does. Each one switches who you are viewing as and opens the right page."
        footer={
          <p className="flex items-start gap-2 text-xs leading-relaxed text-subtle" data-guide-ask>
            <MessageCircleQuestion className="mt-px size-3.5 shrink-0 text-muted" aria-hidden />
            <span>
              Stuck? Click <span className="font-medium text-text">Ask Baton</span> in the top bar. It explains any page or grade from what your persona may see, and
              text boxes have a <span className="font-medium text-text">Smart Draft</span> button.
            </span>
          </p>
        }
      >
        <ol className="space-y-1.5" aria-label="Start here steps" data-guide-panel>
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
                        setOpen(false);
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
      </Drawer>
    </>
  );
}
