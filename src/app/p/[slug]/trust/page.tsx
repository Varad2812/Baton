import { Check, ShieldCheck, X } from "lucide-react";
import { getActor } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { getTrust } from "@/lib/views/trust";
import { fmtDateTime, fmtMs, GRADE_LABEL, KIND_LABEL, pct, ROLE_LABEL } from "@/lib/views/format";
import type { Grade, SourceKind } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { AccessChip } from "@/components/ui/access-chip";
import { DataTable } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import { describeAudit } from "@/components/common/audit";
import { SourceIcon } from "@/components/common/source-icon";
import { cn } from "@/lib/utils";

export default async function TrustPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor] = await Promise.all([getProject(slug), getActor()]);
  const t = await getTrust(project.id, actor);
  const totalLeaks = t.leakage.reduce((s, l) => s + l.leaks, 0);

  return (
    <>
      <PageHeader
        title="Trust report"
        description="How far to trust this handover: every quote is checked against its chunk, the result is scored against hand-labelled ground truth, and every role view is scanned for canary strings it must never contain."
      />

      <section className="grid grid-cols-4 gap-3">
        <Stat
          label="Quote validity"
          value={pct(t.quotes.valid, t.quotes.total)}
          unit="%"
          footer={
            <span>
              <span className="font-mono text-muted">
                {t.quotes.valid}/{t.quotes.total}
              </span>{" "}
              exact substring matches · {t.quotes.dropped} dropped
            </span>
          }
        />
        <Stat
          label="Accuracy vs ground truth"
          value={pct(t.accTotals.exact, t.accTotals.total)}
          unit="%"
          footer={
            <span>
              <span className="font-mono text-muted">{t.accTotals.found}</span> of {t.accTotals.total} expected facts found ·{" "}
              <span className="font-mono text-muted">{t.accTotals.exact}</span> with the right grade
            </span>
          }
        />
        <Stat
          label="Canary leakage"
          value={totalLeaks}
          unit="leaks"
          footer={
            <span className={totalLeaks === 0 ? "text-verified" : "text-conflicting"}>
              {totalLeaks === 0 ? "0 across all 4 roles" : "Restricted text reached a role view"}
            </span>
          }
        />
        <Stat
          label="Redactions"
          value={t.redactions.length}
          footer={
            <span>
              {(["SECRET", "EMAIL", "PHONE"] as const)
                .map((k) => `${t.redactions.filter((r) => r.kind === k).length} ${k.toLowerCase()}`)
                .join(" · ")}{" "}
              · before any LLM call
            </span>
          }
        />
      </section>

      <section className="mt-3 grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3">
        <Card>
          <CardHeader
            icon={<ShieldCheck />}
            title="Leakage matrix"
            description={`Each role's compiled view scanned for ${t.canaries.length} canary string${t.canaries.length === 1 ? "" : "s"} planted in restricted sources`}
          />
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-2 py-2 font-medium">Access</th>
                <th className="px-2 py-2 text-right font-medium">Claims shown</th>
                <th className="px-2 py-2 text-right font-medium">Hidden</th>
                <th className="px-2 py-2 text-right font-medium">Chunks withheld</th>
                <th className="px-2 py-2 text-right font-medium">Canaries tested</th>
                <th className="px-4 py-2 text-right font-medium">Leaks</th>
              </tr>
            </thead>
            <tbody>
              {t.leakage.map((l) => (
                <tr key={l.role} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-text">{ROLE_LABEL[l.role]}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex gap-1">
                      {l.levels.map((a) => (
                        <AccessChip key={a} access={a} iconOnly />
                      ))}
                      {l.granted > 0 && (
                        <Badge variant="primary" size="sm">
                          +{l.granted} granted
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">{l.claimsShown}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted">{l.claimsHidden}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted">{l.chunksHidden}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted">{l.canariesTested || "n/a"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 font-mono text-xs",
                        l.leaks === 0 ? "bg-verified/12 text-verified" : "bg-conflicting/15 text-conflicting",
                      )}
                    >
                      {l.leaks === 0 ? <Check className="size-3" /> : <X className="size-3" />}
                      {l.leaks}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-subtle">
            Canaries: <span className="font-mono text-muted">{t.canaries.join(", ")}</span>. Owner and reviewer may see
            restricted sources, so nothing is withheld from them to test.
          </p>
        </Card>

        <Card>
          <CardHeader title="Quote validity by source" description="Exact substring match after whitespace, case and smart-quote normalisation" />
          <ul className="px-4 py-2">
            {t.quotes.byKind.map(([kind, v]) => (
              <li key={kind} className="grid grid-cols-[18px_96px_1fr_64px] items-center gap-2 py-1.5 text-[13px]">
                <SourceIcon kind={kind as SourceKind} />
                <span className="text-muted">{KIND_LABEL[kind as SourceKind]}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-verified" style={{ width: `${pct(v.valid, v.total)}%` }} />
                </span>
                <span className="text-right font-mono text-xs text-muted">
                  {v.valid}/{v.total}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 text-xs text-subtle">
            {t.quotes.discarded} extracted claims were discarded because no quote matched and the model did not mark them as
            inference.
          </p>
        </Card>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        <Card>
          <CardHeader
            title="Accuracy vs ground truth"
            description="seed/ground-truth.json, matched by topic"
          />
          <div className="max-h-[420px] overflow-y-auto">
            {t.accuracy.map((sec) => (
              <div key={sec.name}>
                <div className="sticky top-0 flex items-center justify-between border-y border-border bg-surface-2 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
                  <span>{sec.name}</span>
                  <span className="font-mono normal-case">
                    {sec.exact}/{sec.rows.length}
                  </span>
                </div>
                <ul>
                  {sec.rows.map((r) => (
                    <li key={r.expected + r.label} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 px-4 py-1.5 text-[12.5px]">
                      {r.gradeOk ? (
                        <Check className="size-3.5 text-verified" />
                      ) : r.found ? (
                        <span className="size-2 rounded-full bg-primary" />
                      ) : (
                        <X className="size-3.5 text-conflicting" />
                      )}
                      <span className="truncate text-muted" title={r.label}>
                        {r.label}
                      </span>
                      <span className="font-mono text-[11px] text-subtle">
                        {r.expectGrade
                          ? r.grade
                            ? GRADE_LABEL[r.grade as Grade]
                            : r.expectGrade.toLowerCase()
                          : r.grade
                            ? GRADE_LABEL[r.grade as Grade]
                            : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Redactions" description="Only the fact and the person who mentioned it are stored, never the value" />
            <ul className="divide-y divide-border/70">
              {t.redactions.map((r) => (
                <li key={r.id} className="grid grid-cols-[56px_150px_minmax(0,1fr)_96px_24px] items-center gap-2 px-4 py-2 text-xs">
                  <Badge variant={r.kind === "SECRET" ? "danger" : "outline"} size="sm">
                    {r.kind.toLowerCase()}
                  </Badge>
                  <span className="truncate font-mono text-[11px] text-text">{r.placeholder}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-muted">{r.source}</span>
                    <span className="block truncate font-mono text-[11px] text-subtle">{r.locator}</span>
                  </span>
                  <span className="truncate text-muted">{r.mentionedBy}</span>
                  <AccessChip access={r.access} iconOnly />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Pipeline runs" description="Every run is recorded; cached runs need no API key" />
            <ul className="divide-y divide-border/70">
              {t.runs.map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[13px]">
                    <Badge variant={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "primary"} size="sm">
                      {r.status.toLowerCase()}
                    </Badge>
                    <span className="text-text">{r.mode === "CACHED" ? "Cached" : "Live"}</span>
                    <span className="font-mono text-xs text-subtle">{r.model}</span>
                    <span className="ml-auto font-mono text-xs text-muted">
                      {r.ms !== null ? fmtMs(r.ms) : "—"} · {fmtDateTime(r.startedAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full">
                    {r.stages.map((s) => (
                      <span
                        key={s.stage}
                        title={`${s.stage}: ${fmtMs(s.ms)}`}
                        className={s.stage === "extract" ? "bg-primary/70" : s.stage === "conflicts" || s.stage === "questions" ? "bg-single/70" : "bg-verified/60"}
                        style={{ width: `${(s.ms / Math.max(1, r.ms ?? 1)) * 100}%`, minWidth: 3 }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-subtle">
                    {r.stages.map((s) => s.stage).join(" → ")}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section id="audit" className="mt-3 scroll-mt-28">
        <Card>
          <CardHeader title="Audit log" description={`${t.audit.length} most recent mutations · every action writes a row`} />
          <DataTable
            className="rounded-none border-0"
            maxHeight={420}
            defaultSort={{ key: "at", dir: "desc" }}
            columns={[
              { key: "at", header: "Time", width: "128px", sortable: true },
              { key: "actor", header: "Actor", width: "200px", sortable: true },
              { key: "role", header: "Role", width: "96px", sortable: true },
              { key: "action", header: "Action", width: "150px", sortable: true },
              { key: "detail", header: "Detail" },
            ]}
            rows={t.audit.map((a) => ({
              id: a.id,
              sort: { at: a.at.getTime(), actor: a.actorName, role: a.actorRole, action: a.action },
              cells: {
                at: <span className="font-mono text-[11px] text-subtle">{fmtDateTime(a.at)}</span>,
                actor: (
                  <span className="flex items-center gap-2 text-[13px] text-text">
                    <Avatar name={a.actorName} size={18} /> {a.actorName}
                  </span>
                ),
                role: <span className="font-mono text-[11px] uppercase text-muted">{a.actorRole}</span>,
                action: <span className="font-mono text-xs text-muted">{a.action}</span>,
                detail: <span className="text-xs text-muted">{describeAudit(a)}</span>,
              },
            }))}
          />
        </Card>
      </section>
    </>
  );
}

