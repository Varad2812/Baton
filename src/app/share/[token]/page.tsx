import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { CompiledView } from "@/lib/handover/compile";
import { fmtDate, fmtDateTime, GRADE_LABEL } from "@/lib/views/format";
import { verifyShare } from "@/lib/share";
import { GradeChip } from "@/components/ui/grade-chip";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared handover · Baton", robots: { index: false } };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = verifyShare(token);
  if (!t) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-serif text-[24px] font-semibold text-text">This link is invalid or has expired</h1>
        <p className="mt-2 text-[13px] text-muted">Share links last 7 days. Ask the person who sent it for a new one.</p>
        <Link href="/" className="mt-4 inline-block text-[13px] text-primary hover:underline">Go to Baton</Link>
      </main>
    );
  }
  const v = await prisma.handoverVersion.findFirst({
    where: { number: t.version, handover: { projectId: t.projectId } },
    include: { approvedBy: { select: { name: true } }, roleViews: { where: { role: "INCOMING" } }, handover: { include: { from: true, to: true, project: { select: { name: true } } } } },
  });
  const rv = v?.roleViews[0];
  if (!v || !rv) notFound();
  const c = rv.compiled as unknown as CompiledView;
  const h = v.handover;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10" data-testid="shared-handover">
      <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">Read-only shared handover · {h.project.name}</p>
      <h1 className="mt-1 font-serif text-[28px] font-semibold text-text">
        {h.from.name} <span className="text-subtle">→</span> {h.to.name}
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        Approved v{v.number}{v.approvedBy ? ` by ${v.approvedBy.name}` : ""} · {fmtDateTime(v.approvedAt)} · the successor&apos;s view{rv.hiddenCount ? ` · ${rv.hiddenCount} restricted facts not included` : ""} · link expires {fmtDate(t.expires)}
      </p>
      <section className="mt-6">
        <h2 className="font-serif text-[18px] font-semibold text-text">Overview</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-text">{c.overview}</p>
      </section>
      {[["First 7 days", c.plan7], ["First 30 days", c.plan30]].map(([title, items]) => (
        <section key={title as string} className="mt-6">
          <h2 className="font-serif text-[18px] font-semibold text-text">{title as string}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-text">
            {(items as CompiledView["plan7"]).map((p, i) => (
              <li key={i}>{p.text}</li>
            ))}
          </ul>
        </section>
      ))}
      {c.sections.map((s) => (
        <section key={s.section} className="mt-6">
          <h2 className="font-serif text-[18px] font-semibold text-text">{s.section}</h2>
          <ul className="mt-2 space-y-2">
            {s.items.map((f) => (
              <li key={f.id} className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-text">
                  <GradeChip grade={f.grade} /> {f.title}
                </div>
                <p className="mt-1 text-[13px] text-muted">{f.statement}</p>
                <p className="mt-1 font-mono text-[11px] text-subtle">
                  {GRADE_LABEL[f.grade]} · {f.evidence.filter((e) => e.relation === "SUPPORTS").map((e) => e.locator || e.sourceTitle).slice(0, 3).join(" · ")}
                </p>
              </li>
            ))}
            {s.hidden > 0 && <li className="text-xs text-subtle">{s.hidden} restricted fact{s.hidden === 1 ? "" : "s"} not included.</li>}
          </ul>
        </section>
      ))}
      <p className="mt-10 text-xs text-subtle">
        Made with <Link href="/" className="text-muted hover:text-text">Baton</Link>. Every fact was checked against an exact quote in its source before approval.
      </p>
    </main>
  );
}
