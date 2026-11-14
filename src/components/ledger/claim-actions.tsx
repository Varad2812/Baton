"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2, MessageSquarePlus, Pencil } from "lucide-react";
import { editClaim, rejectClaim } from "@/app/_actions/claims";
import { askFollowUp } from "@/app/_actions/handover";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

const area =
  "w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] leading-relaxed text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30";

export function ClaimActions({
  claimId,
  statement,
  canEdit,
  canAsk,
  handoverId,
  section,
  compact = false,
}: {
  claimId: string;
  statement: string;
  canEdit: boolean;
  canAsk: boolean;
  handoverId?: string | null;
  section?: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<null | "edit" | "reject" | "ask">(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const reason = "Only the owner or reviewer can edit claims";

  const open = (m: "edit" | "reject" | "ask") => {
    setText(m === "edit" ? statement : "");
    setMode(m);
  };
  const submit = () =>
    start(async () => {
      const r =
        mode === "edit"
          ? await editClaim({ claimId, statement: text })
          : mode === "reject"
            ? await rejectClaim({ claimId, reason: text })
            : await askFollowUp({ handoverId: handoverId ?? "", question: text, claimId, section });
      toast(r);
      if (r.ok || r.pending) setMode(null);
    });

  const gated = (label: string, icon: React.ReactNode, m: "edit" | "reject", destructive = false) => {
    const b = (
      <Button
        variant={destructive ? "ghost" : "outline"}
        size="sm"
        disabled={!canEdit}
        onClick={() => open(m)}
        className={destructive ? "text-conflicting hover:bg-conflicting/10 hover:text-conflicting" : undefined}
      >
        {icon}
        {!compact && label}
      </Button>
    );
    return canEdit ? b : <Tooltip content={reason}>{b}</Tooltip>;
  };

  return (
    <div className="flex items-center gap-1.5">
      {canAsk && (
        <Button variant="outline" size="sm" onClick={() => open("ask")}>
          <MessageSquarePlus className="size-3.5" />
          Ask a follow-up
        </Button>
      )}
      {gated("Edit", <Pencil className="size-3.5" />, "edit")}
      {gated("Reject", <Ban className="size-3.5" />, "reject", true)}
      <Dialog
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "edit" ? "Edit claim statement" : mode === "reject" ? "Reject claim" : "Ask Meera a follow-up"}
        description={
          mode === "edit"
            ? "Edits are kept as a new revision; the original quotes stay attached."
            : mode === "reject"
              ? "Rejected claims are excluded from every compiled handover. Give a reason for the audit log."
              : "Meera is notified and the answer is attached to this claim as testimony."
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={mode === "reject" ? "destructive" : "default"}
              disabled={pending || text.trim().length < 3}
              onClick={submit}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {mode === "edit" ? "Save edit" : mode === "reject" ? "Reject claim" : "Send question"}
            </Button>
          </>
        }
      >
        <textarea
          autoFocus
          rows={mode === "edit" ? 5 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "reject" ? "e.g. Superseded by the 02-Apr decision" : mode === "ask" ? "e.g. Who has the Razorpay dashboard login?" : ""}
          className={area}
        />
      </Dialog>
    </div>
  );
}
