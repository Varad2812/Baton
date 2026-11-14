"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2, MessageSquarePlus, Pencil, Undo2 } from "lucide-react";
import { editClaim, rejectClaim } from "@/app/_actions/claims";
import { askFollowUp } from "@/app/_actions/handover";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

export const fieldClass =
  "w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] leading-relaxed text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30";

/** Edit (dialog) / reject with a reason / restore / ask a follow-up. Every action is re-checked on the server. */
export function ClaimActions({
  slug,
  claimId,
  statement,
  rejected = false,
  canEdit,
  canAsk,
  section,
  compact = false,
  onEdit,
}: {
  slug: string;
  claimId: string;
  statement: string;
  rejected?: boolean;
  canEdit: boolean;
  canAsk: boolean;
  section?: string;
  compact?: boolean;
  /** When set, "Edit" calls this (e.g. to open an inline editor) instead of the dialog. */
  onEdit?: () => void;
}) {
  const [mode, setMode] = useState<null | "edit" | "reject" | "ask">(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const reason = "Only the owner or reviewer can edit claims";

  const open = (m: "edit" | "reject" | "ask") => {
    if (m === "edit" && onEdit) return onEdit();
    setText(m === "edit" ? statement : "");
    setMode(m);
  };
  const submit = () =>
    start(async () => {
      const r =
        mode === "edit"
          ? await editClaim({ slug, claimId, statement: text })
          : mode === "reject"
            ? await rejectClaim({ slug, claimId, reason: text })
            : await askFollowUp({ slug, question: text, claimId, section });
      toast(r, r.ok ? (mode === "edit" ? "Claim edited" : mode === "reject" ? "Claim rejected" : "Follow-up sent") : undefined);
      if (r.ok) setMode(null);
    });
  const restore = () =>
    start(async () => {
      const r = await rejectClaim({ slug, claimId, undo: true });
      toast(r, r.ok ? "Claim restored" : undefined);
    });

  const gated = (label: string, icon: React.ReactNode, onClick: () => void, destructive = false) => {
    const b = (
      <Button
        variant={destructive ? "ghost" : "outline"}
        size="sm"
        disabled={!canEdit || pending}
        onClick={onClick}
        aria-label={compact ? label : undefined}
        className={destructive ? "text-conflicting hover:bg-conflicting/10 hover:text-conflicting" : undefined}
      >
        {icon}
        {!compact && label}
      </Button>
    );
    return canEdit ? (compact ? <Tooltip content={label}>{b}</Tooltip> : b) : <Tooltip content={reason}>{b}</Tooltip>;
  };

  return (
    <div className="flex items-center gap-1.5">
      {canAsk && (
        <Button variant="outline" size="sm" onClick={() => open("ask")}>
          <MessageSquarePlus className="size-3.5" />
          Ask a follow-up
        </Button>
      )}
      {rejected ? (
        gated("Restore", pending ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />, restore)
      ) : (
        <>
          {gated("Edit", <Pencil className="size-3.5" />, () => open("edit"))}
          {gated("Reject", <Ban className="size-3.5" />, () => open("reject"), true)}
        </>
      )}
      <Dialog
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "edit" ? "Edit claim statement" : mode === "reject" ? "Reject claim" : "Ask Meera a follow-up"}
        description={
          mode === "edit"
            ? "The edit is recorded in the audit log; the original quotes stay attached."
            : mode === "reject"
              ? "Rejected claims are excluded from every compiled handover. Give a reason for the audit log."
              : "Meera answers from her follow-up inbox; the answer is attached to this claim as testimony."
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={mode === "reject" ? "destructive" : "default"}
              disabled={pending || text.trim().length < (mode === "edit" ? 5 : mode === "ask" ? 5 : 3)}
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
          aria-label={mode === "reject" ? "Reason for rejecting" : mode === "ask" ? "Your question" : "Statement"}
          rows={mode === "edit" ? 5 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "reject" ? "e.g. Superseded by the 02-Apr decision" : mode === "ask" ? "e.g. Who has the Razorpay dashboard login?" : ""}
          className={fieldClass}
        />
      </Dialog>
    </div>
  );
}
