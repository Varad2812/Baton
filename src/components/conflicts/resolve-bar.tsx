"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { resolveConflict } from "@/app/_actions/conflicts";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

type Res = "A" | "B" | "BOTH" | "ASKED";

export function ResolveBar({
  conflictId,
  labelA,
  labelB,
  canResolve,
}: {
  conflictId: string;
  labelA: string;
  labelB: string;
  canResolve: boolean;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Res | null>(null);
  const [, start] = useTransition();
  const toast = useActionToast();
  const go = (resolution: Res) => {
    setBusy(resolution);
    start(async () => {
      toast(await resolveConflict({ conflictId, resolution, note: note || undefined }));
      setBusy(null);
    });
  };
  const btn = (r: Res, label: string, variant: "outline" | "ghost" | "default" = "outline") => (
    <Button key={r} size="sm" variant={variant} disabled={!canResolve || busy !== null} onClick={() => go(r)}>
      {busy === r && <Loader2 className="size-3.5 animate-spin" />}
      {label}
    </Button>
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
      {btn("A", `Keep ${labelA}`)}
      {btn("B", `Keep ${labelB}`)}
      {btn("BOTH", "Both valid", "ghost")}
      {btn("ASKED", "Ask Meera", "default")}
    </div>
  );
  return canResolve ? bar : <Tooltip content="Only the owner or reviewer can resolve conflicts" className="w-full">{bar}</Tooltip>;
}
