"use client";

import { useState, useTransition } from "react";
import { Loader2, PenLine } from "lucide-react";
import { requestAccess } from "@/app/_actions/claims";
import { DraftButton } from "@/components/assistant/draft-button";
import { usePeople } from "@/components/common/people-context";
import { fieldClass } from "@/components/ledger/claim-actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useActionToast } from "@/components/ui/toast";

/**
 * "Request access" sends a request right away (default reason). "Add reason" opens a dialog with a
 * reason box (and Smart Draft) first. Both write one `access.requested` audit row on the server.
 */
export function RequestAccess({ slug, section, variant = "outline" }: { slug: string; section?: string; variant?: "outline" | "ghost" }) {
  const people = usePeople();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const send = (withReason?: string) =>
    start(async () => {
      const r = await requestAccess({ slug, section, reason: withReason });
      toast(r, r.ok ? "Access requested" : undefined);
      if (r.ok) {
        setOpen(false);
        setReason("");
      }
    });
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant={variant} disabled={pending} onClick={() => send()}>
        {pending && !open && <Loader2 className="size-3.5 animate-spin" />}
        Request access
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(true)}>
        <PenLine className="size-3.5" />
        Add reason
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Request access"
        description={`${people.owner} (owner) sees the request in the audit log and can grant the source. Nothing hidden is shown until then.`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending || reason.trim().length < 3} onClick={() => send(reason)}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Send request
            </Button>
          </>
        }
      >
        <div className="relative">
          <textarea
            autoFocus
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason for requesting access"
            placeholder={`e.g. I need the sponsor terms to plan the first 30 days${section ? ` (${section})` : ""}.`}
            className={`${fieldClass} pr-16`}
          />
          <DraftButton className="absolute right-1.5 top-1.5" field="access_reason" slug={slug} target={{ section }} value={reason} onApply={setReason} />
        </div>
      </Dialog>
    </span>
  );
}
