import type { TimelineEntry } from "@/lib/views/dashboard";
import { GRADE_COLOR } from "@/lib/views/format";

const START = new Date("2026-01-01T00:00:00+05:30").getTime();
const END = new Date("2026-05-04T00:00:00+05:30").getTime();
const W = 800;
const H = 176;
const BASE = 92;
const PAD = 16;

const x = (d: Date) => PAD + ((d.getTime() - START) / (END - START)) * (W - PAD * 2);

export function shortChange(fromTitle: string | undefined, title: string, topic: string): string {
  const m = title.match(/from (.+?) to (.+?)(?: on |$)/i);
  if (m) return `${m[1].replace(/ SMTP$/, "")} → ${m[2]}`;
  return topic.replace(/^(sup|cf)-/, "").replace(/_/g, " ");
}

/** Horizontal Jan–May track: decisions as dots, supersessions as arcs above, contradictions as dashed arcs below. */
export function DecisionTrack({ entries, asOf }: { entries: TimelineEntry[]; asOf: Date }) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May"].map((m, i) => ({
    label: m,
    x: x(new Date(`2026-${String(i + 1).padStart(2, "0")}-01T00:00:00+05:30`)),
  }));
  const fest = x(new Date("2026-04-30T00:00:00+05:30"));
  const today = x(asOf);
  // Longer spans get taller arcs so labels never collide.
  const rankOf = (kind: TimelineEntry["kind"]) =>
    entries
      .filter((e) => e.kind === kind)
      .map((e) => ({ e, span: e.date.getTime() - (e.fromDate?.getTime() ?? e.date.getTime()) }))
      .sort((a, b) => a.span - b.span)
      .map((v, rank) => ({ e: v.e, rank }));
  const arcs = [...rankOf("supersedes"), ...rankOf("conflict")];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Decision timeline January to May 2026">
      <defs>
        <marker id="arrow-ok" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--grade-verified)" />
        </marker>
      </defs>
      {months.map((m) => (
        <g key={m.label}>
          <line x1={m.x} x2={m.x} y1={BASE - 4} y2={BASE + 4} stroke="var(--border)" />
          <text x={m.x + 3} y={H - 6} fontSize="10" fill="var(--subtle)" fontFamily="var(--font-jetbrains)">
            {m.label}
          </text>
        </g>
      ))}
      <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--border)" />
      {/* fest window */}
      <rect x={fest} y={20} width={x(new Date("2026-05-03T00:00:00+05:30")) - fest} height={BASE - 20} fill="var(--primary)" opacity={0.1} />
      <text x={fest + 3} y={30} fontSize="9.5" fill="var(--primary)" fontFamily="var(--font-jetbrains)">fest</text>
      <line x1={today} x2={today} y1={12} y2={BASE + 6} stroke="var(--muted)" strokeDasharray="2 3" />
      <text x={today - 4} y={14} fontSize="9.5" fill="var(--muted)" textAnchor="end" fontFamily="var(--font-jetbrains)">
        handover {asOf.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}
      </text>

      {entries.map((e) => {
        if (e.kind !== "decision") return null;
        return (
          <circle key={e.id} cx={x(e.date)} cy={BASE} r={3} fill={GRADE_COLOR[e.grade]}>
            <title>{e.title}</title>
          </circle>
        );
      })}
      {arcs.map(({ e, rank }) => {
        if (e.kind === "decision") {
          return (
            <circle key={e.id} cx={x(e.date)} cy={BASE} r={3} fill={GRADE_COLOR[e.grade]}>
              <title>{e.title}</title>
            </circle>
          );
        }
        const x1 = e.fromDate ? x(e.fromDate) : x(e.date) - 20;
        const x2 = x(e.date);
        const up = e.kind === "supersedes";
        const h = 30 + rank * 30;
        const cy = up ? BASE - h : BASE + h;
        const color = up ? "var(--grade-verified)" : "var(--grade-conflicting)";
        const label = up ? shortChange(e.fromTitle, e.title, e.id) : e.id.replace(/^cf-/, "").replace(/_/g, " ");
        return (
          <g key={e.id}>
            <path
              d={`M${x1},${BASE} Q${(x1 + x2) / 2},${cy} ${x2},${BASE}`}
              fill="none"
              stroke={color}
              strokeWidth={1.25}
              strokeDasharray={up ? undefined : "3 3"}
              markerEnd={up ? "url(#arrow-ok)" : undefined}
            />
            <circle cx={x1} cy={BASE} r={3} fill="var(--surface)" stroke={up ? "var(--grade-missing)" : color} strokeWidth={1.25} />
            <circle cx={x2} cy={BASE} r={3.5} fill={color} />
            <text
              x={(x1 + x2) / 2}
              y={up ? BASE - h / 2 - 4 : BASE + h / 2 + 11}
              fontSize="10"
              textAnchor="middle"
              fill={up ? "var(--text)" : "var(--grade-conflicting)"}
              fontFamily="var(--font-inter)"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
