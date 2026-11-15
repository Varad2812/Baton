"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Info, X } from "lucide-react";

const KEY = "baton.demoBanner.dismissed";

/** Honest note for judges: FestFlow is synthetic and pre-analysed; everything done on it is saved live. */
export function DemoBanner() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;
  return (
    <div
      role="note"
      data-testid="demo-banner"
      className="mb-3 flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] text-muted"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-subtle" />
      <p className="min-w-0 flex-1">
        FestFlow is a synthetic project, pre-analysed so it opens instantly. Everything you do here (answers,
        resolutions, approvals, acknowledgements) is saved live to the database. To watch the AI analyse new data,{" "}
        <Link href="/new" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          start a new handover
          <ArrowRight className="size-3.5" />
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded p-0.5 text-subtle hover:bg-surface-2 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
