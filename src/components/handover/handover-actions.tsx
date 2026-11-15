"use client";

import { useState, useTransition } from "react";
import { usePeople } from "@/components/common/people-context";
import { Check, Loader2, MessageSquarePlus } from "lucide-react";
import { acknowledgeSection, askFollowUp } from "@/app/_actions/handover";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

export function AcknowledgeButton({
  slug,
  version,
  section,
  acknowledged,
  canAck,
  reason,
}: {
  slug: string;
  version: number | null;
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
      disabled={!canAck || !version || pending}
      aria-label={`Acknowledge ${section}`}
      onClick={() =>
        start(async () => {
          if (!version) return;
          const r = await acknowledgeSection({ slug, version, section });
          toast(r, r.ok ? "Acknowledged" : undefined);
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      Acknowledge
    </Button>
  );
  return canAck && version ? b : <Tooltip content={reason}>{b}</Tooltip>;
}

export function FollowUpButton({
  slug,
  section,
  claimId,
  canAsk,
  label = "Ask follow-up",
}: {
  slug: string;
  section?: string;
  claimId?: string;
  canAsk: boolean;
  label?: string;
}) {
  const people = usePeople();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const trigger = (
    <Button size="sm" variant="ghost" disabled={!canAsk} onClick={() => setOpen(true)} aria-label={section ? `Ask a follow-up about ${section}` : label}>
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
        title={`Ask ${people.owner} a follow-up`}
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
                  const r = await askFollowUp({ slug, question: q, section, claimId });
                  toast(r, r.ok ? "Follow-up sent" : undefined);
                  if (r.ok) {
                    setOpen(false);
                    setQ("");
                  }
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
          aria-label="Your question"
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
