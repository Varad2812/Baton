"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Loader2, TriangleAlert } from "lucide-react";
import { approveVersion } from "@/app/_actions/review";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";
import { fieldClass } from "@/components/ledger/claim-actions";

const OVERRIDE_NOTE_MIN = 10;

export function ApprovePanel({
  slug,
  nextVersion,
  blockers,
  disabledReason,
  summary,
}: {
  slug: string;
  nextVersion: number;
  /** Server-computed blockers (open conflicts, unanswered P1 gaps). Approving with any needs an override. */
  blockers: string[];
  disabledReason: string | null;
  summary: { label: string; value: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const blocked = blockers.length > 0;
  const needsNote = blocked && override && note.trim().length < OVERRIDE_NOTE_MIN;
  const canSubmit = !pending && (!blocked || (override && !needsNote));
  const btn = (
    <Button className="w-full" disabled={!!disabledReason} onClick={() => setOpen(true)} data-tour="approve">
      <BadgeCheck className="size-4" />
      {blocked ? `Review blockers · approve v${nextVersion}` : `Approve as v${nextVersion}`}
    </Button>
  );
  return (
    <>
      {disabledReason ? <Tooltip content={disabledReason} className="w-full">{btn}</Tooltip> : btn}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Approve handover v${nextVersion}`}
        description="Creates an immutable snapshot and compiles a role-safe view for each persona. It cannot be edited afterwards; later changes go into the next version."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canSubmit}
              onClick={() =>
                start(async () => {
                  const r = await approveVersion({ slug, note: note.trim() || undefined, override: blocked ? override : undefined });
                  toast(r, r.ok ? `Approved v${r.data?.number ?? nextVersion}` : undefined);
                  if (r.ok) {
                    setOpen(false);
                    setNote("");
                    setOverride(false);
                  }
                })
              }
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {blocked ? "Approve with override" : "Approve and snapshot"}
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
        {blocked && (
          <div className="mb-3 rounded-md border border-conflicting/35 bg-conflicting/[0.07] px-3 py-2 text-xs text-muted" role="alert">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-conflicting">
              <TriangleAlert className="size-3.5" /> Approval is blocked by {blockers.length} item{blockers.length === 1 ? "" : "s"}
            </p>
            <ul className="space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
            <label className="mt-2 flex items-start gap-2 text-[13px] text-text">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="mt-0.5 size-3.5 accent-[#E8A33D]"
              />
              <span>
                Override: approve anyway. The note below is stored in the version and the audit log, and the open items are listed on the
                receipt.
              </span>
            </label>
          </div>
        )}
        <label htmlFor="approve-note" className="mb-1 block text-xs text-muted">
          {blocked ? `Override note (required, ${OVERRIDE_NOTE_MIN}+ characters)` : "Approval note (optional)"}
        </label>
        <textarea
          id="approve-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Approved for Arjun; registration close and refund cutoff to be confirmed with Dev by 26 Apr."
          className={fieldClass}
        />
        {needsNote && <p className="mt-1 text-xs text-primary">Write why you are overriding ({OVERRIDE_NOTE_MIN}+ characters).</p>}
      </Dialog>
    </>
  );
}
