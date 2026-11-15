"use client";

import { useState, useTransition } from "react";
import { usePeople } from "@/components/common/people-context";
import Link from "next/link";
import { Loader2, MessageSquareText } from "lucide-react";
import { resolveConflict } from "@/app/_actions/conflicts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

type Res = "A" | "B" | "BOTH" | "ASKED";

export function ResolveBar({
  slug,
  conflictId,
  titleA,
  titleB,
  canResolve,
}: {
  slug: string;
  conflictId: string;
  titleA: string;
  titleB: string;
  canResolve: boolean;
}) {
  const people = usePeople();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Res | null>(null);
  const [askedId, setAskedId] = useState<string | null>(null);
  const [, start] = useTransition();
  const toast = useActionToast();
  const go = (resolution: Res) => {
    setBusy(resolution);
    start(async () => {
      const r = await resolveConflict({ slug, conflictId, resolution, note: note || undefined });
      toast(r, r.ok ? (resolution === "ASKED" ? `Asked ${people.owner}` : "Conflict resolved") : undefined);
      if (r.ok && resolution === "ASKED") setAskedId(r.data?.questionId ?? null);
      setBusy(null);
    });
  };
  const btn = (r: Res, label: string, hint: string, variant: "outline" | "ghost" | "default" = "outline") => (
    <Tooltip key={r} content={hint}>
      <Button size="sm" variant={variant} disabled={!canResolve || busy !== null} onClick={() => go(r)}>
        {busy === r && <Loader2 className="size-3.5 animate-spin" />}
        {label}
      </Button>
    </Tooltip>
  );
  const bar = (
    <div className="flex items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={!canResolve}
        placeholder="Resolution note (optional, goes to the audit log)"
        aria-label="Resolution note"
        className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2.5 text-xs text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
      />
      {btn("A", "Pick A", `Keep "${titleA}"; reject B`)}
      {btn("B", "Pick B", `Keep "${titleB}"; reject A`)}
      {btn("BOTH", "Both valid", "Both facts stand (e.g. different scopes)", "ghost")}
      {btn("ASKED", `Ask ${people.owner}`, "Queue a question in the gap interview; stays open until answered", "default")}
      {askedId && (
        <Link href={`/p/${slug}/interview#${askedId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <MessageSquareText className="size-3.5" /> Open question
        </Link>
      )}
    </div>
  );
  return canResolve ? bar : <Tooltip content="Only the owner or reviewer can resolve conflicts" className="w-full">{bar}</Tooltip>;
}
