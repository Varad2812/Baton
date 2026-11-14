"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, MessageSquarePlus } from "lucide-react";
import { acknowledgeSection, askFollowUp } from "@/app/_actions/handover";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

export function AcknowledgeButton({
  handoverId,
  section,
  acknowledged,
  canAck,
  reason,
}: {
  handoverId: string;
  section: string;
  acknowledged: boolean;
  canAck: boolean;
  reason: string;
}) {
  const [pending, start] = useTransition();
  const toast = useActionToast();
  if (acknowledged) {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-md border border-verified/30 bg-verified/10 px-2 text-xs text-verified">
        <Check className="size-3.5" /> Acknowledged
      </span>
    );
  }
  const b = (
    <Button
      size="sm"
      variant="outline"
      disabled={!canAck || pending}
      onClick={() => start(async () => toast(await acknowledgeSection({ handoverId, section })))}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      Acknowledge
    </Button>
  );
  return canAck ? b : <Tooltip content={reason}>{b}</Tooltip>;
}

export function FollowUpButton({
  handoverId,
  section,
  claimId,
  canAsk,
  label = "Ask follow-up",
}: {
  handoverId: string;
  section?: string;
  claimId?: string;
  canAsk: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const trigger = (
    <Button size="sm" variant="ghost" disabled={!canAsk} onClick={() => setOpen(true)}>
      <MessageSquarePlus className="size-3.5" />
      {label}
    </Button>
  );
  return (
    <>
      {canAsk ? trigger : <Tooltip content="Only the incoming lead asks follow-ups">{trigger}</Tooltip>}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Ask Meera a follow-up"
        description={section ? `About “${section}”. The answer is attached as testimony and cited like any other source.` : undefined}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || q.trim().length < 5}
              onClick={() =>
                start(async () => {
                  const r = await askFollowUp({ handoverId, question: q, section, claimId });
                  toast(r);
                  if (r.ok || ("pending" in r && r.pending)) setOpen(false);
                })
              }
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Send question
            </Button>
          </>
        }
      >
        <textarea
          autoFocus
          rows={3}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Where is the Razorpay test-mode key stored, and who can rotate it?"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </Dialog>
    </>
  );
}

export function PrintButton() {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden">
      Print receipt
    </Button>
  );
}
