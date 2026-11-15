"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { Grade } from "@/generated/prisma/enums";
import { editClaim } from "@/app/_actions/claims";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradeChip } from "@/components/ui/grade-chip";
import { useActionToast } from "@/components/ui/toast";
import { ClaimActions, fieldClass } from "@/components/ledger/claim-actions";
import { DraftButton } from "@/components/assistant/draft-button";
import { cn } from "@/lib/utils";

export type ReviewClaim = {
  id: string;
  title: string;
  statement: string;
  grade: Grade;
  typeLabel: string;
  status: string;
  fromTestimony: boolean;
  reviewerNote: string | null;
  section: string;
};

/** One claim row on the review page, with an inline title/statement/note editor. */
export function ReviewClaimRow({ slug, c, canEdit }: { slug: string; c: ReviewClaim; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [statement, setStatement] = useState(c.statement);
  const [note, setNote] = useState(c.reviewerNote ?? "");
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const rejected = c.status === "REJECTED";

  const save = () =>
    start(async () => {
      const r = await editClaim({
        slug,
        claimId: c.id,
        title: title.trim() !== c.title ? title : undefined,
        statement: statement.trim() !== c.statement ? statement : undefined,
        note: note.trim() !== (c.reviewerNote ?? "") ? note : undefined,
      });
      toast(r, r.ok ? "Claim edited" : undefined);
      if (r.ok) setEditing(false);
    });

  const dirty = title.trim() !== c.title || statement.trim() !== c.statement || note.trim() !== (c.reviewerNote ?? "");

  return (
    <li data-claim={c.id} className={cn("grid grid-cols-[112px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-2.5", rejected && "opacity-55")}>
      <div className="pt-0.5">
        <GradeChip grade={c.grade} />
      </div>
      {editing ? (
        <div className="min-w-0 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Claim title" className={cn(fieldClass, "h-8 py-1")} />
          <div className="relative">
            <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} aria-label="Claim statement" className={cn(fieldClass, "pr-16")} />
            <DraftButton className="absolute right-1.5 top-1.5" field="edit_statement" slug={slug} target={{ claimId: c.id }} value={statement} onApply={setStatement} />
          </div>
          <div className="relative">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Reviewer note"
              placeholder="Reviewer note (optional)"
              className={cn(fieldClass, "h-8 py-1 pr-16 text-xs")}
            />
            <DraftButton className="absolute right-1 top-1/2 -translate-y-1/2" field="reviewer_note" slug={slug} target={{ claimId: c.id }} value={note} onApply={setNote} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={pending || !dirty || title.trim().length < 3 || statement.trim().length < 5}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setTitle(c.title);
                setStatement(c.statement);
                setNote(c.reviewerNote ?? "");
              }}
            >
              Cancel
            </Button>
            <span className="text-xs text-subtle">Quotes stay attached; the edit goes to the audit log.</span>
          </div>
        </div>
      ) : (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/p/${slug}/ledger?claim=${c.id}`} className={cn("text-[13px] text-text hover:underline", rejected && "line-through")}>
              {c.title}
            </Link>
            <span className="text-[11px] text-subtle">{c.typeLabel}</span>
            {c.status === "EDITED" && <Badge variant="info" size="sm">edited</Badge>}
            {rejected && <Badge variant="danger" size="sm">rejected</Badge>}
            {c.fromTestimony && <Badge variant="testimony" size="sm">testimony</Badge>}
          </div>
          <p className={cn("mt-0.5 line-clamp-2 text-xs leading-relaxed", c.grade === "INFERRED" ? "italic text-muted" : "text-muted")}>
            {c.statement}
          </p>
          {c.reviewerNote && (
            <p className="mt-1 text-xs text-single">
              <span className="text-subtle">Reviewer note:</span> {c.reviewerNote}
            </p>
          )}
        </div>
      )}
      <ClaimActions
        slug={slug}
        claimId={c.id}
        statement={c.statement}
        rejected={rejected}
        canEdit={canEdit && !editing}
        canAsk={false}
        compact
        onEdit={() => setEditing(true)}
      />
    </li>
  );
}
