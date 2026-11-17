import Link from "next/link";
import { Users } from "lucide-react";
import { can, getActor, projectPersonas } from "@/lib/authz";
import { loadRadar } from "@/lib/radar/load";
import { getProject } from "@/lib/views/project";
import { fmtDate } from "@/lib/views/format";
import { RadarView } from "@/components/radar/radar-view";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Info } from "@/components/ui/info";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function RadarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor, ppl] = await Promise.all([getProject(slug), getActor(slug), projectPersonas(slug)]);
  const r = await loadRadar(actor, project.id);
  const owner = ppl.meera.name.split(" ")[0];
  const canAct = can(actor.role, "edit_claims") || can(actor.role, "ask_followups");
  const towers = r.areas.slice(0, 16).map((a) => ({
    key: a.key,
    label: a.label,
    kind: a.kind,
    risk: a.risk,
    concentration: a.concentration,
    detail:
      a.kind === "code"
        ? `${a.topOwner?.name} wrote ${Math.round((a.topOwner?.share ?? 0) * 100)}% of ${a.commits} commits · bus factor ${a.busFactor}`
        : `${a.items.length} finding${a.items.length === 1 ? "" : "s"}: ${a.missing ?? 0} missing, ${a.conflicting ?? 0} conflicting, ${a.inferred ?? 0} inferred`,
  }));
  const empty = r.areas.length === 0;

  return (
    <>
      <PageHeader
        title="Knowledge at risk"
        description="Where the project depends on one person or on records nobody can confirm. Works before anyone resigns: every person and area is scored from the records."
        tryThis={{ text: `Click the tallest red tower, then “Ask ${owner} to document …” to turn the risk into an interview question.`, selector: "[data-risk-item] button" }}
        meta={
          <span>
            Records as of {fmtDate(r.asOf)} · {r.items.length} findings{r.hiddenCount ? ` · ${r.hiddenCount} facts hidden at your access level` : ""}
          </span>
        }
      />
      {empty ? (
        <Card className="px-5 py-6">
          <p className="text-[14px] text-text">Nothing to score yet.</p>
          <p className="mt-1 text-[13px] text-muted">Connect a repository (for commit ownership) and run the pipeline (for facts). The radar fills in from those records.</p>
          <Link href={`/p/${slug}/sources`} className={buttonVariants({ size: "sm", className: "mt-3" })}>
            Connect a repo
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          <RadarView
            slug={slug}
            towers={towers}
            items={r.items}
            canAct={canAct}
            actReason={canAct ? null : "Read-only role. The owner, reviewer or successor can act on findings."}
          />
          <Card data-testid="people-concentration">
            <CardHeader
              icon={<Users />}
              title={
                <span className="inline-flex items-center gap-1.5">
                  Knowledge concentration by person
                  <Info text="0-100. Sole-owner code (60%), facts they own that rest on one source or none (25%), secrets they posted (15%). High = start their handover first." />
                </span>
              }
              description="Everyone on the project, not only the person leaving"
            />
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="text-left text-xs text-subtle">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Person</th>
                    <th className="w-[160px] px-4 py-2 font-medium">Concentration</th>
                    <th className="px-4 py-2 font-medium">Only they know</th>
                    <th className="px-4 py-2 font-medium">Hand over first</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.people.map((p) => (
                    <tr key={p.name} data-person={p.name}>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={p.name} size={20} />
                          <span className="text-text">{p.name}</span>
                        </span>
                        <div className="pl-7 text-xs text-subtle">{p.roleTitle}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 rounded-full bg-surface-2">
                            <span
                              className={cn("block h-1.5 rounded-full", p.concentration >= 60 ? "bg-conflicting" : p.concentration >= 30 ? "bg-primary" : "bg-verified")}
                              style={{ width: `${Math.max(3, p.concentration)}%` }}
                            />
                          </span>
                          <span className="w-7 text-right font-mono text-xs text-text">{p.concentration}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">
                        {[p.soleAreas.length ? `code: ${p.soleAreas.join(", ")}` : null, p.weakFacts ? `${p.weakFacts} unconfirmed facts` : null, p.secrets ? `${p.secrets} secret${p.secrets === 1 ? "" : "s"}` : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">{p.first.length ? p.first.map((i) => i.title).join(" · ") : "Nothing urgent"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
