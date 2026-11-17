import Link from "next/link";
import { prisma } from "@/lib/db";
import { health } from "@/lib/server/health";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Status · Baton" };

function Row({ label, ok, value }: { label: string; ok: boolean | null; value: string }) {
  return (
    <div className="grid grid-cols-[180px_16px_minmax(0,1fr)] items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-0">
      <span className="text-muted">{label}</span>
      <span className={cn("size-2 rounded-full", ok === null ? "bg-subtle" : ok ? "bg-verified" : "bg-conflicting")} aria-hidden />
      <span className="font-mono text-xs text-text">{value}</span>
    </div>
  );
}

export default async function StatusPage() {
  const h = await health();
  const kinds = h.db ? await prisma.project.groupBy({ by: ["kind"], _count: true }).catch(() => []) : [];
  const count = (k: string) => kinds.find((x) => x.kind === k)?._count ?? 0;
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="font-serif text-[15px] font-semibold text-text">
        Baton
      </Link>
      <h1 className="mt-6 font-serif text-[26px] font-semibold text-text">Status</h1>
      <p className="mt-1 text-[13px] text-muted">What this server can do right now. The demo never needs a model: without one, answers come from the verified cache and the offline engine.</p>
      <div className="mt-6 rounded-lg border border-border bg-surface" data-testid="status">
        <Row label="Database" ok={h.db} value={h.db ? `reachable · ${h.dbMs} ms` : "not reachable"} />
        <Row label="AI engine 1: Groq" ok={h.llm.groq ? true : null} value={h.llm.groq ?? "not configured"} />
        <Row label="AI engine 2: Gemini" ok={h.llm.gemini ? true : null} value={h.llm.gemini ?? "not configured or disabled"} />
        <Row label="Fallback: offline / rules" ok value="always available" />
        <Row label="Slack demo workspace" ok={h.slack.demo || null} value={h.slack.demo ? "configured" : "not configured (export ZIP upload still works)"} />
        <Row label="Slack sign-in (OAuth)" ok={h.slack.oauth || null} value={h.slack.oauth ? "configured" : "not configured"} />
        <Row label="GitHub" ok={null} value={`${h.github.token ? "token set" : "anonymous (60 requests/hour)"} · webhook ${h.github.webhook ? "on" : "off"}`} />
        <Row label="Projects" ok={null} value={`${count("TEMPLATE")} template · ${count("SANDBOX")} visitor copies · ${count("STANDARD")} other`} />
        <Row label="Version" ok={null} value={`${h.version} · up ${Math.round(h.uptimeS / 60)} min`} />
      </div>
      <p className="mt-3 text-xs text-subtle">
        Machine-readable: <Link href="/api/health" className="font-mono text-muted hover:text-text">/api/health</Link>
      </p>
    </main>
  );
}
