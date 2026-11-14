"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { approveVersion } from "@/app/_actions/review";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

export function ApprovePanel({
  handoverId,
  nextVersion,
  blockers,
  disabledReason,
  summary,
}: {
  handoverId: string;
  nextVersion: number;
  blockers: string[];
  disabledReason: string | null;
  summary: { label: string; value: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const btn = (
    <Button className="w-full" disabled={!!disabledReason} onClick={() => setOpen(true)}>
      <BadgeCheck className="size-4" />
      Approve as v{nextVersion}
    </Button>
  );
  return (
    <>
      {disabledReason ? <Tooltip content={disabledReason} className="w-full">{btn}</Tooltip> : btn}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Approve handover v${nextVersion}`}
        description="Creates an immutable snapshot and compiles a role-safe view for each persona. This cannot be edited afterwards; later changes go into the next version."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await approveVersion({ handoverId, note: note || undefined });
                  toast(r);
                  if (r.ok || ("pending" in r && r.pending)) setOpen(false);
                })
              }
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Approve and snapshot
            </Button>
          </>
        }
      >
        <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          {summary.map((s) => (
            <div key={s.label} className="flex justify-between gap-2">
              <dt className="text-muted">{s.label}</dt>
              <dd className="font-mono text-text">{s.value}</dd>
            </div>
          ))}
        </dl>
        {blockers.length > 0 && (
          <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted">
            <p className="mb-1 font-medium text-primary">Approving with open items</p>
            <ul className="space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          </div>
        )}
        <label htmlFor="approve-note" className="mb-1 block text-xs text-muted">
          Approval note
        </label>
        <textarea
          id="approve-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Approved for Arjun; payment gateway to be confirmed with Dev by 26 Apr."
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </Dialog>
    </>
  );
}
