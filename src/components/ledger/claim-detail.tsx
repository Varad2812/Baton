import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import type { ClaimFull } from "@/lib/views/claims";
import { citationLabel, fmtDateTime, fmtDateYear, TYPE_LABEL } from "@/lib/views/format";
import { GradeChip } from "@/components/ui/grade-chip";
import { AccessChip } from "@/components/ui/access-chip";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SourceIcon } from "@/components/common/source-icon";
import { QuoteExcerpt } from "@/components/ledger/quote-excerpt";
import { SourceViewer } from "@/components/ledger/source-viewer";

type Ev = ClaimFull["evidence"][number];

export function EvidenceItem({
  e,
  tone = "support",
  compact = false,
}: {
  e: Ev;
  tone?: "support" | "contradict";
  compact?: boolean;
}) {
  const src = e.chunk.source;
  const label = citationLabel(src, e.chunk, e.matchStart);
  return (
    <div
      className={
        tone === "contradict"
          ? "rounded-md border border-conflicting/35 bg-conflicting/[0.04]"
          : "rounded-md border border-border bg-bg/60"
      }
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5">
        <SourceIcon kind={src.kind} />
        <span className="whitespace-nowrap font-mono text-[11.5px] text-text">{label}</span>
        {!compact && <span className="truncate text-xs text-subtle">{src.title}</span>}
        <span className={compact ? "ml-auto flex shrink-0 items-center gap-1.5 [&>*:last-child]:hidden" : "ml-auto flex shrink-0 items-center gap-1.5"}>
          {src.authoritative && <Badge variant="success" size="sm">authoritative</Badge>}
          {e.quoteValid ? (
            <Badge variant="outline" size="sm" className="font-mono" title="Quote string-matched in the chunk">
              exact match
            </Badge>
          ) : (
            <Badge variant="danger" size="sm">unverified</Badge>
          )}
        </span>
      </div>
      <div className="px-3 py-2.5">
        <QuoteExcerpt
          text={e.chunk.text}
          quote={e.quote}
          start={e.matchStart}
          end={e.matchEnd}
          tone={tone}
          window={compact ? 140 : 240}
        />
      </div>
      <div className="flex items-center gap-2 border-t border-border/70 px-3 py-1 text-[11px] text-subtle">
        <span className="whitespace-nowrap font-mono">{e.chunk.locator}</span>
        {!compact && e.chunk.author && (
          <>
            <span>·</span>
            <span>{e.chunk.author}</span>
          </>
        )}
        {!compact && e.chunk.timestamp && (
          <>
            <span>·</span>
            <span className="font-mono">{fmtDateTime(e.chunk.timestamp)}</span>
          </>
        )}
        <span className="ml-auto">
          <SourceViewer
            title={src.title}
            description={`${e.chunk.locator} · chunk ${e.chunk.ordinal + 1} · ${e.chunk.text.length} chars · already redacted`}
            uri={src.uri}
          >
            <QuoteExcerpt
              text={e.chunk.text}
              quote={e.quote}
              start={e.matchStart}
              end={e.matchEnd}
              window={null}
              tone={tone}
              className="font-mono text-[12px]"
            />
          </SourceViewer>
        </span>
      </div>
    </div>
  );
}

export type ConflictInfo = {
  id: string;
  kind: "CONTRADICTS" | "SUPERSEDES";
  status: "OPEN" | "RESOLVED";
  note: string | null;
  role: "A" | "B";
  partner: ClaimFull | null;
};

export function ClaimDetail({ claim, conflicts, slug }: { claim: ClaimFull; conflicts: ConflictInfo[]; slug: string }) {
  const supports = claim.evidence.filter((e) => e.relation === "SUPPORTS");
  const contradicts = claim.evidence.filter((e) => e.relation === "CONTRADICTS");
  const sourceCount = new Set(supports.map((e) => e.chunk.sourceId)).size;
  return (
    <div className="space-y-5" data-tour="ledger-claim">
      <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-subtle">Owner</dt>
        <dd className="flex items-center gap-1.5 text-text">
          {claim.owner ? (
            <>
              <Avatar name={claim.owner.name} size={18} /> {claim.owner.name}
            </>
          ) : (
            <span className="text-muted">Unassigned</span>
          )}
        </dd>
        <dt className="text-subtle">Date</dt>
        <dd className="font-mono text-[12px] text-muted">{fmtDateYear(claim.date)}</dd>
        <dt className="text-subtle">Section</dt>
        <dd className="text-muted">{claim.section}</dd>
        <dt className="text-subtle">Topic</dt>
        <dd className="font-mono text-[12px] text-muted">{claim.topicKey}</dd>
        <dt className="text-subtle">Status</dt>
        <dd className="text-muted">
          {claim.status.toLowerCase()}
          {claim.reviewerNote && <span className="ml-2 text-xs text-subtle">Reviewer: {claim.reviewerNote}</span>}
        </dd>
      </dl>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">Statement</h3>
        <p
          className={
            claim.grade === "INFERRED"
              ? "border-l-2 border-dashed border-inferred/60 pl-3 text-[14px] italic leading-relaxed text-muted"
              : "text-[14px] leading-relaxed text-text"
          }
        >
          {claim.statement}
        </p>
        {claim.grade === "INFERRED" && (
          <p className="mt-1.5 text-xs text-inferred">Model inference. Not stated in any source; confirm before relying on it.</p>
        )}
      </section>

      <section className="rounded-md border border-border bg-surface-2/50 px-3 py-2.5">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">Why this grade</h3>
        <p className="mt-1 text-[13px] text-text">{claim.gradeReason}</p>
        <p className="mt-1 font-mono text-[11px] text-subtle">
          {supports.length} supporting quote{supports.length === 1 ? "" : "s"} · {sourceCount} distinct source
          {sourceCount === 1 ? "" : "s"} · {supports.filter((e) => e.chunk.source.authoritative).length} authoritative
        </p>
      </section>

      {conflicts
        .filter((c) => c.kind === "CONTRADICTS")
        .map((c) => (
          <section key={c.id}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-conflicting">
                Contradicted {c.status === "OPEN" ? "· open conflict" : "· resolved"}
              </h3>
              <Link href={`/p/${slug}/conflicts#${c.id}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
                Resolve <ArrowRight className="size-3" />
              </Link>
            </div>
            {c.note && <p className="mb-2 text-xs text-muted">{c.note}</p>}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <p className="truncate text-xs font-medium text-text">This claim</p>
                {supports.slice(0, 1).map((e) => (
                  <EvidenceItem key={e.id} e={e} compact />
                ))}
              </div>
              <div className="space-y-1.5">
                {c.partner ? (
                  <>
                    <Link href={`?claim=${c.partner.id}`} scroll={false} className="block truncate text-xs font-medium text-conflicting hover:underline">
                      {c.partner.title}
                    </Link>
                    {c.partner.evidence
                      .filter((e) => e.relation === "SUPPORTS")
                      .slice(0, 1)
                      .map((e) => (
                        <EvidenceItem key={e.id} e={e} tone="contradict" compact />
                      ))}
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-3 text-xs text-subtle">
                    <Lock className="size-3" /> Contradicting claim hidden at your access level
                  </p>
                )}
              </div>
            </div>
          </section>
        ))}

      {conflicts
        .filter((c) => c.kind === "SUPERSEDES")
        .map((c) => (
          <section key={c.id} className="rounded-md border border-border px-3 py-2.5 text-[13px]">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-verified">Evolution</h3>
            <p className="mt-1 text-muted">
              {c.role === "A" ? "Superseded by " : "Supersedes "}
              {c.partner ? (
                <Link href={`?claim=${c.partner.id}`} scroll={false} className="text-text hover:underline">
                  {c.partner.title}
                </Link>
              ) : (
                "a hidden claim"
              )}
              . {c.note}
            </p>
          </section>
        ))}

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-subtle">
          Evidence <span className="font-mono normal-case text-muted">{supports.length}</span>
        </h3>
        {supports.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-[13px] text-muted">
            {claim.grade === "MISSING"
              ? "No record answers this checklist item. It is queued for the gap interview with Meera."
              : "No quote survived validation; this claim is shown as an inference only."}
          </p>
        ) : (
          <div className="space-y-2">
            {supports.map((e) => (
              <EvidenceItem key={e.id} e={e} />
            ))}
          </div>
        )}
      </section>

      {contradicts.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-conflicting">
            Contradicting evidence <span className="font-mono">{contradicts.length}</span>
          </h3>
          <div className="space-y-2">
            {contradicts.map((e) => (
              <EvidenceItem key={e.id} e={e} tone="contradict" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function ClaimSubtitle({ claim }: { claim: ClaimFull }) {
  return (
    <>
      <GradeChip grade={claim.grade} />
      <Badge variant="outline">{TYPE_LABEL[claim.type]}</Badge>
      <AccessChip access={claim.access} />
      {claim.fromTestimony && <Badge variant="testimony">testimony</Badge>}
      {claim.status === "REJECTED" && <Badge variant="danger">rejected</Badge>}
      <span className="font-mono text-[11px] text-subtle">{claim.id}</span>
    </>
  );
}
