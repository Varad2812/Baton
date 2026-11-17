// Handover exports for the viewer's own role view (approved version, else the draft, labelled):
// Markdown and JSON with numbered citations, exact quotes and links back to the source
// (GitHub/Slack permalink when the record has one). Nothing outside the role view is included.
import type { Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { linkAt } from "@/lib/pipeline/normalise";
import { getHandoverPage } from "@/lib/views/handover";
import { GRADE_LABEL } from "@/lib/views/format";
import { findQuote } from "@/lib/pipeline/quotes";

export type ExportCitation = { n: number; label: string; source: string; quote: string; url: string | null };

export async function buildExport(actor: Actor, project: { id: string; name: string; slug: string }, appUrl: string) {
  const v = await getHandoverPage(project.id, actor);
  if (!v) return null;
  const chunkIds = [...new Set(v.sections.flatMap((s) => s.claims.flatMap((c) => c.citations.map((x) => x.chunkId))))];
  const chunks = await prisma.chunk.findMany({ where: { id: { in: chunkIds } }, select: { id: true, text: true, meta: true, source: { select: { title: true, uri: true } } } });
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const cites: ExportCitation[] = [];
  const keyOf = new Map<string, number>();
  const cite = (x: { label: string; chunkId: string; quote: string }) => {
    const k = `${x.chunkId}|${x.quote}`;
    if (!keyOf.has(k)) {
      const ch = byId.get(x.chunkId);
      const links = (ch?.meta as { links?: { at: number; url: string }[] } | null)?.links;
      const url = linkAt(links, ch ? (findQuote(ch.text, x.quote)?.start ?? 0) : 0) ?? (ch?.source.uri?.startsWith("http") ? ch.source.uri : null);
      cites.push({ n: cites.length + 1, label: x.label, source: ch?.source.title ?? x.label, quote: x.quote, url });
      keyOf.set(k, cites.length);
    }
    return keyOf.get(k)!;
  };

  const status = v.mode === "approved" && v.version ? `Approved v${v.version.number} by ${v.version.approvedBy ?? "the reviewer"}` : "Draft — not yet approved";
  const sections = v.sections.map((s) => ({
    section: s.name,
    hiddenFacts: s.hidden,
    facts: s.claims.map((c) => ({ id: c.id, title: c.title, statement: c.statement, grade: GRADE_LABEL[c.grade], owner: c.owner, date: c.date, testimony: c.fromTestimony, citations: c.citations.map(cite) })),
  }));
  const plan = (items: typeof v.plan7) => items.map((p) => ({ text: p.text, citations: p.citations.map(cite) }));
  const json = {
    project: project.name,
    handover: { from: v.handover.from.name, to: v.handover.to.name, reviewer: v.handover.reviewer.name },
    status,
    compiledFor: { name: actor.name, role: actor.role },
    hiddenFacts: v.hiddenCount,
    overview: v.overview,
    plan7: plan(v.plan7),
    plan30: plan(v.plan30),
    sections,
    citations: cites,
    exportedAt: new Date().toISOString(),
    link: `${appUrl}/p/${project.slug}/handover`,
  };

  const sup = (ns: number[]) => (ns.length ? ` ${ns.map((n) => `[${n}]`).join("")}` : "");
  const md: string[] = [
    `# ${project.name}: handover ${json.handover.from} → ${json.handover.to}`,
    "",
    `${status} · reviewed by ${json.handover.reviewer} · compiled for ${actor.name} (${actor.role.toLowerCase()})${v.hiddenCount ? ` · ${v.hiddenCount} facts hidden at this access level` : ""}`,
    "",
    "## Overview",
    "",
    v.overview,
    "",
    "## First 7 days",
    "",
    ...json.plan7.map((p) => `- ${p.text}${sup(p.citations)}`),
    "",
    "## First 30 days",
    "",
    ...json.plan30.map((p) => `- ${p.text}${sup(p.citations)}`),
    "",
  ];
  for (const s of sections) {
    md.push(`## ${s.section}`, "");
    for (const f of s.facts) md.push(`- **${f.title}** (${f.grade}${f.testimony ? ", testimony" : ""}${f.owner ? `, ${f.owner}` : ""})${sup(f.citations)}  `, `  ${f.statement}`);
    if (s.hiddenFacts) md.push(`- _${s.hiddenFacts} fact${s.hiddenFacts === 1 ? "" : "s"} hidden at your access level_`);
    md.push("");
  }
  md.push("## Sources", "");
  for (const c of cites) md.push(`${c.n}. ${c.label} (${c.source}): “${c.quote}”${c.url ? ` ${c.url}` : ""}`);
  md.push("", `Exported from Baton ${json.exportedAt.slice(0, 10)} · ${json.link}`, "");
  return { json, markdown: md.join("\n") };
}
