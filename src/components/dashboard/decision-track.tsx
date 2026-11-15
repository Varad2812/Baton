import type { TimelineEntry } from "@/lib/views/dashboard";
import { GRADE_COLOR } from "@/lib/views/format";

const W = 800;
const H = 176;
const BASE = 92;
const PAD = 16;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST = 5.5 * 3600_000;

/** First instant of the IST month containing `t`, `add` months later. */
function monthStart(t: number, add = 0): number {
  const d = new Date(t + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1) - IST;
}

export function shortChange(fromTitle: string | undefined, title: string, topic: string): string {
  const m = title.match(/from (.+?) to (.+?)(?: on |$)/i);
  if (m) return `${m[1].replace(/ SMTP$/, "")} → ${m[2]}`;
  return topic.replace(/^(sup|cf)-/, "").replace(/_/g, " ");
}

export type TrackMarker = { label: string; from: Date; to: Date };

/** Horizontal track over the project's own record range: decisions as dots, supersessions as arcs above, contradictions as dashed arcs below. */
export function DecisionTrack({
  entries,
  asOf,
  firstRecord,
  marker,
}: {
  entries: TimelineEntry[];
  asOf: Date;
  firstRecord: Date;
  marker?: TrackMarker;
}) {
  const dates = [firstRecord.getTime(), asOf.getTime(), ...entries.flatMap((e) => [e.date.getTime(), e.fromDate?.getTime() ?? e.date.getTime()])];
  if (marker) dates.push(marker.to.getTime());
  const START = monthStart(Math.min(...dates));
  const END = monthStart(Math.max(...dates), 1);
  const x = (d: Date) => PAD + ((d.getTime() - START) / (END - START)) * (W - PAD * 2);
  const months: { label: string; x: number }[] = [];
  for (let t = START, i = 0; t < END && i < 36; t = monthStart(t, 1), i++) {
    const m = new Date(t + IST);
    months.push({ label: `${MONTHS[m.getUTCMonth()]}${m.getUTCMonth() === 0 || i === 0 ? ` ${m.getUTCFullYear()}` : ""}`, x: x(new Date(t)) });
  }
  const spanLabel = `${months[0]?.label ?? ""} to ${MONTHS[new Date(END - 1 + IST).getUTCMonth()]} ${new Date(END - 1 + IST).getUTCFullYear()}`;
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
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Decision timeline ${spanLabel}`}>
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
      {marker && (
        <>
          <rect x={x(marker.from)} y={20} width={Math.max(2, x(marker.to) - x(marker.from))} height={BASE - 20} fill="var(--primary)" opacity={0.1} />
          <text x={x(marker.from) + 3} y={30} fontSize="9.5" fill="var(--primary)" fontFamily="var(--font-jetbrains)">{marker.label}</text>
        </>
      )}
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
