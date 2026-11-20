"use client";

// First-visit welcome: three ways in, shown once (remembered in this browser). Never shown while a
// tour is starting (?tour=1) and never blocks: Escape or any choice closes it.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, FileUp, PlayCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { openGuide } from "@/components/shell/help-menu";

export const WELCOME_KEY = "baton.welcome.v1";

export function Welcome() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const touring = sp.get("tour") === "1";

  useEffect(() => {
    if (touring) return;
    let seen = true;
    try {
      seen = localStorage.getItem(WELCOME_KEY) !== null;
    } catch {}
    if (seen) return;
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, [touring]);

  const remember = (choice: string) => {
    try {
      localStorage.setItem(WELCOME_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
    } catch {}
  };
  const pick = (choice: string, href: string) => {
    remember(choice);
    setOpen(false);
    router.push(href);
    // "Explore" opens the Start here guide once; afterwards it stays a small pill until asked for.
    if (choice === "explore") setTimeout(openGuide, 400);
  };

  const choices = [
    { key: "finished", icon: Compass, title: "See a finished handover", body: "Open the approved FestFlow example as Arjun, the incoming lead.", href: "/demo/handover" },
    { key: "tour", icon: PlayCircle, title: "Take the 60-second tour", body: "Nine steps through a finished handover: evidence, a conflict, approval, the successor's view, Q&A and zero leaks.", href: "/p/festflow?tour=1" },
    { key: "explore", icon: Compass, title: "Explore the sample handover", body: "Open FestFlow on your own private copy with an 8-step guide. Reset demo restores it any time.", href: "/p/festflow" },
    { key: "own", icon: FileUp, title: "Try with your own files", body: "Upload notes, chat exports, PDFs, a Slack export or a public GitHub repo, and Baton builds the handover.", href: "/new" },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) remember("dismissed");
        setOpen(o);
      }}
      title="Welcome to Baton"
      description="Hand over the project, not just the files. No login: pick where to start."
      className="max-w-[560px]"
    >
      <ul className="space-y-2" data-testid="welcome">
        {choices.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              data-welcome={c.key}
              onClick={() => pick(c.key, c.href)}
              className="flex w-full items-start gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:border-primary/50 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <c.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-[13px] font-medium text-text">{c.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{c.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
