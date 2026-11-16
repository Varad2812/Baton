import Link from "next/link";
import { Check, ShieldCheck, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { accessLevelsFor, can, getActor } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { trustReport } from "@/lib/pipeline/trust";
import { qaSafety } from "@/lib/ask/service";
import { recheckQuotes, runLeakageTest } from "@/app/_actions/trust";
import { ActionButton } from "@/components/common/action-button";
import { fmtDateTime, fmtMs, KIND_LABEL, pct, ROLE_LABEL } from "@/lib/views/format";
import type { SourceKind } from "@/generated/prisma/enums";
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
  const [project, actor] = await Promise.all([getProject(slug), getActor(slug)]);
  const [t, qa] = await Promise.all([trustReport(actor, project.id, slug), qaSafety(project.id)]);
  const leaksOf = (l: (typeof t.leakage.results)[number]) => l.draftHits + l.promptHits + (l.storedHits ?? 0);
  const totalLeaks = t.leakage.totalHits;
  const canaries = [...new Set(t.leakage.results.flatMap((l) => l.canaries))];
  const lastLeakTest = t.audit.find((a) => a.action === "trust.leakage_test");
  const lastRecheck = t.audit.find((a) => a.action === "trust.recheck_quotes");
  const acc = t.accuracy;
  const CATS = [
    ["decisions", "Decisions"],
    ["risks", "Risks"],
    ["gaps", "Gaps (MISSING)"],
    ["recurring", "Recurring problems"],
    ["conflicts", "Conflicts"],
    ["supersessions", "Evolution (supersedes)"],
  ] as const;
  const accExpected = acc ? CATS.reduce((n, [k]) => n + acc.categories[k].expected, 0) : 0;
  const accFound = acc ? CATS.reduce((n, [k]) => n + acc.categories[k].found, 0) : 0;

  return (
    <>
      <PageHeader
        title="Safety checks"
        description="Proof the handover can be trusted: quotes are re-checked, results are scored against an answer key, and each role is tested for leaks."
        tryThis={{ text: "Run the leakage test and see 0 secrets reach the wrong role.", selector: '[data-tour="leakage"] button' }}
        actions={
          <>
            <ActionButton
              action={recheckQuotes.bind(null, { slug })}
              disabledReason={can(actor.role, "edit_claims") ? null : "Only the owner or reviewer re-checks quotes"}
            >
              Re-check quotes
            </ActionButton>
            <ActionButton action={runLeakageTest.bind(null, { slug })} variant="default">
              Run leakage test
            </ActionButton>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Quote validity"
          help="Share of cited quotes found word-for-word in the original source text. Anything else is dropped."
          value={pct(t.quotes.valid, t.quotes.total)}
          unit="%"
          footer={
            <span>
              <span className="font-mono text-muted">
                {t.quotes.valid}/{t.quotes.total}
              </span>{" "}
              exact substring matches · {t.quotes.dropped} dropped
              {lastRecheck && <> · re-checked {fmtDateTime(lastRecheck.at)}</>}
            </span>
          }
        />
        <Stat
          label="Recall vs ground truth"
          help="How many of the known facts in the FestFlow answer key Baton found."
          value={acc ? Math.round(acc.recall * 100) : "—"}
          unit={acc ? "%" : undefined}
          footer={
            acc ? (
              <span>
                <span className="font-mono text-muted">{accFound}</span> of {accExpected} expected items found · precision{" "}
                <span className="font-mono text-muted">{Math.round(acc.precision * 100)}%</span>
              </span>
            ) : (
              <span>Ground truth exists for the sample project only</span>
            )
          }
        />
        <Stat
          label="Canary leakage"
          help="Planted secret strings in restricted data. 0 means no role saw anything it should not."
          value={totalLeaks}
          unit="leaks"
          footer={
            <span className={totalLeaks === 0 ? "text-verified" : "text-conflicting"}>
              {totalLeaks === 0 ? "0 across all 4 roles" : "Restricted text reached a role view"}
              {lastLeakTest && <span className="text-subtle"> · last test {fmtDateTime(lastLeakTest.at)}</span>}
            </span>
          }
        />
        <Stat
          label="Redactions"
          help="Secrets, emails and phone numbers removed before any text reaches the AI."
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

      <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card data-tour="leakage">
          <CardHeader
            icon={<ShieldCheck />}
            title="Leakage matrix"
            description="Each role is compiled from the current draft; the writer input, the draft view and the stored view of the latest version are scanned for every canary and hidden quote that role may not see"
          />
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-2 py-2 font-medium">Access</th>
                <th className="px-2 py-2 text-right font-medium">Facts shown</th>
                <th className="px-2 py-2 text-right font-medium">Hidden</th>
                <th className="px-2 py-2 text-right font-medium">Chunks withheld</th>
                <th className="px-2 py-2 text-right font-medium">Strings checked</th>
                <th className="px-2 py-2 text-right font-medium">Stored view</th>
                <th className="px-4 py-2 text-right font-medium">Leaks</th>
              </tr>
            </thead>
            <tbody>
              {t.leakage.results.map((l) => (
                <tr key={l.role} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-text">{ROLE_LABEL[l.role]}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex gap-1">
                      {accessLevelsFor(l.role).map((a) => (
                        <AccessChip key={a} access={a} iconOnly />
                      ))}
                      {l.granted > 0 && (
                        <Badge variant="primary" size="sm">
                          +{l.granted} granted
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono">{l.visibleClaims}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted">{l.hiddenClaims}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted">{l.hiddenChunks}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted">{l.canariesChecked || "n/a"}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted">{l.storedVersion ? `v${l.storedVersion}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 font-mono text-xs",
                        leaksOf(l) === 0 ? "bg-verified/12 text-verified" : "bg-conflicting/15 text-conflicting",
                      )}
                    >
                      {leaksOf(l) === 0 ? <Check className="size-3" /> : <X className="size-3" />}
                      {leaksOf(l)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-subtle">
            Canaries: <span className="font-mono text-muted">{canaries.join(", ") || "none withheld"}</span>. Owner and reviewer may
            see restricted sources, so nothing is withheld from them to test.
          </p>
        </Card>

        <Card data-testid="qa-safety">
          <CardHeader
            icon={<ShieldCheck />}
            title="Q&A safety"
            description="Every “Ask the handover” answer, checked before it is shown"
            actions={
              <Link href={`/p/${slug}/ask`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Ask the handover
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
            {[
              ["Answers given", String(qa.answered), "Cited answers delivered"],
              ["Refused", String(qa.refused), qa.refusedGap ? `${qa.refusedGap} known gaps` : "Not in the handover"],
              ["Citation validity", `${qa.citations ? pct(qa.validCitations, qa.citations) : 100}%`, `${qa.validCitations} of ${qa.citations} delivered citations`],
              ["Leaks", String(qa.leaks), qa.refusedLeak ? `${qa.refusedLeak} blocked by the canary scan` : "Canary + hidden-quote scan"],
            ].map(([label, value, sub]) => (
              <div key={label} className="bg-surface px-4 py-3">
                <div className="text-xs text-subtle">{label}</div>
                <div data-qa-stat={label} className={cn("mt-0.5 font-mono text-[20px] tabular-nums", label === "Leaks" && qa.leaks === 0 && "text-verified")}>
                  {value}
                </div>
                <div className="text-[11px] text-subtle">{sub}</div>
              </div>
            ))}
          </div>
          <p className="border-t border-border px-4 py-2.5 text-xs text-subtle">
            {qa.asked === 0
              ? "No questions asked yet in this project."
              : `${qa.asked} questions so far. The validator removed ${qa.sentencesDropped} uncited sentence${qa.sentencesDropped === 1 ? "" : "s"} before anyone saw them (${qa.proposedCitations} citations proposed by the engines).`}
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

      <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Accuracy vs ground truth"
            description="seed/ground-truth.json, matched by topic"
          />
          {acc ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-2 py-2 text-right font-medium">Found</th>
                  <th className="px-2 py-2 text-right font-medium">Grade ok</th>
                  <th className="px-4 py-2 font-medium">Missed</th>
                </tr>
              </thead>
              <tbody>
                {CATS.map(([k, label]) => {
                  const c = acc.categories[k];
                  return (
                    <tr key={k} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 text-text">
                        <span className="inline-flex items-center gap-2">
                          {c.found === c.expected ? <Check className="size-3.5 text-verified" /> : <X className="size-3.5 text-conflicting" />}
                          {label}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {c.found}/{c.expected}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-muted">
                        {/* Only decisions and risks carry an expected grade in ground-truth.json. */}
                        {k === "decisions" || k === "risks" ? `${c.gradeMatches ?? 0}/${c.expected}` : "—"}
                      </td>
                      <td className="max-w-0 truncate px-4 py-2 font-mono text-[11px] text-subtle" title={c.missed.join(", ")}>
                        {c.missed.length ? c.missed.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-start gap-2 px-4 py-4">
              <p className="text-[13px] text-muted">
                No hand-labelled ground truth exists for this project, so accuracy is not scored. Quote validity and leakage on this page
                are measured on this project&apos;s own records.
              </p>
              <Link href="/p/festflow/trust" className={buttonVariants({ variant: "outline", size: "sm" })}>
                See a scored sample project
              </Link>
            </div>
          )}
          {acc && (
            <p className="border-t border-border px-4 py-2 text-xs text-subtle">
              Scores the current ledger: {acc.matchedClaims}/{acc.claims} claims matched · F1 {Math.round(acc.f1 * 100)}% · canary in
              claims {acc.canaryInClaims}. Reviewer rejections lower recall until Reset demo.
            </p>
          )}
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

