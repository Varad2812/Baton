import { createHash } from "node:crypto";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { getHandoverView } from "@/lib/views/handover";
import { fmtDateTime, fmtDateYear, GRADE_LABEL, GRADE_ORDER, ROLE_LABEL } from "@/lib/views/format";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/components/handover/handover-actions";

export default async function ReceiptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor] = await Promise.all([getProject(slug), getActor()]);
  const v = await getHandoverView(project.id, actor);
  const h = v.handover;
  const claims = v.sections.flatMap((s) => s.claims);
  const digest = createHash("sha256")
    .update(JSON.stringify({ role: actor.role, claims: claims.map((c) => [c.id, c.grade]), chunks: [...v.sourceChunkIds].sort() }))
    .digest("hex");
  const byGrade = GRADE_ORDER.map((g) => [g, claims.filter((c) => c.grade === g).length] as const);
  const generated = new Date();

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/p/${slug}/handover`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-3.5" /> Back to handover
        </Link>
        <PrintButton />
      </div>
      <article className="receipt rounded-lg border border-border bg-surface px-10 py-9 print:border-0 print:px-0 print:py-0">
        <header className="flex items-start justify-between border-b border-border pb-5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">Baton · handover receipt</p>
            <h1 className="mt-2 font-serif text-[28px] font-semibold leading-tight">{project.name}</h1>
            <p className="mt-1 text-[13px] text-muted">{project.description}</p>
          </div>
          <div className="text-right font-mono text-[11px] text-subtle">
            <p>{v.latestVersion ? `v${v.latestVersion.number}` : "DRAFT PREVIEW"}</p>
            <p>{fmtDateTime(generated)}</p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 border-b border-border py-5 text-[13px]">
          {[
            ["From", h ? `${h.from.name} · ${h.from.roleTitle}` : "—"],
            ["To", h ? `${h.to.name} · ${h.to.roleTitle}` : "—"],
            ["Reviewer", h ? `${h.reviewer.name} · ${h.reviewer.roleTitle}` : "—"],
            ["Status", v.latestVersion ? `Approved by ${v.latestVersion.approvedBy}, ${fmtDateYear(v.latestVersion.approvedAt)}` : "Not yet approved"],
            ["Compiled for", `${actor.name} (${ROLE_LABEL[actor.role]})`],
            ["Hidden at this role", `${v.hiddenCount} claim${v.hiddenCount === 1 ? "" : "s"}`],
            ["Records as of", v.asOfLabel],
            ["Source chunks cited", String(v.sourceChunkIds.length)],
          ].map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-subtle">{k}</dt>
              <dd className="text-right text-text">{val}</dd>
            </div>
          ))}
        </dl>

        <section className="border-b border-border py-5">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-subtle">Contents</h2>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-subtle">
                <th className="pb-1.5 font-medium">Section</th>
                <th className="pb-1.5 text-right font-medium">Claims</th>
                <th className="pb-1.5 text-right font-medium">Verified</th>
                <th className="pb-1.5 text-right font-medium">Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {v.sections.map((s) => (
                <tr key={s.name} className="border-t border-border/60">
                  <td className="py-1.5 text-text">{s.name}</td>
                  <td className="py-1.5 text-right font-mono">{s.claims.length}</td>
                  <td className="py-1.5 text-right font-mono">{s.claims.filter((c) => c.grade === "VERIFIED").length}</td>
                  <td className="py-1.5 text-right font-mono text-subtle">{v.acknowledged.includes(s.name) ? "yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 font-mono text-[11px] text-subtle">
            {byGrade.map(([g, n]) => `${GRADE_LABEL[g]} ${n}`).join(" · ")}
          </p>
        </section>

        <section className="border-b border-border py-5">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-subtle">Open items carried into the plan</h2>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
            {v.plan7.slice(0, 10).map((p) => (
              <li key={p.id}>{p.title}</li>
            ))}
          </ol>
        </section>

        <section className="py-5">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-subtle">Integrity</h2>
          <p className="break-all font-mono text-[11px] leading-relaxed text-muted">sha256 {digest}</p>
          <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-subtle">
            chunks: {[...v.sourceChunkIds].sort().join(" ")}
          </p>
          <div className="mt-8 grid grid-cols-3 gap-8 text-xs text-subtle">
            {[h?.from.name, h?.reviewer.name, h?.to.name].map((n, i) => (
              <div key={i} className="border-t border-border pt-2">
                {n} · {["handed over", "approved", "received"][i]}
              </div>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
