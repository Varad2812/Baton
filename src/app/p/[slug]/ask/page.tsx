import Link from "next/link";
import { Lock, MessageSquareQuote, ShieldCheck } from "lucide-react";
import { getActor, projectPersonas } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { loadAskCorpus } from "@/lib/ask/corpus";
import { suggestionsFor } from "@/lib/ask/suggest";
import { ASK_SECTION } from "@/lib/ask/service";
import { loadClaims } from "@/lib/views/claims";
import { getProject } from "@/lib/views/project";
import { fmtDateTime } from "@/lib/views/format";
import { AskBox } from "@/components/ask/ask-box";
import { EvidenceDrawer } from "@/components/ledger/evidence-drawer";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export default async function AskPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const [project, actor, ppl] = await Promise.all([getProject(slug), getActor(slug), projectPersonas(slug)]);
  const [corpus, claims, followUps] = await Promise.all([
    loadAskCorpus(actor, project.id),
    loadClaims(project.id, actor),
    prisma.followUp.findMany({
      where: { handover: { projectId: project.id }, section: ASK_SECTION },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, question: true, answer: true, answeredAt: true, createdAt: true, askedBy: { select: { name: true } } },
    }),
  ]);
  const owner = ppl.meera.name.split(" ")[0];
  const successor = ppl.arjun.name.split(" ")[0];
  const approved = corpus.mode === "approved";
  const empty = corpus.claims.length === 0;

  return (
    <>
      <PageHeader
        title="Ask the handover"
        description={`Questions about the project, answered only from the ${approved ? "approved" : "draft"} handover your role may see. Every sentence cites its source; if the records don't say, you can ask ${owner}.`}
        tryThis={{ text: "Click a suggested question, then click a numbered citation to see the exact quote.", selector: "[data-ask-suggestion]" }}
        meta={
          approved ? (
            <Badge variant="success" size="sm">
              Answers from v{corpus.version}, approved by {corpus.approvedBy}
            </Badge>
          ) : (
            <Badge variant="primary" size="sm">
              Draft — not yet approved
            </Badge>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {empty ? (
            <Card className="px-5 py-6">
              <p className="text-[14px] text-text">There is nothing to answer from yet.</p>
              <p className="mt-1 text-[13px] text-muted">
                {claims.hiddenCount > 0
                  ? `Every fact in this project is outside what your role may see (${claims.hiddenCount} hidden).`
                  : "Connect sources and run the pipeline first; answers are built from the facts it finds."}
              </p>
              <Link href={`/p/${slug}/sources`} className={buttonVariants({ size: "sm", className: "mt-3" })}>
                Go to Sources
              </Link>
            </Card>
          ) : (
            <AskBox slug={slug} successor={successor} suggestions={suggestionsFor(corpus.claims)} openInPlace />
          )}
        </div>
        <aside className="space-y-3">
          <Card>
            <CardHeader icon={<ShieldCheck />} title="How answers work" />
            <ul className="space-y-2 px-4 pb-4 text-[13px] text-muted">
              <li>
                Searches <span className="font-mono text-text">{corpus.claims.length}</span> facts and{" "}
                <span className="font-mono text-text">{corpus.chunks.length}</span> source excerpts from the {approved ? `approved v${corpus.version}` : "draft"} handover.
              </li>
              <li>Each sentence must cite a numbered source. Sentences without a valid citation, or with a quote that is not in the source, are removed before you see them.</li>
              <li>Every answer is scanned for restricted content and canary strings; a hit turns the answer into a refusal.</li>
              <li>
                Not in the handover? You get “This isn&apos;t in the approved handover” and {successor} can send the question to {owner}. The answer becomes testimony and can then be asked here.
              </li>
            </ul>
          </Card>
          <Card>
            <CardHeader icon={<Lock />} title="Your access" />
            <p className="px-4 pb-4 text-[13px] text-muted">
              Viewing as <span className="text-text">{actor.name}</span>.{" "}
              {corpus.hiddenCount > 0 ? (
                <>
                  <span className="font-mono text-text">{corpus.hiddenCount}</span> facts are hidden at your access level and are never searched.
                </>
              ) : (
                "Nothing is hidden at your access level."
              )}
            </p>
          </Card>
          <Card>
            <CardHeader icon={<MessageSquareQuote />} title={`Asked ${owner} from here`} />
            {followUps.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-muted">None yet. When a question isn&apos;t in the handover, {successor} can send it to {owner} in one click.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border" data-testid="ask-followups">
                {followUps.map((f) => (
                  <li key={f.id} className="px-4 py-2.5 text-[13px]">
                    <p className="text-text">{f.question}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {f.askedBy.name} · {fmtDateTime(f.createdAt)} ·{" "}
                      {f.answer ? <span className="text-verified">answered, now testimony</span> : <span className="text-primary">waiting for {owner}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
      <EvidenceDrawer slug={slug} projectId={project.id} actor={actor} visible={claims.visible} claimId={typeof sp.claim === "string" ? sp.claim : undefined} />
    </>
  );
}
